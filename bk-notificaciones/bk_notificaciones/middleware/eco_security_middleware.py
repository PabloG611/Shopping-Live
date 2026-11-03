from urllib.parse import urlparse
from decouple import config
from django.http import HttpResponseNotFound

import logging
logger = logging.getLogger(__name__)


class ServiceSecurityMiddleware:

    def __init__(self, get_response):
        self.get_response = get_response
        self.environment = config("ENVIRONMENT", default="dev")
        self.internal_token = config("INTERNAL_SERVICE_TOKEN")
        self.allowed_origins = config(
            "ALLOWED_SOURCES",
            cast=lambda v: [s.strip() for s in v.split(",") if s.strip()],
            default="",
        )

    def is_token_valid(self, request):
        token = request.headers.get("X-Internal-Token")
        return bool(token and token == self.internal_token)

    def is_origin_allowed(self, request):
        origin = request.headers.get("Origin")
        referer = request.headers.get("Referer")
        url = origin or referer

        if not url:
            return False

        hostname = urlparse(url).hostname
        return hostname in self.allowed_origins

    def __call__(self, request):

        # 1. Token interno: backends comunicándose entre sí (no tienen Origin/Referer)
        if self.is_token_valid(request):
            return self.get_response(request)

        # 2. Origin/Referer: peticiones del frontend (solo si ALLOWED_ORIGINS está configurado)
        if self.allowed_origins and self.is_origin_allowed(request):
            return self.get_response(request)

        # 3. Modo desarrollo: si el entorno no es prod, dejar pasar todo
        if self.environment != "prod":
            return self.get_response(request)

        return HttpResponseNotFound()
