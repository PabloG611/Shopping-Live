import hmac
from urllib.parse import urlparse
from decouple import config
from django.http import HttpResponseNotFound

from utils.logger_generico import _log_warn


class ServiceSecurityMiddleware:
    """
    DEPRECATED:
    Esta lógica fue consolidada en
    api.middlewares.SecureRequestMiddleware.SecureRequestMiddleware.
    Mantener este archivo solo por compatibilidad temporal.
    """
    

    def __init__(self, get_response):
        self.get_response = get_response
        self.environment = config("ENVIRONMENT", default="dev")
        self.internal_token = config("INTERNAL_SERVICE_TOKEN")
        self.allowed_origins = config(
            "ALLOWED_SOURCES",
            cast=lambda v: [s.strip() for s in v.split(",") if s.strip()],
            default="",
        )
        
    def is_url_bypasseable(self, request):
        """
        Determina si la URL de la petición puede ser ignorada por este middleware.
        """
        bypass_urls = [
            "/api-auth/auth/",
            "/api-gateway/",
        ]
        return any(request.path.startswith(url) for url in bypass_urls)

    def is_token_valid(self, request):
        token = request.headers.get("X-Internal-Token")
        return bool(
            token
            and self.internal_token
            and hmac.compare_digest(token.encode("utf-8"), self.internal_token.encode("utf-8"))
        )

    def is_origin_allowed(self, request):
        origin = request.headers.get("Origin")
        referer = request.headers.get("Referer")
        url = origin or referer

        if not url:
            return False

        hostname = urlparse(url).hostname
        return hostname in self.allowed_origins

    def __call__(self, request):

        if self.is_url_bypasseable(request):
            return self.get_response(request)

        # 1. Token interno: backends comunicándose entre sí (no tienen Origin/Referer)
        if self.is_token_valid(request):
            return self.get_response(request)

        # 2. Modo desarrollo: si el entorno no es prod, dejar pasar todo
        if self.environment != "prod":
            return self.get_response(request)
        _log_warn("Petición bloqueada por ServiceSecurityMiddleware: no cumple con token interno ni origen permitido.")
        return HttpResponseNotFound()
