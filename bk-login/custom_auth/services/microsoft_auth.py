"""
Servicio de autenticación con Microsoft MSAL
"""
import requests
from typing import Dict, Any
from django.contrib.auth.models import User
from msal import ConfidentialClientApplication
from decouple import config
from custom_auth.exceptions import MicrosoftServiceError, InvalidCredentialsError
from utils.save_data import save_refresh
from utils.logger_generico import _log_warn

class MicrosoftAuthService:
    """
    Servicio para autenticación con Microsoft usando MSAL
    """

    def __init__(self):
        """Inicializa el cliente MSAL"""
        self.client_id = config('MICROSOFT_CLIENT_ID')
        self.client_credential = config('MICROSOFT_CREDENTIAL')
        self.tenant = config('MICROSOFT_TENANT')
        self.authority = f"https://login.microsoftonline.com/{self.tenant}"

    def _create_msal_app(self) -> ConfidentialClientApplication:
        """
        Crea una instancia de ConfidentialClientApplication

        Returns:
            Instancia configurada de MSAL
        """
        return ConfidentialClientApplication(
            client_id=self.client_id,
            client_credential=self.client_credential,
            authority=self.authority
        )

    def authenticate(
        self,
        username: str,
        password: str,
        user: User,
        save_refresh_token: bool = True
    ) -> Dict[str, Any]:
        """
        Autentica un usuario contra Microsoft AD

        Args:
            username: Nombre de usuario (sin dominio)
            password: Contraseña del usuario
            user: Instancia de User
            save_refresh_token: Si debe guardar el refresh token (deprecated, usar manualmente)

        Returns:
            Diccionario con tokens de autenticación:
            {
                'id_token': str,
                'access_token': str,
                'refresh_token': str,
                ...
            }

        Raises:
            InvalidCredentialsError: Si las credenciales son inválidas
            MicrosoftServiceError: Si hay un error del servicio de Microsoft
        """
        try:
            app = self._create_msal_app()

            # Construir email completo
            full_username = f'{username}@unp.gov.co'

            _log_warn(f"Intentando autenticar usuario: {username}", level="info")

            # Adquirir token por username/password
            result = app.acquire_token_by_username_password(
                username=full_username,
                password=password,
                scopes=["User.Read"]
            )

            # Log sanitizado (sin datos sensibles)
            _log_warn(f"Respuesta MSAL recibida - "
                f"success: {'error' not in result}, "
                f"user: {username}", level="info")

            # Verificar errores
            if "error" in result:
                error_code = result.get("error", "unknown")
                error_description = result.get("error_description", "")

                _log_warn(f"Error de autenticación Microsoft para {username}: "
                    f"{error_code}", level="warning")

                # No exponer detalles internos al cliente
                if "AADSTS50126" in error_description or "invalid" in error_code.lower():
                    raise InvalidCredentialsError(
                        message="Credenciales inválidas",
                        code="INVALID_MICROSOFT_CREDENTIALS"
                    )

                raise MicrosoftServiceError(
                    message="Error de autenticación con Microsoft",
                    code="MICROSOFT_AUTH_ERROR",
                    details={"error_code": error_code}
                )

            # Verificar que tenemos los tokens necesarios
            if not result.get("id_token"):
                _log_warn(f"Respuesta MSAL sin id_token para {username}", level="error")
                raise MicrosoftServiceError(
                    message="Respuesta incompleta de Microsoft",
                    code="MISSING_ID_TOKEN"
                )

            # Guardar refresh token usando método legacy (deprecated)
            # NOTA: Preferir guardar manualmente con RefreshTokenService en la vista
            if save_refresh_token:
                refresh_token = result.get("refresh_token")
                if refresh_token:
                    try:
                        save_refresh(user=user, token=refresh_token)
                        _log_warn(f"Refresh token guardado (legacy) para usuario {username}", level="info")
                    except Exception as e:
                        # No fallar la autenticación si no se puede guardar el refresh
                        _log_warn(f"No se pudo guardar refresh token para {username}: {str(e)}", level="warning")

            _log_warn(f"Autenticación exitosa para usuario: {username}", level="info")

            return result

        except (InvalidCredentialsError, MicrosoftServiceError):
            # Re-lanzar excepciones conocidas
            raise

        except Exception as e:
            _log_warn(f"Error inesperado en autenticación Microsoft "
                f"para {username}: {str(e)}", level="error", exc_info=True)
            raise MicrosoftServiceError(
                message="Error interno al autenticar con Microsoft",
                code="MICROSOFT_SERVICE_UNEXPECTED_ERROR",
                details={"error": "Internal error"}  # No exponer detalles
            )

    def get_token_info(self, result: Dict[str, Any]) -> Dict[str, str]:
        """
        Extrae información relevante del resultado de MSAL

        Args:
            result: Resultado de acquire_token_by_username_password

        Returns:
            Diccionario con información del token
        """
        return {
            'id_token': result.get('id_token', ''),
            'access_token': result.get('access_token', ''),
            'token_type': result.get('token_type', 'Bearer'),
            'expires_in': str(result.get('expires_in', '')),
        }

    def get_user_graph_data(self, token: str, user: User) -> Dict[str, Any]:
        """
        Obtiene datos del usuario desde Microsoft Graph

        Args:
            token: Token de acceso
            user: Instancia de User

        Returns:
            Diccionario con datos del usuario
        """
        try:
            # Construir URL para Microsoft Graph
            graph_url = f"https://graph.microsoft.com/v1.0/me"

            # Configurar headers con el token
            headers = {
                'Authorization': f"Bearer {token}",
                'Content-Type': 'application/json'
            }

            # Realizar la solicitud a Microsoft Graph
            response = requests.get(graph_url, headers=headers, timeout=10)

            # Verificar respuesta
            if response.status_code != 200:
                _log_warn(f"Error al obtener datos del usuario de Microsoft Graph "
                    f"para {user.username}: {response.text}", level="error")
                raise MicrosoftServiceError(
                    message="Error al obtener datos del usuario de Microsoft Graph",
                    code="MICROSOFT_GRAPH_ERROR"
                )

            # Extraer datos del usuario
            user_data = response.json()

            # Log sanitizado (sin datos sensibles)
            _log_warn(f"Datos del usuario obtenidos exitosamente para {user.username}", level="info")

            return user_data

        except Exception as e:
            _log_warn(f"Error al obtener datos del usuario de Microsoft Graph "
                f"para {user.username}: {str(e)}", level="error", exc_info=True)
            raise MicrosoftServiceError(
                message="Error al obtener datos del usuario de Microsoft Graph",
                code="MICROSOFT_GRAPH_ERROR"
            )
