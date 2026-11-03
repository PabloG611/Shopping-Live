"""
Servicio de autenticación externa (Django auth)
Para usuarios externos que no usan Microsoft AD
"""
import base64
from datetime import datetime, timezone as dt_timezone
from typing import Optional
from decouple import config
from django.contrib.auth.models import User
from django.db.models import Q
from custom_auth.exceptions import InvalidCredentialsError, UserNotFoundError
from utils.logger_generico import _log_warn

class ExternalAuthService:
    """
    Servicio para autenticación de usuarios externos (no Microsoft)
    Usa el sistema de autenticación de Django
    """

    @staticmethod
    def get_user_by_identifier(identifier: str) -> Optional[User]:
        """
        Obtiene un usuario por email o username

        Args:
            identifier: Email o username del usuario

        Returns:
            Instancia de User o None si no existe
        """
        try:
            identifier_normalized = identifier.strip().lower()

            user = User.objects.filter(
                Q(email__iexact=identifier_normalized) |
                Q(username__iexact=identifier_normalized)
            ).first()

            if user:
                _log_warn(f"Usuario encontrado por identificador: {identifier_normalized}", level="debug")
            else:
                _log_warn(f"Usuario no encontrado por identificador: {identifier_normalized}", level="debug")

            return user

        except Exception as e:
            _log_warn(f"Error buscando usuario por identificador: {str(e)}", level="error")
            return None

    @staticmethod
    def authenticate(identifier: str, password: str) -> User:
        """
        Autentica un usuario con username/email y password

        Args:
            identifier: Username o email del usuario
            password: Contraseña del usuario

        Returns:
            Instancia de User autenticado

        Raises:
            InvalidCredentialsError: Si las credenciales son inválidas
            UserNotFoundError: Si el usuario no existe
        """
        try:
            # Obtener usuario
            user = ExternalAuthService.get_user_by_identifier(identifier)

            if not user:
                _log_warn(f"Intento de login con identificador inexistente: {identifier}", level="warning")
                raise InvalidCredentialsError(
                    message="Credenciales inválidas",
                    code="INVALID_CREDENTIALS"
                )

            # Verificar password
            if not user.check_password(password):
                _log_warn(f"Password incorrecto para usuario: {user.username}", level="warning")
                raise InvalidCredentialsError(
                    message="Credenciales inválidas",
                    code="INVALID_CREDENTIALS"
                )

            _log_warn(f"Autenticación externa exitosa para usuario: {user.username}", level="info")
            return user

        except (InvalidCredentialsError, UserNotFoundError):
            # Re-lanzar excepciones conocidas
            raise

        except Exception as e:
            _log_warn(f"Error inesperado en autenticación externa: {str(e)}", level="error", exc_info=True)
            raise InvalidCredentialsError(
                message="Error en autenticación",
                code="AUTH_ERROR"
            )

    @staticmethod
    def validate_identifier_and_password(identifier: str, password: str) -> tuple[str, str]:
        """
        Valida que identifier y password existan

        Args:
            identifier: Username o email
            password: Contraseña

        Returns:
            Tupla (identifier_normalized, password)

        Raises:
            ValidationError: Si faltan datos
        """
        from custom_auth.exceptions import ValidationError

        if not identifier or not password:
            _log_warn("Intento de login sin identificador o password", level="warning")
            raise ValidationError(
                message="Todos los datos son requeridos",
                code="MISSING_CREDENTIALS"
            )

        # Normalizar identifier
        identifier_normalized = identifier.strip().lower()

        return identifier_normalized, password
    
    @staticmethod
    def validate_external_endpoint(request, endpoint: str) -> bool:
        """
        Valida el acceso de una organización externa a un endpoint puntual,
        a través del header `api-key`.

        Formato del api-key (antes de codificar en base64):
            <secreto (60 chars)>:<nombre_organizacion>:<fecha_expiracion YYYY-MM-DD>

        El secreto esperado de cada organización se busca en la variable de
        entorno `API_KEY_{NOMBRE_ORGANIZACION}` (en mayúsculas) — cada
        organización externa tiene su propio secreto, a diferencia del
        esquema anterior (un único `API_KEY` global compartido). Además del
        secreto y la fecha, la organización debe tener el endpoint
        explícitamente autorizado en la tabla `ExternalEndpoint`.

        Args:
            request: request de Django/DRF del que se lee el header `api-key`.
            endpoint: identificador del endpoint solicitado, tal como se
                almacena en el catálogo `Endpoint` referenciado por
                `ExternalEndpoint`.

        Returns:
            True si el api-key es válido, no está expirado y la organización
            tiene autorizado ese endpoint. False en cualquier otro caso
            (incluyendo ausencia del header, para no exigirlo en el resto de
            endpoints).
        """
        from custom_auth.models.models_global import ExternalEndpoint

        api_key_header = request.headers.get("api-key")
        if not api_key_header:
            return False

        try:
            decoded = base64.b64decode(api_key_header).decode("utf-8")
            secreto = decoded[:60]
            nombre_organizacion, fecha_str = decoded[61:].split(":")

            secreto_esperado = config(f"API_KEY_{nombre_organizacion.upper()}", default="")
            fecha_expiracion = datetime.strptime(fecha_str, "%Y-%m-%d").replace(tzinfo=dt_timezone.utc)

            if not secreto_esperado or secreto != secreto_esperado:
                _log_warn(f"Acceso externo denegado a '{endpoint}': secreto inválido para organización '{nombre_organizacion}'", level="warning")
                return False

            if fecha_expiracion.date() < datetime.now(dt_timezone.utc).date():
                _log_warn(f"Acceso externo denegado a '{endpoint}': api-key expirado ({fecha_str}) para organización '{nombre_organizacion}'", level="warning")
                return False

            tiene_acceso = ExternalEndpoint.objects.filter(
                endpoint__endpoint=endpoint,
                organizacion__name=nombre_organizacion,
            ).exists()

            if not tiene_acceso:
                _log_warn(f"Acceso externo denegado a '{endpoint}': organización '{nombre_organizacion}' sin autorización sobre ese endpoint", level="warning")
                return False

            _log_warn(f"Acceso externo permitido a '{endpoint}' para organización '{nombre_organizacion}' (expira {fecha_str})", level="info")
            return True

        except (ValueError, IndexError) as e:
            _log_warn(f"Acceso externo denegado a '{endpoint}': error al decodificar api-key - {str(e)}", level="warning")
            return False
        except Exception as e:
            _log_warn(f"Acceso externo denegado a '{endpoint}': error inesperado - {str(e)}", level="warning")
            return False
