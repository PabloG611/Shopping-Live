import requests
from decouple import config

from api.settings import decrypt_message
from gateway.services.protecdoc.protecdoc_auth import get_token, invalidate_token
from utils.logger_generico import _log_warn

_TIMEOUT = 30


def _base_url() -> str:
    return decrypt_message(config('PROTECDOC_API_URL')).rstrip('/')


def request(method: str, path: str, **kwargs) -> requests.Response:
    """Punto único de llamadas a ProtecDoc. Reintenta una vez si recibe 401."""
    url = f'{_base_url()}{path}'
    kwargs.setdefault('verify', config('ENVIRONMENT') == 'prod')
    timeout = kwargs.pop('timeout', _TIMEOUT)

    response = requests.request(method, url, headers={'Authorization': f'Bearer {get_token()}'}, timeout=timeout, **kwargs)

    if response.status_code == 401:
        _log_warn(f'ProtecDoc 401 en {path}, renovando token y reintentando', level="warning")
        invalidate_token()
        response = requests.request(method, url, headers={'Authorization': f'Bearer {get_token()}'}, timeout=timeout, **kwargs)

    return response
