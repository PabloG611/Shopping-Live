from decouple import config
from django.http import HttpResponseNotFound, JsonResponse

from django.db import transaction
from gateway.models import Log
from gateway.services.identidad import resolver_id_usuario
from utils.log_redaction import redact, redact_mapping
from utils.logger_generico import _log_warn


class AtomicMiddleware:
    """
    Middleware that wraps each request in a transaction.
    """
    def __init__(self, get_response):
        self.get_response = get_response
 
    def __call__(self, request):
        try:
            with transaction.atomic():
                response = self.get_response(request)
                if response.status_code >= 400:
                    transaction.set_rollback(True)
            return response
        except Exception as e:
            _log_warn(f"AtomicMiddleware caught exception on {request.method} {request.path}: {str(e)}", level="error", exc_info=True)
            return JsonResponse(
                {"error": "Error processing request", "detail": str(e)},
                status=500
            )



    
class LoggerMiddlewareDatabase:
    """
    Guarda cada request/response en `Log` con los datos sensibles ocultos
    (tokens, cookies, contraseñas; ver utils.log_redaction).

    Debe ir en MIDDLEWARE **antes** de AtomicMiddleware: si queda dentro de su
    transacción, el registro se revierte junto con las respuestas >= 400.
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):

        body = ""
        is_binary = False

        # Loguear body solo si es un request textual
        if request.method in ("POST", "PUT", "PATCH"):
            raw = request.body
            try:
                # Intentar UTF-8 primero
                body = redact(raw.decode("utf-8"))
            except Exception:
                # Es binario → NO DECODIFICAR
                is_binary = True
                body = f"<binary data - {len(raw)} bytes>"

        log_entry = Log(
            metodo=request.method,
            url=redact(request.build_absolute_uri()),
            version_protocolo=request.META.get('SERVER_PROTOCOL', ''),
            headers=redact_mapping({k: v for k, v in request.META.items() if k.startswith('HTTP_')}),
            parametros=redact_mapping(request.GET.dict()),
            ipsolicitud=request.META.get('REMOTE_ADDR', ''),
            body_solicitud=body,
            es_archivo=is_binary
        )

        # Procesar request
        try:
            response = self.get_response(request)
        except Exception as e:
            log_entry.response_status = 500
            log_entry.body_response = redact(str(e))
            self._guardar(log_entry)
            raise e

        # Loguear response
        log_entry.response_status = response.status_code

        content_type = response.get("Content-Type", "")

        # Si el response es binario → NO DECODIFICAR
        if getattr(response, "streaming", False):
            log_entry.body_response = "<streaming response>"
        elif "application/json" not in content_type and ("application/" in content_type or "image/" in content_type):
            log_entry.body_response = f"<binary data - {len(response.content)} bytes>"
        else:
            try:
                log_entry.body_response = redact(response.content.decode("utf-8"))
            except Exception:
                log_entry.body_response = "<non-text response>"

        log_entry.response_headers = redact_mapping(dict(response.items()))

        log_entry.pato_id = self._pato_id(request)

        self._guardar(log_entry)

        return response

    @staticmethod
    def _pato_id(request):
        """
        Id del usuario autenticado, o None en endpoints públicos y peticiones
        sin autenticar. Nunca se toma del header Pato-ID del cliente.
        """
        # Lo deja el gateway tras validar el JWT
        pato_id = getattr(request, "pato_id", None)
        if pato_id:
            return pato_id
        # Vistas propias con @jwt_required: request.user es el payload del token
        payload = getattr(request, "user", None)
        if isinstance(payload, dict):
            try:
                pato_id, _ = resolver_id_usuario(payload)
                return pato_id
            except Exception:
                _log_warn("No se pudo resolver el Pato-ID para el log", level="warning", exc_info=True)
        return None

    @staticmethod
    def _guardar(log_entry):
        if transaction.get_connection().in_atomic_block:
            _log_warn("LoggerMiddlewareDatabase corre dentro de una transacción; "
                      "debe ir antes de AtomicMiddleware en MIDDLEWARE", level="warning")
        try:
            log_entry.save()
        except Exception:
            # Un fallo al registrar no debe tumbar la respuesta al cliente
            _log_warn("No se pudo guardar el log de la petición", level="error", exc_info=True)
