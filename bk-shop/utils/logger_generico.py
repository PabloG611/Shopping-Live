import logging
import inspect
logger = logging.getLogger(__name__)

# Mensajes
def _log_warn(msg, level='info', exc_info=False, extra=None):
    """
    Registrar mensajes usando el logger configurado.

    Parámetros:
      msg: mensaje (se convierte a str).
      level: nivel de log ('debug','info','warning','error','critical' o int). Default 'info'.
      exc_info: bool o excepción para incluir traceback. Default False.
      extra: dict opcional para pasar como extra al logger.

    Llamadas anteriores _log_warn(msg) siguen funcionando y producirán un INFO por defecto.
    """
    # compatibilidad: si se llama con un solo argumento, funciona como antes (INFO)
    try:
        # obtener frame llamante de forma ligera
        frm = inspect.currentframe()
        caller = frm.f_back if frm is not None else None
        mod = inspect.getmodule(caller) if caller is not None else None
        logger_name = mod.__name__ if mod and hasattr(mod, '__name__') else __name__
        logger = logging.getLogger(logger_name)

        extra = extra or {}
        lvl = level.lower() if isinstance(level, str) else None

        if isinstance(level, str):
            lvl = level.lower()
            if lvl == 'debug':
                logger.debug("%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
            elif lvl == 'info':
                logger.info("%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
            elif lvl in ('warn', 'warning'):
                logger.warning("%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
            elif lvl == 'error':
                logger.error("%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
            elif lvl == 'critical':
                logger.critical("%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
            else:
                logger.info("%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
        else:
            # nivel numérico
            logger.log(int(level), "%s", str(msg), exc_info=exc_info, **({'extra': extra} if extra else {}))
    except Exception:
        try:
            logging.getLogger(__name__).error("Error al loggear mensaje: %s", str(msg), exc_info=True)
        except Exception:
            pass

# Usos de _log_warn
'''
# Mensaje simple (por compatibilidad -> level='info')
_log_warn("Inicio del proceso")


# Nivel explícito
_log_warn("Campo faltante en payload", level="warning")
_log_warn("Operación completada", level="debug")


# Con exception traceback dentro de un except
try:
    # hacer_algo()
    print(1) # ejemplo que lanza excepción
except Exception as e:
    _log_warn(f"Error al ejecutar hacer_algo: {e}", level="error", exc_info=True)


# Loggear estructuras (dict/list) de forma legible
import json
data = {"usuario": "juan", "roles": ["admin", "analista"]}
_log_warn(json.dumps(data, ensure_ascii=False), level="info")


# o directamente (se convierte a str internamente)
_log_warn(data, level="debug")


# Loggear una instancia Django (recomendado convertir a dict)
from django.forms.models import model_to_dict
instancia_modelo = ...  # instancia de un modelo Django
_log_warn(model_to_dict(instancia_modelo), level="debug")


# Loggear una instancia Django (recomendado convertir a dict)
from django.forms.models import model_to_dict
_log_warn(model_to_dict(instancia_modelo), level="debug")

# Usar extra para pasar metadata (si el handler/formatter lo soporta)
user = ...  # instancia de usuario
ot = ...    # alguna otra variable relevante
_log_warn("Acceso a recurso", level="info", extra={"user_id": str(user.id), "ot": ot})

# Nivel numérico
_log_warn("Mensaje crítico numérico", level=50)  # equivale a CRITICAL

'''