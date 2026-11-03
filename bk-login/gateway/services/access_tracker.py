from django_redis import get_redis_connection
from utils.logger_generico import _log_warn

_KEY_PREFIX = "gateway:access"


def record_access(data_url: dict, path: str) -> None:
    """
    Registers an access event in Redis as a Hash:
      Key:   gateway:access:{dependencia}:{grupo}:{rol_base}
      Field: {path}
      Value: cumulative access count (HINCRBY)

    Silent on any Redis failure — never raises.
    """
    try:
        dependencia = data_url.get("dependencia")
        grupo = data_url.get("grupo")
        rol = data_url.get("rol")

        if not all([dependencia, grupo, rol]):
            return

        rol_base = rol.split("/")[0]
        redis_key = f"{_KEY_PREFIX}:{dependencia}:{grupo}:{rol_base}"

        conn = get_redis_connection("default")
        conn.hincrby(redis_key, path, 1)

        _log_warn(f"access_tracker: {redis_key} → {path}", level="debug")
    except Exception as exc:
        _log_warn(f"access_tracker: failed to record access — {type(exc).__name__}: {exc}", level="warning")
