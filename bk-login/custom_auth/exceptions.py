"""
Excepciones personalizadas para autenticación
Todas las excepciones usan dataclasses para estructura tipada
"""
from dataclasses import dataclass
from typing import Optional, Dict, Any
from rest_framework import status


@dataclass
class AuthenticationError(Exception):
    """Excepción base para errores de autenticación"""
    message: str
    code: str
    status_code: int = status.HTTP_401_UNAUTHORIZED
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convierte la excepción a diccionario para respuesta JSON"""
        response = {
            'message': self.message,
            'code': self.code
        }
        if self.details:
            response['details'] = self.details
        return response


@dataclass
class InvalidCredentialsError(AuthenticationError):
    """Error cuando las credenciales son inválidas"""
    message: str = "Credenciales inválidas"
    code: str = "INVALID_CREDENTIALS"
    status_code: int = status.HTTP_401_UNAUTHORIZED


@dataclass
class MicrosoftServiceError(AuthenticationError):
    """Error al comunicarse con servicios de Microsoft"""
    message: str = "Error de autenticación con Microsoft"
    code: str = "MICROSOFT_SERVICE_ERROR"
    status_code: int = status.HTTP_401_UNAUTHORIZED


@dataclass
class ValidationError(AuthenticationError):
    """Error de validación de datos de entrada"""
    message: str = "Datos de entrada inválidos"
    code: str = "VALIDATION_ERROR"
    status_code: int = status.HTTP_400_BAD_REQUEST


@dataclass
class RecaptchaError(AuthenticationError):
    """Error de validación de recaptcha"""
    message: str = "Recaptcha inválido"
    code: str = "RECAPTCHA_ERROR"
    status_code: int = status.HTTP_400_BAD_REQUEST


@dataclass
class UserNotFoundError(AuthenticationError):
    """Error cuando el usuario no existe"""
    message: str = "Usuario no encontrado"
    code: str = "USER_NOT_FOUND"
    status_code: int = status.HTTP_404_NOT_FOUND


@dataclass
class ProfileNotFoundError(AuthenticationError):
    """Error cuando el perfil de usuario no existe"""
    message: str = "Perfil de usuario no encontrado"
    code: str = "PROFILE_NOT_FOUND"
    status_code: int = status.HTTP_404_NOT_FOUND


@dataclass
class SessionError(AuthenticationError):
    """Error relacionado con la gestión de sesiones"""
    message: str = "Error de sesión"
    code: str = "SESSION_ERROR"
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR


@dataclass
class DatabaseError(AuthenticationError):
    """Error de base de datos"""
    message: str = "Error interno del servidor"
    code: str = "DATABASE_ERROR"
    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
