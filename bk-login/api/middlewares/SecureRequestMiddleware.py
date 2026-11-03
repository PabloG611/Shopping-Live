import json
import hashlib
import hmac
from urllib.parse import urlparse
from django.http import HttpResponseNotFound, JsonResponse
from decouple import config
from rest_framework import status

from utils.logger_generico import _log_warn


class SecureRequestMiddleware:
    # Rutas que gestionan su propia autenticación (login/2FA y el gateway,
    # que valida el JWT del usuario internamente) y por tanto no requieren
    # X-Internal-Token para ser alcanzadas.
    BYPASSED_PATH_PREFIXES = ("/api-auth/auth/", "/api-gateway/")

    def __init__(self, get_response):
        self.get_response = get_response
        self.environment = config("ENVIRONMENT", default="dev")
        self.internal_token = config("INTERNAL_SERVICE_TOKEN", default="")

    def _is_bypassed_path(self, request) -> bool:
        # Se compara contra `request.path` (ya resuelto/saneado por Django
        # para el ruteo, no un header controlable por el cliente como
        # Origin/Referer) en lugar de la URL cruda de la petición.
        sanitized_path = urlparse(request.path).path
        return sanitized_path.startswith(self.BYPASSED_PATH_PREFIXES)

    def _is_internal_token_valid(self, request) -> bool:
        token = request.headers.get("X-Internal-Token", "")
        return bool(
            token
            and self.internal_token
            and hmac.compare_digest(token.encode("utf-8"), self.internal_token.encode("utf-8"))
        )

    def __call__(self, request):
        is_mobile = request.headers.get('x-request-source') == 'mobile_app'
        request.is_mobile = is_mobile
        method = request.method.upper()
        requires_body_signature = method in ('POST', 'PUT', 'PATCH')

        content_type = request.headers.get('Content-Type', '')
        is_json_request = 'application/json' in content_type.lower()

        payload = ''
        if is_json_request and request.body.strip():
            try:
                payload = request.body.decode('utf-8')
                json.loads(payload)
            except Exception as e:
                return JsonResponse({'message': 'Invalid JSON body', 'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

        if is_mobile:
            try:
                received_signature = request.headers.get('X-Signature')
                timestamp = request.headers.get('X-Timestamp')
                user_agent = request.headers.get('User-Agent', '')

                if not user_agent:
                    return JsonResponse({'message': 'Incomplete headers'}, status=status.HTTP_400_BAD_REQUEST)

                if requires_body_signature and (not received_signature or not timestamp):
                    return JsonResponse({'message': 'Incomplete headers'}, status=status.HTTP_400_BAD_REQUEST)

                if "application-unp/1.0" not in user_agent:
                    return JsonResponse({'message': 'User-Agent unauthorized'}, status=status.HTTP_401_UNAUTHORIZED)

                if requires_body_signature and not is_json_request:
                    return JsonResponse({'message': 'Invalid content type for mobile request'}, status=status.HTTP_400_BAD_REQUEST)

                if requires_body_signature:
                    calculated_signature = hmac.new(
                        config('SECRET_KEY_MOVIL').encode('utf-8'),
                        payload.encode('utf-8'),
                        hashlib.sha256
                    ).hexdigest()

                    if not hmac.compare_digest(received_signature, calculated_signature):
                        return JsonResponse({'message': 'Invalid signature'}, status=status.HTTP_403_FORBIDDEN)

            except Exception as e:
                return JsonResponse(
                    {"message": "Error processing signature", "code": "SIGNATURE_PROCESSING_ERROR"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )

        # Mobile y web: rutas de login/2FA y el gateway validan su propia
        # autenticación (JWT de usuario) más adelante; todo lo demás exige
        # el token interno de servicio, sin excepciones por Origin/Referer,
        # por header Authorization, por entorno ni por ser mobile.
        if self._is_bypassed_path(request):
            return self.get_response(request)

        if not self._is_internal_token_valid(request):
            _log_warn(
                f"Petición bloqueada por SecureRequestMiddleware: falta X-Internal-Token válido. Path: {request.path}",
                level="warning",
            )
            return HttpResponseNotFound()

        return self.get_response(request)
