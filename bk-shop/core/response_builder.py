"""
Constructor universal de respuestas HTTP para toda la API de Shopping Live.

Centraliza el formato de respuesta y los security headers para que TODAS las
apps (tiendas, catalogo, lives, ordenes, pagos, chat) respondan igual, sin
repetir código. Úsalo desde cualquier view/service:

    from core.response_builder import ResponseBuilder
    return ResponseBuilder.success("Producto creado", {"id": prod.id}, status_code=201)
    return ResponseBuilder.error("No encontrado", code="NOT_FOUND", status_code=404)
"""
from typing import Any, Dict, Optional

from rest_framework import status
from rest_framework.response import Response


class ResponseBuilder:
    """Respuestas JSON consistentes con security headers aplicados."""

    SECURITY_HEADERS = {
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Cache-Control": "no-store",
    }

    @classmethod
    def _apply_security_headers(cls, response: Response) -> Response:
        for header, value in cls.SECURITY_HEADERS.items():
            response[header] = value
        return response

    @classmethod
    def success(
        cls,
        message: str,
        data: Optional[Any] = None,
        status_code: int = status.HTTP_200_OK,
    ) -> Response:
        """Respuesta de éxito. `data` puede ser dict, list o cualquier serializable."""
        payload: Dict[str, Any] = {"status": "success", "message": message}
        if data is not None:
            payload["data"] = data
        return cls._apply_security_headers(Response(payload, status=status_code))

    @classmethod
    def error(
        cls,
        message: str,
        code: Optional[str] = None,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        errors: Optional[Dict[str, Any]] = None,
    ) -> Response:
        """Respuesta de error. `errors` para detalle por campo (validaciones)."""
        payload: Dict[str, Any] = {"status": "error", "message": message}
        if code:
            payload["code"] = code
        if errors:
            payload["errors"] = errors
        return cls._apply_security_headers(Response(payload, status=status_code))

    @classmethod
    def created(cls, message: str, data: Optional[Any] = None) -> Response:
        return cls.success(message, data, status_code=status.HTTP_201_CREATED)

    @classmethod
    def no_content(cls) -> Response:
        return cls._apply_security_headers(Response(status=status.HTTP_204_NO_CONTENT))

    @classmethod
    def not_found(cls, message: str = "Recurso no encontrado") -> Response:
        return cls.error(message, code="NOT_FOUND", status_code=status.HTTP_404_NOT_FOUND)

    @classmethod
    def unauthorized(cls, message: str = "No autorizado") -> Response:
        return cls.error(message, code="UNAUTHORIZED", status_code=status.HTTP_401_UNAUTHORIZED)

    @classmethod
    def forbidden(cls, message: str = "Acceso denegado") -> Response:
        return cls.error(message, code="FORBIDDEN", status_code=status.HTTP_403_FORBIDDEN)
