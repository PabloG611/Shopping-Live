import time
import jwt
import requests
from django.core.cache import cache
from decouple import config

from api.settings import decrypt_message
from utils.logger_generico import _log_warn

_TOKEN_KEY = 'protecdoc:token'
_LOCK_KEY = 'protecdoc:token:lock'
_BUFFER_SECONDS = 300   # refresca 5 min antes del vencimiento real
_LOCK_TIMEOUT = 30      # máximo tiempo sosteniendo el lock de refresco
_LOCK_RETRY_WAIT = 0.5
_LOCK_MAX_RETRIES = 20  # 10 s de espera total antes de fallar


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
                # Doble verificación: otro worker pudo haber refrescado mientras esperábamos
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

    raise RuntimeError('ProtecDoc: timeout esperando lock para refrescar token')


def _fetch_and_cache_token() -> str:
    base_url = decrypt_message(config('PROTECDOC_API_URL')).rstrip('/')
    url = f'{base_url}/soaint-sgd-web-api-gateway/apis/securidad-gateway-api/login'
    payload = {
        'login': decrypt_message(config('PROTECDOC_USERNAME')),
        'password': decrypt_message(config('PROTECDOC_PASSWORD')),
    }

    try:
        response = requests.post(url, json=payload, verify=config('ENVIRONMENT') == 'prod', timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        _log_warn(f'Error autenticando con ProtecDoc: {exc}', level="error")
        raise

    token = response.json()['token']
    claims = jwt.decode(token, options={'verify_signature': False})
    ttl = int(claims['exp'] - time.time()) - _BUFFER_SECONDS

    if ttl <= 0:
        raise RuntimeError('Token ProtecDoc recibido ya está próximo a expirar')

    cache.set(_TOKEN_KEY, token, ttl)
    _log_warn(f'Token ProtecDoc renovado. TTL en cache: {ttl}s', level="info")
    return token
