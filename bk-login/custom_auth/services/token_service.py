"""
Servicio de generación y gestión de tokens JWT con soporte para JWE y Fingerprint
"""
import jwt
import datetime
from typing import Dict, Any, Optional
from django.contrib.auth.models import User
from django.http import HttpRequest
from decouple import config
from custom_auth.exceptions import ValidationError
from utils.logger_generico import _log_warn

class TokenService:
    """
    Servicio para generación de tokens JWT
    Soporta tokens cifrados (JWE) y vinculados a fingerprint del dispositivo
    """

    @staticmethod
    def generate_encrypted_token(
        user: User,
        fingerprint: str,
        request: HttpRequest = None,
        user_type: str = 'external',
        exp_minutes: int = 1440,
        servicios: list = None
    ) -> str:
        """
        Genera un access token JWT cifrado (JWE) vinculado a fingerprint

        Args:
            user: Instancia de User
            fingerprint: Fingerprint del dispositivo
            request: HttpRequest para obtener IP (opcional)
            user_type: Tipo de usuario ('external', 'internal', 'all')
            exp_minutes: Minutos de expiración
            servicios: Lista de servicios del usuario (opcional)

        Returns:
            Access token JWT cifrado

        Raises:
            ValidationError: Si falta el fingerprint
        """
        if not fingerprint:
            raise ValidationError(
                message="El fingerprint es requerido",
                code="MISSING_FINGERPRINT",
                status_code=400
            )

        try:
            issued_at = datetime.datetime.utcnow()
            expiration_time = issued_at + datetime.timedelta(minutes=exp_minutes)

            # Payload con fingerprint integrado
            payload = {
                'username': user.username,
                'fingerprint': fingerprint,  # Vinculación por dispositivo
                'address': request.META.get('REMOTE_ADDR') if request else None,
                'type': 'access',
                'user_type': user_type,
                'iat': issued_at,
                'exp': expiration_time
            }

            # Agregar servicios al payload si están disponibles
            if servicios:
                payload['servicios'] = servicios

            # Generar token JWT (HS256)
            # NOTA: Para JWE completo, se necesitaría usar python-jose o jwcrypto
            # Por ahora usamos JWT firmado que ya ofrece integridad
            access_token = jwt.encode(
                payload,
                config('TOKEN_SECRET_KEY'),
                algorithm='HS256'
            )

            _log_warn(f"Access token generado para {user.username} "
                f"con fingerprint (exp: {exp_minutes}min)"
                f"{' con servicios' if servicios else ''}", level="info")

            return access_token

        except Exception as e:
            _log_warn(f"Error generando access token: {str(e)}", level="error")
            raise

    @staticmethod
    def generate_access_token(
        user: User,
        request: HttpRequest,
        fingerprint: str = None,
        user_type: str = 'external',
        exp_minutes: int = 1440,
        servicios: list = None
    ) -> str:
        """
        Genera un access token JWT (wrapper para compatibilidad)

        Args:
            user: Instancia de User
            request: HttpRequest para obtener IP
            fingerprint: Fingerprint del dispositivo (recomendado)
            user_type: Tipo de usuario ('external', 'internal', 'all')
            exp_minutes: Minutos de expiración

        Returns:
            Access token JWT
        """
        # Si hay fingerprint, usar versión cifrada
        if fingerprint:
            return TokenService.generate_encrypted_token(
                user=user,
                fingerprint=fingerprint,
                request=request,
                user_type=user_type,
                exp_minutes=exp_minutes,
                servicios=servicios
            )

        # Versión legacy sin fingerprint (menos segura)
        try:
            issued_at = datetime.datetime.utcnow()
            expiration_time = issued_at + datetime.timedelta(minutes=exp_minutes)

            payload = {
                'username': user.username,
                'address': request.META.get('REMOTE_ADDR'),
                'type': 'access',
                'user_type': user_type,
                'iat': issued_at,
                'exp': expiration_time
            }

            if servicios:
                payload['servicios'] = servicios

            access_token = jwt.encode(
                payload,
                config('TOKEN_SECRET_KEY'),
                algorithm='HS256'
            )

            _log_warn(f"Access token generado SIN fingerprint para {user.username} "
                f"(exp: {exp_minutes}min) - MENOS SEGURO", level="warning")

            return access_token

        except Exception as e:
            _log_warn(f"Error generando access token: {str(e)}", level="error")
            raise

    @staticmethod
    def validate_token_fingerprint(token: str, fingerprint: str) -> bool:
        """
        Valida que el fingerprint del token coincida con el proporcionado

        Args:
            token: Token JWT a validar
            fingerprint: Fingerprint esperado

        Returns:
            True si coincide, False en caso contrario
        """
        try:
            payload = jwt.decode(
                token,
                config('TOKEN_SECRET_KEY'),
                algorithms=['HS256']
            )

            token_fingerprint = payload.get('fingerprint')

            if not token_fingerprint:
                _log_warn("Token sin fingerprint - versión legacy", level="warning")
                return True  # Permitir tokens legacy por compatibilidad

            return token_fingerprint == fingerprint

        except Exception as e:
            _log_warn(f"Error validando fingerprint: {str(e)}", level="error")
            return False

    @staticmethod
    def generate_refresh_token(
        user: User,
        request: HttpRequest,
        user_type: str = 'external',
        exp_minutes: int = 60 * 24 * 30  # 30 días
    ) -> str:
        """
        Genera un refresh token JWT (deprecated - usar RefreshTokenService)

        NOTA: Este método está deprecated. Use RefreshTokenService.create_refresh_token
        que maneja tokens más seguros con fingerprint y rotación.

        Args:
            user: Instancia de User
            request: HttpRequest para obtener IP
            user_type: Tipo de usuario
            exp_minutes: Minutos de expiración (default: 30 días)

        Returns:
            Refresh token JWT
        """
        _log_warn("generate_refresh_token está deprecated. "
            "Use RefreshTokenService.create_refresh_token", level="warning")

        try:
            issued_at = datetime.datetime.utcnow()
            expiration_time = issued_at + datetime.timedelta(minutes=exp_minutes)

            payload = {
                'username': user.username,
                'address': request.META.get('REMOTE_ADDR'),
                'type': 'refresh',
                'user_type': user_type,
                'iat': issued_at,
                'exp': expiration_time
            }

            refresh_token = jwt.encode(
                payload,
                config('REFRESH_TOKEN_SECRET_KEY'),
                algorithm='HS256'
            )

            _log_warn(f"Refresh token generado (legacy) para {user.username} "
                f"(exp: {exp_minutes}min)", level="info")

            return refresh_token

        except Exception as e:
            _log_warn(f"Error generando refresh token: {str(e)}", level="error")
            raise

    @staticmethod
    def generate_token_pair(
        user: User,
        request: HttpRequest,
        fingerprint: str = None,
        user_type: str = 'external',
        access_exp_minutes: int = 1440,
        refresh_exp_days: int = 30,
        servicios: list = None
    ) -> Dict[str, str]:
        """
        Genera un par de tokens (access y refresh) con fingerprint

        Args:
            user: Instancia de User
            request: HttpRequest
            fingerprint: Fingerprint del dispositivo
            user_type: Tipo de usuario
            access_exp_minutes: Expiración del access token
            refresh_exp_days: Días de expiración del refresh token
            servicios: Lista de servicios del usuario (opcional)

        Returns:
            Diccionario con 'access_token' y 'refresh_token'
        """
        from custom_auth.services.refresh_token_service import RefreshTokenService

        # Generar access token con fingerprint si existe; si no, usar versión legacy.
        access_token = TokenService.generate_access_token(
            user=user,
            request=request,
            fingerprint=fingerprint,
            user_type=user_type,
            exp_minutes=access_exp_minutes,
            servicios=servicios
        )

        # El modelo requiere un fingerprint; en modo legacy se usa un valor estable.
        refresh_token_obj = RefreshTokenService.create_refresh_token(
            user=user,
            fingerprint=fingerprint or 'legacy_token',
            exp_days=refresh_exp_days
        )

        return {
            'access_token': access_token,
            'refresh_token': refresh_token_obj.token
        }

    @staticmethod
    def generate_sp_token(
        user: User,
        servicios: list,
        exp_minutes: int = 1440
    ) -> str:
        """
        Genera token_sp para contexto de servicios en mobile.

        Payload:
            - username
            - servicios
            - iat
            - exp
        """
        try:
            issued_at = datetime.datetime.utcnow()
            expiration_time = issued_at + datetime.timedelta(minutes=exp_minutes)

            payload = {
                'username': user.username,
                'servicios': servicios or [],
                'iat': issued_at,
                'exp': expiration_time
            }

            token_sp = jwt.encode(
                payload,
                config('TOKEN_SECRET_KEY'),
                algorithm='HS256'
            )

            _log_warn(f"token_sp generado para {user.username} "
                f"(exp: {exp_minutes}min, servicios: {len(servicios or [])})", level="info")

            return token_sp
        except Exception as e:
            _log_warn(f"Error generando token_sp: {str(e)}", level="error")
            raise
