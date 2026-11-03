"""
Builder para construcción de respuestas HTTP
Aplica security headers y estructura consistente
"""
from typing import Dict, Any, Optional
from django.http import JsonResponse
from rest_framework import status
from utils.logger_generico import _log_warn

class ResponseBuilder:
    """
    Constructor de respuestas HTTP con security headers
    """

    # Security headers estándar
    SECURITY_HEADERS = {
        'X-Content-Type-Options': 'nosniff',
        'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'DENY',
    }

    @classmethod
    def _apply_security_headers(cls, response: JsonResponse) -> JsonResponse:
        """
        Aplica security headers a la respuesta

        Args:
            response: JsonResponse

        Returns:
            JsonResponse con headers de seguridad
        """
        for header, value in cls.SECURITY_HEADERS.items():
            response[header] = value
        return response

    @classmethod
    def success(
        cls,
        message: str,
        data: Optional[Dict[str, Any]] = None,
        status_code: int = status.HTTP_200_OK
    ) -> JsonResponse:
        """
        Construye una respuesta de éxito

        Args:
            message: Mensaje de éxito
            data: Datos adicionales (opcional)
            status_code: Código de estado HTTP

        Returns:
            JsonResponse con headers de seguridad
        """
        response_data = {'message': message}

        if data:
            response_data.update(data)

        response = JsonResponse(response_data, status=status_code)
        return cls._apply_security_headers(response)

    @classmethod
    def error(
        cls,
        message: str,
        code: Optional[str] = None,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        details: Optional[Dict[str, Any]] = None
    ) -> JsonResponse:
        """
        Construye una respuesta de error

        Args:
            message: Mensaje de error
            code: Código de error (opcional)
            status_code: Código de estado HTTP
            details: Detalles adicionales (opcional, no exponer en producción)

        Returns:
            JsonResponse con headers de seguridad
        """
        response_data = {'message': message}

        if code:
            response_data['code'] = code

        # Solo incluir detalles en desarrollo
        # En producción, esto debería ser omitido
        if details:
            _log_warn(f"Error details: {details}", level="debug")
            # Descomenta la siguiente línea solo en desarrollo
            # response_data['details'] = details

        response = JsonResponse(response_data, status=status_code)
        return cls._apply_security_headers(response)

    @classmethod
    def microsoft_login_success(
        cls,
        user_is_active: bool,
        id_token: str,
        session_id: str,
        profile_data: Optional[Dict[str, Any]] = None
    ) -> JsonResponse:
        """
        Construye respuesta específica para login de Microsoft

        Args:
            user_is_active: Si el usuario está activo
            id_token: Token de ID de Microsoft
            session_id: ID de sesión creada
            profile_data: Datos de perfil (opcional)

        Returns:
            JsonResponse configurada para Microsoft login
        """
        # Datos base de la respuesta
        response_data = {
            'message': 'Login Success',
            'activo': user_is_active,
            'token': id_token,
            'session_id': session_id
        }

        # Agregar datos de perfil si existen
        if profile_data:
            response_data.update(profile_data)
        else:
            # Si no hay perfil, indicar que se requiere configuración
            response_data['BdRequired'] = True

        # Crear respuesta
        response = JsonResponse(response_data, status=status.HTTP_200_OK)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta de Microsoft login construida exitosamente", level="info")

        return response

    @classmethod
    def external_login_success(
        cls,
        user_is_active: bool,
        two_fa_required: bool = True,
        qr_code: Optional[str] = None
    ) -> JsonResponse:
        """
        Construye respuesta para login externo (no Microsoft)
        Requiere 2FA por defecto

        Args:
            user_is_active: Si el usuario está activo
            two_fa_required: Si se requiere 2FA (default: True)
            qr_code: QR code para 2FA (opcional)

        Returns:
            JsonResponse configurada para login externo
        """
        response_data = {
            'message': 'Login Success' if not qr_code else 'User has no device',
            'active': user_is_active,
            'twoFARequired': two_fa_required
        }

        if qr_code:
            response_data['qr_code'] = qr_code

        response = JsonResponse(response_data, status=status.HTTP_200_OK)
        return cls._apply_security_headers(response)

    @classmethod
    def two_factor_auth_success(
        cls,
        user_is_active: bool,
        access_token: str,
        session_id: str,
        profile_data: Optional[Dict[str, Any]] = None
    ) -> JsonResponse:
        """
        Construye respuesta para autenticación 2FA exitosa
        Similar a microsoft_login_success pero con tokens JWT propios

        Args:
            user_is_active: Si el usuario está activo
            access_token: Token de acceso JWT
            session_id: ID de sesión creada
            profile_data: Datos de perfil (opcional)

        Returns:
            JsonResponse con token, session_id y datos de perfil en el body
        """
        # Datos base de la respuesta (similar a microsoft_login_success)
        response_data = {
            'message': 'Login Success',
            'activo': user_is_active,
            'token': access_token,
            'session_id': session_id
        }

        # Agregar datos de perfil si existen
        if profile_data:
            response_data.update(profile_data)
        else:
            # Si no hay perfil, indicar que se requiere configuración
            response_data['BdRequired'] = True

        # Crear respuesta
        response = JsonResponse(response_data, status=status.HTTP_200_OK)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta 2FA construida exitosamente", level="info")

        return response

    @classmethod
    def logout_success(cls) -> JsonResponse:
        """
        Construye respuesta para logout exitoso

        Returns:
            JsonResponse con mensaje de logout exitoso
        """
        response_data = {
            'message': 'Logout Success'
        }

        response = JsonResponse(response_data, status=status.HTTP_200_OK)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta de logout construida exitosamente", level="info")

        return response

    @classmethod
    def token_refresh_success(cls, new_token: str) -> JsonResponse:
        """
        Construye respuesta para refresh de token exitoso

        Args:
            new_token: Nuevo token generado

        Returns:
            JsonResponse con nuevo token en el body
        """
        response_data = {
            'message': 'Token refrescado exitosamente',
            'token': new_token
        }

        response = JsonResponse(response_data, status=status.HTTP_200_OK)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta de refresh token construida exitosamente", level="info")

        return response

    @classmethod
    def recovery_success(cls) -> JsonResponse:
        """
        Construye respuesta para solicitud de recuperación de contraseña

        Nota de seguridad: El mensaje no revela si el usuario existe o no
        para prevenir enumeración de usuarios

        Returns:
            JsonResponse con mensaje genérico de éxito
        """
        response_data = {
            'message': 'Si el usuario existe, se envió un código al correo registrado.'
        }

        response = JsonResponse(response_data, status=status.HTTP_201_CREATED)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta de recovery construida exitosamente", level="info")

        return response

    @classmethod
    def user_data_success(
        cls,
        user_data: Dict[str, Any],
        token_sp: Optional[str] = None
    ) -> JsonResponse:
        """
        Construye respuesta para obtención de datos de usuario

        Args:
            user_data: Diccionario con datos completos del usuario

        Returns:
            JsonResponse con datos del usuario
        """
        response_data = {
            'message': 'Data retrieved',
            'data': user_data
        }
        if token_sp:
            response_data['token_sp'] = token_sp

        response = JsonResponse(response_data, status=status.HTTP_200_OK)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta de user data construida exitosamente", level="info")

        return response

    @classmethod
    def user_data_update_success(cls, profile_data: Optional[Dict[str, Any]] = None) -> JsonResponse:
        """
        Construye respuesta para actualización exitosa de datos de usuario

        Returns:
            JsonResponse con mensaje de éxito
        """
        response_data = {
            'message': 'Data saved and updated correctly'
        }

        # Agregar datos de perfil si existen
        if profile_data:
            response_data.update(profile_data)

        response = JsonResponse(response_data, status=status.HTTP_200_OK)

        # Aplicar security headers
        cls._apply_security_headers(response)

        _log_warn("Respuesta de actualización de datos construida exitosamente", level="info")

        return response

    @classmethod
    def method_not_allowed(cls) -> JsonResponse:
        """
        Construye respuesta para método no permitido

        Returns:
            JsonResponse con error 405
        """
        return cls.error(
            message='Method not allowed',
            code='METHOD_NOT_ALLOWED',
            status_code=status.HTTP_405_METHOD_NOT_ALLOWED
        )

    @classmethod
    def from_exception(cls, exception: Exception) -> JsonResponse:
        """
        Construye respuesta desde una excepción

        Args:
            exception: Excepción lanzada

        Returns:
            JsonResponse apropiada para la excepción
        """
        from custom_auth.exceptions import AuthenticationError

        if isinstance(exception, AuthenticationError):
            return cls.error(
                message=exception.message,
                code=exception.code,
                status_code=exception.status_code,
                details=exception.details
            )

        # Para excepciones no controladas, no exponer detalles
        _log_warn(f"Excepción no controlada: {str(exception)}", level="error", exc_info=True)
        return cls.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
