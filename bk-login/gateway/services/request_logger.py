import json
from pathlib import Path

from decouple import config
from django.utils import timezone
from django_redis import get_redis_connection

from utils.logger_generico import _log_warn

# Ruta (montada como volumen externo de Docker) donde se acumulan los logs
# diarios de actividad del proxy del gateway. Si no está configurada, el
# volcado a archivo se omite (silencioso) en vez de romper la petición.
EXTERNAL_VOLUME_PATH = config('EXTERNAL_VOLUME_PATH', default='')

# Buffer y contador compartidos en Redis entre todos los workers/réplicas.
_BUFFER_KEY = "gateway:proxy_log:buffer"
_COUNTER_KEY = "gateway:proxy_log:counter"
_FLUSH_THRESHOLD = 30


def _client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _construir_evento(request, bk_service, safe_path, headers_redactados, id_usuario, rol_instance, status_code, duracion_ms):
    return {
        "timestamp": timezone.now().isoformat(),
        "method": request.method,
        "bk_service": bk_service,
        "path": safe_path,
        "status_code": status_code,
        "duracion_ms": duracion_ms,
        "id_usuario": id_usuario,
        "rol": rol_instance.id_rol if rol_instance is not None else None,
        "ip": _client_ip(request),
        "user_agent": request.headers.get("User-Agent", ""),
        "request_id": headers_redactados.get("X-Request-ID") or None,
        "headers": headers_redactados,
    }


def _ruta_archivo_log():
    nombre = f"{timezone.now().strftime('%Y-%m-%d')}.log"
    return Path(EXTERNAL_VOLUME_PATH) / nombre


def _flush_buffer_a_archivo():
    """Vacía lo acumulado en Redis (buffer + contador) y lo agrega al archivo del día."""
    if not EXTERNAL_VOLUME_PATH:
        _log_warn("request_logger: EXTERNAL_VOLUME_PATH no configurado; se omite el volcado a archivo", level="warning")
        return

    try:
        conn = get_redis_connection("default")
        # GETSET es atómico: lee el contenido acumulado y lo deja vacío en la
        # misma operación, sin ventana en la que otro worker pueda perder líneas.
        contenido = conn.getset(_BUFFER_KEY, "")
        conn.set(_COUNTER_KEY, 0)
    except Exception as exc:
        _log_warn(f"request_logger: fallo leyendo/reiniciando el buffer en Redis — {type(exc).__name__}: {exc}", level="warning")
        return

    if not contenido:
        return

    try:
        if isinstance(contenido, bytes):
            contenido = contenido.decode("utf-8")

        ruta = _ruta_archivo_log()
        ruta.parent.mkdir(parents=True, exist_ok=True)
        with open(ruta, "a", encoding="utf-8") as archivo:
            archivo.write(contenido)
    except Exception as exc:
        _log_warn(f"request_logger: fallo escribiendo el archivo de log del proxy — {type(exc).__name__}: {exc}", level="warning")


def registrar_evento_proxy(request, bk_service, safe_path, headers_redactados, id_usuario, rol_instance, status_code, duracion_ms):
    """
    Construye el evento de una solicitud del proxy del gateway en JSON y lo
    acumula en Redis. Cada 30 solicitudes (contador compartido entre workers y
    réplicas), vacía lo acumulado al archivo del día en EXTERNAL_VOLUME_PATH.

    Silencioso ante cualquier falla (Redis o disco) — nunca debe afectar la
    respuesta al cliente, mismo criterio que `access_tracker.record_access`.
    """
    try:
        evento = _construir_evento(
            request, bk_service, safe_path, headers_redactados,
            id_usuario, rol_instance, status_code, duracion_ms,
        )
        linea = json.dumps(evento, ensure_ascii=False, default=str) + "\n"

        conn = get_redis_connection("default")
        conn.append(_BUFFER_KEY, linea)
        contador = conn.incr(_COUNTER_KEY)

        if contador % _FLUSH_THRESHOLD == 0:
            _flush_buffer_a_archivo()
    except Exception as exc:
        _log_warn(f"request_logger: fallo registrando evento del proxy — {type(exc).__name__}: {exc}", level="warning")
