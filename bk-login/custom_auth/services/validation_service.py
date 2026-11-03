"""
Servicio de validación de datos y recaptcha
"""
from typing import Dict, Any, Optional
from decouple import config
from django.contrib.auth.models import User
from custom_auth.exceptions import ValidationError, RecaptchaError
from utils.validate import validate_recaptcha as validate_recaptcha_util
from utils.save_data import save_recaptcha
from utils.logger_generico import _log_warn

class ValidationService:
    """
    Servicio para validación de datos de entrada y recaptcha
    """

    @staticmethod
    def validate_login_data(form_data: Dict[str, Any]) -> tuple[str, str]:
        """
        Valida que username y password existan en los datos del formulario

        Args:
            form_data: Diccionario con los datos del formulario

        Returns:
            Tupla con (username, password)

        Raises:
            ValidationError: Si faltan datos requeridos
        """
        username = form_data.get('username')
        password = form_data.get('password')

        if not username or not password:
            _log_warn("Intento de login sin username o password", level="warning")
            raise ValidationError(
                message="Todos los datos son requeridos",
                code="MISSING_CREDENTIALS"
            )

        return username.strip().lower(), password

    @staticmethod
    def validate_recaptcha_token(
        token: Optional[str],
        is_mobile: bool,
        user: Optional[User] = None
    ) -> None:
        """
        Valida el token de recaptcha si no es móvil

        Args:
            token: Token de recaptcha
            is_mobile: Si la petición viene desde móvil
            user: Usuario para guardar el recaptcha (opcional)

        Raises:
            ValidationError: Si falta el token
            RecaptchaError: Si el recaptcha es inválido
        """
        recaptcha_enabled = config('RECAPTCHA_ENABLED', default=True, cast=bool)
        if not recaptcha_enabled:
            _log_warn("Validación de recaptcha deshabilitada por configuración (RECAPTCHA_ENABLED=false)", level="info")
            return

        if is_mobile:
            _log_warn("Saltando validación de recaptcha para dispositivo móvil", level="debug")
            return

        if not token:
            _log_warn("Intento de login sin token de recaptcha", level="warning")
            raise ValidationError(
                message="Token de recaptcha requerido",
                code="MISSING_RECAPTCHA"
            )

        try:
            is_valid = validate_recaptcha_util(token=token)
            if not is_valid:
                _log_warn("Token de recaptcha inválido", level="warning")
                raise RecaptchaError(
                    message="Recaptcha inválido",
                    code="INVALID_RECAPTCHA"
                )

            # Guardar recaptcha si hay usuario
            if user:
                try:
                    save_recaptcha(user=user, token=token)
                except Exception as e:
                    # No fallar si no se puede guardar el recaptcha
                    _log_warn(f"No se pudo guardar recaptcha: {str(e)}", level="warning")

            _log_warn("Recaptcha validado correctamente", level="info")

        except RecaptchaError:
            raise
        except Exception as e:
            _log_warn(f"Error validando recaptcha: {str(e)}", level="error")
            raise RecaptchaError(
                message="Error validando recaptcha",
                code="RECAPTCHA_VALIDATION_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def validate_request_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Valida y extrae datos del request

        Args:
            data: Datos del request

        Returns:
            Diccionario con form_data
        """
        return data.get('datosFormulario', data)
