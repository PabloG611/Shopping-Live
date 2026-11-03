"""
ViewSet base para la capa de presentación.

Traduce automáticamente las BusinessError a respuestas consistentes con
ResponseBuilder, de modo que ningún endpoint tenga que repetir try/except ni
armar el JSON de error a mano.
"""
from rest_framework import viewsets
from rest_framework.response import Response

from core.exceptions import BusinessError
from core.response_builder import ResponseBuilder


class BaseViewSet(viewsets.ModelViewSet):
    """
    ModelViewSet con manejo centralizado de errores de negocio.

    Las apps definen queryset + serializer_class y, si aplica, delegan la lógica
    en su service. Las BusinessError lanzadas por el service se convierten aquí
    en la respuesta HTTP correcta.
    """

    def handle_exception(self, exc):
        if isinstance(exc, BusinessError):
            return ResponseBuilder.error(
                message=exc.message,
                code=exc.code,
                status_code=exc.status_code,
                errors=exc.errors or None,
            )
        return super().handle_exception(exc)

    def finalize_response(self, request, response, *args, **kwargs):
        # Aplica security headers también a las respuestas estándar de DRF.
        if isinstance(response, Response):
            ResponseBuilder._apply_security_headers(response)
        return super().finalize_response(request, response, *args, **kwargs)
