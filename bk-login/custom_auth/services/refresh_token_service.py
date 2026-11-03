"""
Servicio de refresh de tokens según arquitectura de seguridad mejorada
Maneja creación, validación y rotación de refresh tokens con fingerprint
"""
import secrets
from datetime import datetime, timedelta
from typing import Optional
from django.contrib.auth.models import User
from django.utils import timezone
from custom_auth.models.models_global import RefreshToken
from custom_auth.exceptions import InvalidCredentialsError, ValidationError
from utils.logger_generico import _log_warn

class RefreshTokenService:
    """
    Servicio para gestionar refresh tokens seguros con:
    - Vinculación por fingerprint
    - Rotación automática
    - Expiración de larga duración
    """

    @staticmethod
    def generate_secure_token() -> str:
        """
        Genera un token de refresco seguro y aleatorio

        Returns:
            Token único de 64 caracteres hexadecimales
        """
        return secrets.token_hex(32)

    @staticmethod
    def create_refresh_token(
        user: User,
        fingerprint: str,
        exp_days: int = 30
    ) -> RefreshToken:
        """
        Crea un nuevo refresh token asociado a un usuario y dispositivo

        Args:
            user: Usuario propietario del token
            fingerprint: Fingerprint del dispositivo
            exp_days: Días de expiración (default: 15)

        Returns:
            Instancia de RefreshToken creada

        Raises:
            ValidationError: Si faltan datos requeridos
        """
        if not fingerprint:
            raise ValidationError(
                message="El fingerprint es requerido",
                code="MISSING_FINGERPRINT",
                status_code=400
            )

        try:
            # Generar token único
            token = RefreshTokenService.generate_secure_token()

            # Calcular fecha de expiración
            expires_at = timezone.now() + timedelta(days=exp_days)

            # Crear entrada en BD
            refresh_token = RefreshToken.objects.create(
                user=user,
                token=token,
                fingerprint=fingerprint,
                expires_at=expires_at,
                is_active=True
            )

            _log_warn(f"Refresh token creado para usuario {user.username} "
                f"(expira en {exp_days} días)", level="info")

            return refresh_token

        except Exception as e:
            _log_warn(f"Error creando refresh token: {str(e)}", level="error")
            raise

    @staticmethod
    def validate_and_rotate_token(
        token: str,
        fingerprint: str = None,
        require_fingerprint: bool = True
    ) -> RefreshToken:
        """
        Valida un refresh token y genera uno nuevo (rotación)

        Proceso:
        1. Buscar token en BD
        2. Validar fingerprint
        3. Validar expiración
        4. Eliminar token usado
        5. Crear nuevo token

        Args:
            token: Refresh token a validar
            fingerprint: Fingerprint del dispositivo
            require_fingerprint: Si debe validarse contra el fingerprint guardado

        Returns:
            Nuevo RefreshToken creado

        Raises:
            InvalidCredentialsError: Si el token es inválido o expirado
        """
        try:
            # 1. Buscar token en BD
            refresh_token = RefreshToken.objects.filter(
                token=token,
                is_active=True
            ).first()

            if not refresh_token:
                _log_warn("Intento de refresh con token inválido o inactivo", level="warning")
                raise InvalidCredentialsError(
                    message="Refresh token inválido",
                    code="INVALID_REFRESH_TOKEN"
                )

            # 2. Validar fingerprint (protección anti-robo)
            if require_fingerprint and refresh_token.fingerprint != fingerprint:
                _log_warn(f"Intento de refresh con fingerprint diferente para "
                    f"usuario {refresh_token.user.username}", level="warning")
                # Desactivar el token por seguridad
                refresh_token.is_active = False
                refresh_token.save()

                raise InvalidCredentialsError(
                    message="Fingerprint no coincide",
                    code="FINGERPRINT_MISMATCH"
                )

            # 3. Validar expiración
            if timezone.now() > refresh_token.expires_at:
                _log_warn(f"Refresh token expirado para usuario {refresh_token.user.username}", level="info")
                refresh_token.is_active = False
                refresh_token.save()

                raise InvalidCredentialsError(
                    message="Refresh token expirado",
                    code="REFRESH_TOKEN_EXPIRED"
                )

            # 4. Eliminar token usado (rotación)
            user = refresh_token.user
            token_fingerprint = (
                fingerprint if require_fingerprint else refresh_token.fingerprint
            )
            refresh_token.delete()

            _log_warn(f"Refresh token rotado para usuario {user.username}", level="info")

            # 5. Crear nuevo token
            new_refresh_token = RefreshTokenService.create_refresh_token(
                user=user,
                fingerprint=token_fingerprint,
                exp_days=30
            )

            return new_refresh_token

        except (InvalidCredentialsError, ValidationError):
            # Re-lanzar excepciones conocidas
            raise

        except Exception as e:
            _log_warn(f"Error inesperado en validación/rotación de token: {str(e)}", level="error", exc_info=True)
            raise InvalidCredentialsError(
                message="Error validando refresh token",
                code="REFRESH_TOKEN_ERROR"
            )

    @staticmethod
    def revoke_user_tokens(user: User) -> int:
        """
        Revoca todos los refresh tokens de un usuario (logout global)

        Args:
            user: Usuario cuyos tokens se revocarán

        Returns:
            Cantidad de tokens revocados
        """
        count = RefreshToken.objects.filter(
            user=user,
            is_active=True
        ).update(is_active=False)

        _log_warn(f"Revocados {count} refresh tokens para usuario {user.username}", level="info")
        return count

    @staticmethod
    def revoke_token(token: str) -> bool:
        """
        Revoca un refresh token específico

        Args:
            token: Token a revocar

        Returns:
            True si se revocó, False si no existía
        """
        try:
            refresh_token = RefreshToken.objects.filter(
                token=token,
                is_active=True
            ).first()

            if refresh_token:
                refresh_token.is_active = False
                refresh_token.save()
                _log_warn(f"Refresh token revocado para usuario {refresh_token.user.username}", level="info")
                return True

            return False

        except Exception as e:
            _log_warn(f"Error revocando token: {str(e)}", level="error")
            return False

    @staticmethod
    def cleanup_expired_tokens() -> int:
        """
        Limpia tokens expirados de la base de datos
        Útil para ejecutar como tarea periódica

        Returns:
            Cantidad de tokens eliminados
        """
        count, _ = RefreshToken.objects.filter(
            expires_at__lt=timezone.now()
        ).delete()

        if count > 0:
            _log_warn(f"Limpiados {count} refresh tokens expirados", level="info")

        return count
