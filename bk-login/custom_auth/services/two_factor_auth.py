"""
Servicio de autenticación de dos factores (2FA)
Maneja TOTP devices y verificación de códigos
"""
import pyotp
from typing import Optional, Tuple
from django.contrib.auth.models import User
from django.core.cache import cache
from django_otp.plugins.otp_totp.models import TOTPDevice
from custom_auth.exceptions import ValidationError, UserNotFoundError
from utils.generate import generate_2fa_device
from utils.logger_generico import _log_warn
from utils.validate import validate_2fa_device


class TwoFactorAuthService:
    """
    Servicio para gestión de autenticación de dos factores
    """

    # Configuración de rate limiting
    MAX_ATTEMPTS = 5
    LOCK_TIMEOUT = 300  # 5 minutos


    @staticmethod
    def validate_2fa_input(code: str, username: str) -> None:
        """
        Valida que el código y username existan

        Args:
            code: Código 2FA
            username: Username del usuario

        Raises:
            ValidationError: Si faltan datos
        """
        if not code or not username:
            _log_warn("Intento de 2FA sin código o username", level="warning")
            raise ValidationError(
                message="Código y usuario son requeridos",
                code="MISSING_2FA_DATA"
            )

    @staticmethod
    def get_user_by_username(username: str) -> User:
        """
        Obtiene un usuario por username

        Args:
            username: Username del usuario

        Returns:
            Instancia de User

        Raises:
            UserNotFoundError: Si el usuario no existe
        """
        try:
            return User.objects.get(username=username)
        except User.DoesNotExist:
            _log_warn(f"Usuario no encontrado para 2FA: {username}", level="warning")
            # No exponer que el usuario no existe
            raise ValidationError(
                message="Credenciales inválidas",
                code="INVALID_2FA_CREDENTIALS"
            )

    @staticmethod
    def check_rate_limit(user: User) -> None:
        """
        Verifica si el usuario está bloqueado por múltiples intentos

        Args:
            user: Instancia de User

        Raises:
            ValidationError: Si excedió los intentos permitidos
        """
        cache_key = f'2fa_attempts_{user.id}'
        attempts = cache.get(cache_key, 0)

        if attempts >= TwoFactorAuthService.MAX_ATTEMPTS:
            _log_warn(f"Usuario {user.username} bloqueado por múltiples "
                f"intentos 2FA ({attempts})", level="warning")
            raise ValidationError(
                message="Demasiados intentos. Intente más tarde",
                code="TOO_MANY_2FA_ATTEMPTS",
                status_code=429
            )

    @staticmethod
    def increment_failed_attempts(user: User) -> None:
        """
        Incrementa el contador de intentos fallidos

        Args:
            user: Instancia de User
        """
        cache_key = f'2fa_attempts_{user.id}'
        attempts = cache.get(cache_key, 0)
        cache.set(cache_key, attempts + 1, timeout=TwoFactorAuthService.LOCK_TIMEOUT)
        _log_warn(f"Intento 2FA fallido para {user.username} "
            f"({attempts + 1}/{TwoFactorAuthService.MAX_ATTEMPTS})", level="info")

    @staticmethod
    def clear_failed_attempts(user: User) -> None:
        """
        Limpia el contador de intentos fallidos

        Args:
            user: Instancia de User
        """
        cache_key = f'2fa_attempts_{user.id}'
        cache.delete(cache_key)
        _log_warn(f"Intentos 2FA limpiados para {user.username}", level="debug")

    @staticmethod
    def get_or_create_device(user: User) -> Tuple[TOTPDevice, bool]:
        """
        Obtiene el dispositivo 2FA del usuario o crea uno nuevo

        Args:
            user: Instancia de User

        Returns:
            Tupla (device, has_confirmed_device)
            - device: TOTPDevice
            - has_confirmed_device: True si el usuario ya tenía un dispositivo confirmado
        """
        # Buscar dispositivo confirmado
        device = TOTPDevice.objects.filter(user=user, confirmed=True).first()

        if device:
            _log_warn(f"Dispositivo 2FA confirmado encontrado para {user.username}", level="debug")
            return device, True

        # Buscar dispositivo sin confirmar (el más reciente)
        device = TOTPDevice.objects.filter(
            user=user,
            confirmed=False
        ).order_by('-id').first()

        if device:
            _log_warn(f"Dispositivo 2FA sin confirmar encontrado para {user.username}", level="debug")
            return device, False

        # No hay dispositivo, esto no debería pasar si se llamó desde el flujo correcto
        _log_warn(f"No se encontró dispositivo 2FA para {user.username}", level="warning")
        raise ValidationError(
            message="Dispositivo 2FA no encontrado",
            code="NO_2FA_DEVICE",
            status_code=404
        )

    @staticmethod
    def verify_code(device: TOTPDevice, code: str) -> bool:
        """
        Verifica un código TOTP

        Args:
            device: TOTPDevice a verificar
            code: Código TOTP ingresado por el usuario

        Returns:
            True si el código es válido, False en caso contrario
        """
        try:
            totp = pyotp.TOTP(device.key)
            is_valid = totp.verify(code, valid_window=1)

            if is_valid:
                _log_warn(f"Código 2FA válido para dispositivo {device.id}", level="info")
            else:
                _log_warn(f"Código 2FA inválido para dispositivo {device.id}", level="warning")

            return is_valid

        except Exception as e:
            _log_warn(f"Error verificando código 2FA: {str(e)}", level="error")
            return False

    @staticmethod
    def confirm_device(device: TOTPDevice) -> None:
        """
        Confirma un dispositivo 2FA

        Args:
            device: TOTPDevice a confirmar
        """
        if not device.confirmed:
            device.confirmed = True
            device.save(update_fields=['confirmed'])
            _log_warn(f"Dispositivo 2FA confirmado: {device.id}", level="info")

    @staticmethod
    def validate_and_verify_2fa(user: User, code: str) -> TOTPDevice:
        """
        Proceso completo de validación y verificación de 2FA

        Args:
            user: Instancia de User
            code: Código 2FA

        Returns:
            TOTPDevice verificado y confirmado

        Raises:
            ValidationError: Si el código es inválido o hay problemas
        """
        # Verificar rate limiting
        TwoFactorAuthService.check_rate_limit(user)

        # Obtener dispositivo
        device, has_confirmed = TwoFactorAuthService.get_or_create_device(user)

        # Verificar código
        is_valid = TwoFactorAuthService.verify_code(device, code)

        if not is_valid:
            # Incrementar intentos fallidos
            TwoFactorAuthService.increment_failed_attempts(user)

            raise ValidationError(
                message="Código inválido o expirado",
                code="INVALID_2FA_CODE"
            )

        # Código válido - confirmar dispositivo si no está confirmado
        TwoFactorAuthService.confirm_device(device)

        # Limpiar intentos fallidos
        TwoFactorAuthService.clear_failed_attempts(user)

        _log_warn(f"Verificación 2FA exitosa para usuario: {user.username}", level="info")

        return device

    @staticmethod
    def check_user_has_device(user: User) -> Tuple[bool, Optional[str]]:
        """
        Verifica si el usuario tiene un dispositivo 2FA

        Args:
            user: Instancia de User

        Returns:
            Tupla (has_device, qr_code)
            - has_device: True si tiene dispositivo confirmado
            - qr_code: QR code si no tiene dispositivo (para configurar)
        """
        has_device = validate_2fa_device(user)

        if not has_device:
            # Generar QR code para configurar 2FA
            qr_code = generate_2fa_device(user)
            _log_warn(f"QR code generado para usuario: {user.username}", level="info")
            return False, qr_code

        _log_warn(f"Usuario {user.username} tiene dispositivo 2FA configurado", level="debug")
        return True, None
