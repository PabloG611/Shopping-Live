"""
Excepciones de negocio universales.

Las apps lanzan estas excepciones desde sus services; el BaseViewSet / manejador
las traduce a respuestas HTTP consistentes vía ResponseBuilder. Así el negocio
no conoce HTTP y las respuestas quedan centralizadas.
"""
from rest_framework import status


class BusinessError(Exception):
    """Error de negocio base. status_code y code se mapean a la respuesta HTTP."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "BUSINESS_ERROR"

    def __init__(self, message: str, *, code: str = None, status_code: int = None, errors: dict = None):
        super().__init__(message)
        self.message = message
        if code is not None:
            self.code = code
        if status_code is not None:
            self.status_code = status_code
        self.errors = errors or {}


class NotFoundError(BusinessError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "NOT_FOUND"


class ValidationError(BusinessError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "VALIDATION_ERROR"


class ConflictError(BusinessError):
    """Ej.: stock insuficiente, reserva expirada, pago duplicado."""

    status_code = status.HTTP_409_CONFLICT
    code = "CONFLICT"


class PermissionDeniedError(BusinessError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "FORBIDDEN"
