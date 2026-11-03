import json
from functools import wraps
from typing import Callable, Optional, Sequence
from urllib.parse import urlsplit

from django.core.cache import cache
from django.http import JsonResponse

from utils.logger_generico import _log_warn
# ——— Utilidades de extracción ———


def _safe_json(request):
    # Siempre leemos via request.body (y no request.data de DRF) para que
    # Django cachee el stream crudo; si usáramos request.data aquí, DRF
    # consume el stream sin cachear _body y la vista revienta después con
    # RawPostDataException al hacer json.loads(request.body).
    try:
        body = (request.body or b"").decode("utf-8") or "{}"
        return json.loads(body)
    except Exception:
        return {}


def _get_nested(d: dict, dotted: str):
    cur = d
    for p in dotted.split("."):
        if not isinstance(cur, dict) or p not in cur:
            return None
        cur = cur[p]
    return cur


def _client_ip(request):
    # Usa X-Forwarded-For si existe; si no, REMOTE_ADDR
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        # primera IP es la del cliente real
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "unknown")


def _clean_referer(request, include_path=True):
    """
    Devuelve host o host+primer segmento de path.
    Evitamos querystring para no fragmentar la clave.
    """
    ref = request.META.get("HTTP_REFERER") or ""
    if not ref:
        return None
    try:
        parts = urlsplit(ref)
        host = parts.netloc.lower()
        if not host:
            return None
        if include_path:
            # Tomamos a lo sumo el primer segmento del path
            seg = parts.path.strip("/").split("/", 1)[0]
            return f"{host}/{seg}" if seg else host
        return host
    except Exception:
        return None

# ——— Identidad por prioridad: json -> referer -> ip ———


def _default_ident(
    request,
    json_fields: Sequence[str],
    allow_referer: bool,
    referer_include_path: bool
):
    data = _safe_json(request)
    # 1) JSON (username/email/etc.)
    for path in json_fields:
        val = _get_nested(data, path)
        if isinstance(val, str) and val.strip():
            return ("json", val.strip().lower())
    # 2) Referer (para endpoints sin usuario)
    if allow_referer:
        ref = _clean_referer(request, include_path=referer_include_path)
        if ref:
            return ("ref", ref)
    # 3) IP
    return ("ip", _client_ip(request))

# ——— Decorador ———


def rate_limit(
    max_attempts: int = 5,
    window_seconds: int = 60,
    lock_seconds: int = 300,
    scope: str = "global",
    json_identity_fields: Sequence[str] = (
        "datosFormulario.username", "username", "email"),
    # identify(request) -> (kind, value) | value
    identify: Optional[Callable] = None,
    allow_referer: bool = True,
    referer_include_path: bool = True,
    status_code_locked: int = 429,
    error_message: str = "Demasiados intentos. Intenta más tarde."
):
    """
    Rate limit con ventana fija + lock temporal en Redis.
    Identidad por prioridad: JSON -> Referer -> IP.
    - scope separa espacios por funcionalidad ("recovery", "login", etc.).
    - identify permite un método de identificación custom.
    - allow_referer True para endpoints sin usuario.
    """
    def decorator(view_func):
        @wraps(view_func)
        def _wrapped(request, *args, **kwargs):
            # Construir identidad
            ident_kind, ident_value = None, None
            if identify:
                raw = identify(request)
                if isinstance(raw, tuple) and len(raw) == 2:
                    ident_kind, ident_value = raw[0], str(raw[1])
                else:
                    ident_kind, ident_value = "id", str(raw)
            else:
                ident_kind, ident_value = _default_ident(
                    request,
                    json_identity_fields,
                    allow_referer,
                    referer_include_path
                )

            ident_value = ident_value or "unknown"
            key_base = f"{scope}:{ident_kind}:{ident_value}"

            counter_key = f"rate:{key_base}"
            lock_key = f"lock:{key_base}"

            # Bloqueado actualmente
            if cache.get(lock_key):
                resp = JsonResponse({"error": error_message},
                                    status=status_code_locked)
                # Añadimos Retry-After si el backend lo soporta
                try:
                    ttl = cache.ttl(lock_key)  # disponible en django-redis
                    if isinstance(ttl, int) and ttl > 0:
                        resp["Retry-After"] = str(ttl)
                except Exception:
                    # otro backend sin ttl; vivimos con ello
                    pass
                return resp

            # Incremento atómico con ventana fija
            current = cache.get(counter_key)
            if current is None:
                cache.add(counter_key, 1, timeout=window_seconds)
                attempts = 1
            else:
                attempts = cache.incr(counter_key)
                
            _log_warn(f"Rate limit {key_base}: {attempts} attempts", level="debug")
            if attempts > max_attempts:
                cache.set(lock_key, 1, timeout=lock_seconds)
                cache.delete(counter_key)
                resp = JsonResponse({"error": error_message},
                                    status=status_code_locked)
                try:
                    resp["Retry-After"] = str(lock_seconds)
                except Exception:
                    pass
                return resp

            return view_func(request, *args, **kwargs)
        return _wrapped
    return decorator
