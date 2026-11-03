"""
Filtro de logging que oculta valores sensibles (***REDACTED***) antes de
escribir cualquier registro: JWT, Bearer tokens, cookies de sesión,
fingerprints, contraseñas y secretos.

Se registra en settings.LOGGING sobre el handler de consola, así que aplica a
todos los loggers (incluido _log_warn) sin cambiar cada llamada.
"""
import logging
import re

REDACTED = '***REDACTED***'

_SENSITIVE_KEYS = (
    'authorization', 'x-internal-token', 'cookie', 'set-cookie',
    'access_token', 'refresh_token', 'jwt_token', 'refresh_jwt_token',
    'id_token', 'token_sp', 'refresh', 'token',
    'fingerprint', 'x-fingerprint',
    'password', 'passwd', 'secret', 'client_secret', 'otp_code', 'recaptcha',
)
_KEYS = '|'.join(re.escape(k) for k in sorted(_SENSITIVE_KEYS, key=len, reverse=True))

_PATTERNS = (
    # JWT (header.payload.firma)
    (re.compile(r'eyJ[\w-]+\.[\w-]+\.[\w-]*'), REDACTED),
    # Authorization: Bearer <token>
    (re.compile(r'(?i)(bearer\s+)[^\s\'",;}]+'), r'\1' + REDACTED),
    # "clave": "valor"  /  'clave': 'valor'
    (re.compile(r'(?i)([\'"](?:' + _KEYS + r')[\'"]\s*:\s*)([\'"])(?:(?!\2).)*\2'),
     r'\1\2' + REDACTED + r'\2'),
    # clave=valor  /  clave: valor (texto libre y cookies)
    (re.compile(r'(?i)\b((?:' + _KEYS + r')\s*[=:]\s*)(?![\'"]?\*\*\*)[^\s,;&}\'")]+'),
     r'\1' + REDACTED),
)


def redact(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


_SENSITIVE_KEYS_NORMALIZED = {k.replace('_', '-') for k in _SENSITIVE_KEYS}


def _is_sensitive_key(key) -> bool:
    normalized = str(key).lower().replace('_', '-')
    if normalized.startswith('http-'):
        normalized = normalized[len('http-'):]
    return normalized in _SENSITIVE_KEYS_NORMALIZED


def redact_mapping(data: dict) -> dict:
    """Copia de `data` con los valores de claves sensibles ocultos.

    Acepta claves de `request.META` (HTTP_X_INTERNAL_TOKEN), headers
    (X-Internal-Token) y campos de formularios o query strings.
    """
    return {
        k: REDACTED if _is_sensitive_key(k) else (redact(v) if isinstance(v, str) else v)
        for k, v in data.items()
    }


class RedactSensitiveFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
            redacted = redact(message)
            if redacted != message:
                record.msg = redacted
                record.args = ()
        except Exception:
            pass
        return True
