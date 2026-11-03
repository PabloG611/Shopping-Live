"""
Servicio de validación de permisos de Microsoft Graph API
Valida scopes sin persistencia en base de datos
"""
import logging
from typing import List
from custom_auth.exceptions import ValidationError

logger = logging.getLogger(__name__)


class MicrosoftPermissionsService:
    """
    Servicio para validar scopes de Microsoft Graph API
    """

    @staticmethod
    def validate_scopes(scopes: List[str]) -> bool:
        """
        Valida que los scopes tengan el formato correcto de Microsoft Graph

        Args:
            scopes: Lista de scopes a validar

        Returns:
            True si son válidos

        Raises:
            ValidationError: Si los scopes no son válidos
        """
        if not isinstance(scopes, list):
            raise ValidationError(
                message="Los scopes deben ser una lista",
                code="INVALID_SCOPES_FORMAT",
                status_code=400
            )

        if not scopes:
            raise ValidationError(
                message="Debe proporcionar al menos un scope",
                code="EMPTY_SCOPES",
                status_code=400
            )

        # Validar formato básico de scopes de Microsoft Graph
        # Ejemplos: User.Read, Mail.Send, Calendars.ReadWrite
        for scope in scopes:
            if not isinstance(scope, str):
                raise ValidationError(
                    message="Cada scope debe ser una cadena de texto",
                    code="INVALID_SCOPE_TYPE",
                    status_code=400
                )

            # Verificar que no esté vacío
            if not scope.strip():
                raise ValidationError(
                    message="Los scopes no pueden estar vacíos",
                    code="EMPTY_SCOPE_VALUE",
                    status_code=400
                )

        return True
