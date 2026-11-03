import hmac
from functools import wraps

from django.conf import settings
from rest_framework import status

from api.decorators.jwt_decorator import autenticar_jwt
from builders import ResponseBuilder
from utils.logger_generico import _log_warn

def _validar_internal_token(request) -> bool:
    """
    Compara el header X-Internal-Token contra settings.INTERNAL_SERVICE_TOKEN
    usando comparación en tiempo constante (evita timing attacks).
    """
    token = request.headers.get('X-Internal-Token', '')
    internal_token = getattr(settings, 'INTERNAL_SERVICE_TOKEN', '')
    return bool(token and internal_token and hmac.compare_digest(token, internal_token))


def jwt_or_internal_token_required(view_func):
    """
    Decorator para endpoints que aceptan dos formas de autenticación excluyentes:

        1. JWT de usuario (header Authorization: Bearer <token>), igual que
           @jwt_required.
        2. Token de servicio interno (header X-Internal-Token), para llamadas
           servidor-a-servidor que no representan a un usuario final.

    No se permite combinar ambos headers en la misma petición: si llegan
    Authorization y X-Internal-Token a la vez, se rechaza (podría indicar un
    intento de manipular la autenticación).

    Cuando la autenticación se resuelve vía token interno, no hay usuario
    asociado a la request: request.user y request.django_user quedan en None.
    """
    @wraps(view_func)
    def wrapped_view(request, *args, **kwargs):
        auth_header = request.headers.get('Authorization')
        internal_token_header = request.headers.get('X-Internal-Token')

        if auth_header and internal_token_header:
            _log_warn(f'Petición con Authorization y X-Internal-Token simultáneos, rechazada: {request.path}', level="warning")
            return ResponseBuilder.error(
                message='No se permite combinar JWT y token interno en la misma petición',
                code='AMBIGUOUS_AUTH',
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        if internal_token_header:
            if not _validar_internal_token(request):
                _log_warn(f'Token interno inválido para {request.path}', level="warning")
                return ResponseBuilder.error(
                    message='Token interno inválido',
                    code='INTERNAL_TOKEN_INVALID',
                    status_code=status.HTTP_401_UNAUTHORIZED,
                )

            _log_warn(f'Petición autenticada vía token de servicio interno: {request.path}', level="info")
            request.user = None
            request.django_user = None
            return view_func(request, *args, **kwargs)

        payload, error_response = autenticar_jwt(request)
        if error_response:
            return error_response

        request.user = payload
        request.django_user = (
            payload.get('preferred_username') or
            payload.get('upn') or
            payload.get('username')
        )

        return view_func(request, *args, **kwargs)

    return wrapped_view
