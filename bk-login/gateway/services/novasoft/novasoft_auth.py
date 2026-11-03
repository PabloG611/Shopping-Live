import re
import time
from datetime import datetime, timezone

import requests
from django.core.cache import cache
from decouple import config

from api.settings import decrypt_message
from utils.logger_generico import _log_warn

_TOKEN_KEY = 'novasoft:token'
_LOCK_KEY = 'novasoft:token:lock'
_BUFFER_SECONDS = 300
_LOCK_TIMEOUT = 30
_LOCK_RETRY_WAIT = 0.5
_LOCK_MAX_RETRIES = 20


def get_token() -> str:
    token = cache.get(_TOKEN_KEY)
    if token:
        return token
    return _locked_refresh()


def invalidate_token() -> None:
    """Fuerza el refresco en el próximo get_token() (p. ej. tras recibir un 401)."""
    cache.delete(_TOKEN_KEY)


def _locked_refresh() -> str:
    for _ in range(_LOCK_MAX_RETRIES):
        if cache.add(_LOCK_KEY, 1, _LOCK_TIMEOUT):
            try:
                token = cache.get(_TOKEN_KEY)
                if token:
                    return token
                return _fetch_and_cache_token()
            finally:
                cache.delete(_LOCK_KEY)

        time.sleep(_LOCK_RETRY_WAIT)
        token = cache.get(_TOKEN_KEY)
        if token:
            return token

    raise RuntimeError('Novasoft: timeout esperando lock para refrescar token')


def _parse_expiration(expiration_str: str) -> datetime:
    # Normaliza "2026-05-04T18:34:17.6891828Z" → datetime UTC
    # Trunca fracciones de segundo a 6 dígitos y reemplaza Z por +00:00
    clean = re.sub(r'(\.\d{6})\d*', r'\1', expiration_str)
    clean = clean.rstrip('Z') + '+00:00'
    return datetime.fromisoformat(clean)


def _fetch_and_cache_token() -> str:
    base_url = decrypt_message(config('NOVASOFT_API_URL')).rstrip('/')
    url = f'{base_url}/Cuenta/Login'
    payload = {
        'userLogin': decrypt_message(config('NOVASOFT_USERNAME')),
        'password': decrypt_message(config('NOVASOFT_PASSWORD')),
        'connectionName': decrypt_message(config('NOVASOFT_CONNECTION_NAME')),
    }

    try:
        response = requests.post(url, json=payload, verify=config('ENVIRONMENT') == 'prod', timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        _log_warn(f'Error autenticando con Novasoft: {exc}', level="error")
        raise

    data = response.json()
    token = data['token']
    expiration_dt = _parse_expiration(data['expiration'])
    ttl = int(expiration_dt.timestamp() - time.time()) - _BUFFER_SECONDS

    if ttl <= 0:
        raise RuntimeError('Token Novasoft recibido ya está próximo a expirar')

    cache.set(_TOKEN_KEY, token, ttl)
    _log_warn(f'Token Novasoft renovado. TTL en cache: {ttl}s', level="info")
    return token
