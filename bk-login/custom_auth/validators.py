"""
Validadores de contraseña propios (se registran en AUTH_PASSWORD_VALIDATORS).
"""
from django.contrib.auth.password_validation import CommonPasswordValidator
from django.core.exceptions import ValidationError
from django.db import DatabaseError

from utils.logger_generico import _log_warn


class CommonPasswordDBValidator(CommonPasswordValidator):
    """
    Rechaza las contraseñas comunes y filtradas (ASVS V2.1.7): las de la lista
    que trae Django (en memoria, no depende de la base de datos) y las de la
    tabla CommonPassword, que se amplía con el comando
    cargar_contrasenas_comunes (por ejemplo, con hashes de Have I Been Pwned).

    Falla cerrado: si no se puede consultar la tabla, la contraseña se rechaza
    en lugar de aceptarla sin validar.
    """

    message = "Esta contraseña es demasiado común o aparece en filtraciones conocidas. Elija otra."

    def validate(self, password, user=None):
        from custom_auth.models.models_global import CommonPassword

        if password.lower().strip() in self.passwords:
            raise ValidationError(self.message, code='password_too_common')

        try:
            is_common = CommonPassword.is_common(password)
        except DatabaseError as e:
            _log_warn(f"No se pudo consultar la lista de contraseñas comunes: {str(e)}", level="error")
            raise ValidationError(
                "No se pudo validar la contraseña en este momento. Intente más tarde.",
                code='password_check_unavailable',
            )

        if is_common:
            raise ValidationError(self.message, code='password_too_common')

    def get_help_text(self):
        return "La contraseña no puede ser una contraseña común ni aparecer en filtraciones conocidas."
