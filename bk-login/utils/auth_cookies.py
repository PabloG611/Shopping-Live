"""
Helpers para la cookie httpOnly del access_token (ver variables AUTH_COOKIE_*
en .env).

El token se sigue enviando también en el body de la respuesta; esta cookie es
un canal adicional, acotado con path=/api-auth/ para que ningún otro backend
detrás del mismo dominio (api-doc, api-sgai, api-ser, etc.) la reciba.
"""
import base64
import binascii
import json
import os
from urllib.parse import quote

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from decouple import config
from django.core.exceptions import ImproperlyConfigured

ACCESS_TOKEN_COOKIE_NAME = 'access_token'
ACCESS_TOKEN_COOKIE_PATH = '/api-auth/'
REFRESH_TOKEN_COOKIE_NAME = 'refresh_token'
REFRESH_TOKEN_COOKIE_PATH = '/api-auth/auth/refresh_token/'


def cookies_enabled() -> bool:
    """
    Interruptor global COOKIES (.env). Con COOKIES=False no se emiten ni se
    leen cookies de autenticación: todo funciona con Authorization: Bearer
    (para cualquier usuario) y el refresh_token por body.
    """
    return config('COOKIES', cast=bool, default=True)


CANARIO_VIVO_TEXTO = 'El canario esta vivo'
_TOKENS_BODY_KEYS = ('access_token', 'refresh_token')


def canario_vivo() -> bool:
    """
    Interruptor CANARIO_VIVO (.env). Con CANARIO_VIVO=True los endpoints de
    login/refresh no devuelven el JWT ni el refresh_token en el body: viajan
    solo por cookies y en el body se envía el texto CANARIO_VIVO_TEXTO.
    Sin COOKIES no aplica, porque el cliente se quedaría sin tokens.
    """
    return config('CANARIO_VIVO', cast=bool, default=False) and cookies_enabled()


def ocultar_tokens_body(data: dict, es_mobile: bool = False) -> dict:
    """
    Reemplaza access_token/refresh_token del body por CANARIO_VIVO_TEXTO si
    CANARIO_VIVO está activo. No aplica a sesiones mobile: no manejan cookies
    y el body es su único canal para recibir los tokens.
    """
    if canario_vivo() and not es_mobile:
        for key in _TOKENS_BODY_KEYS:
            if data.get(key):
                data[key] = CANARIO_VIVO_TEXTO
    return data


def _cookie_enabled() -> bool:
    return cookies_enabled() and config('AUTH_COOKIE_ENABLED', cast=bool, default=True)


def set_refresh_token_cookie(response, request, refresh_token, max_age):
    """Adjunta el refresh_token como cookie httpOnly acotada al endpoint de refresh."""
    if not refresh_token or not cookies_enabled():
        return
    response.set_cookie(
        REFRESH_TOKEN_COOKIE_NAME,
        refresh_token,
        httponly=True,
        secure=request.is_secure(),
        samesite='Strict',
        max_age=max_age,
        path=REFRESH_TOKEN_COOKIE_PATH,
    )


def set_access_token_cookie(response, request, access_token, exp_minutes=None):
    """Adjunta el access_token como cookie httpOnly acotada a bk-login."""
    if not access_token or not _cookie_enabled():
        return

    max_age_env = config('AUTH_ACCESS_COOKIE_MAX_AGE', default='')
    if max_age_env:
        max_age = int(max_age_env)
    elif exp_minutes:
        max_age = exp_minutes * 60
    else:
        max_age = None

    domain = config('AUTH_COOKIE_DOMAIN', default='') or None

    response.set_cookie(
        ACCESS_TOKEN_COOKIE_NAME,
        access_token,
        httponly=True,
        secure=config('AUTH_COOKIE_SECURE', cast=bool, default=True),
        samesite=config('AUTH_COOKIE_SAMESITE', default='Strict'),
        max_age=max_age,
        domain=domain,
        path=ACCESS_TOKEN_COOKIE_PATH,
    )


# --- Cookies de sesión con los tokens cifrados con AES-128-GCM (10 rondas),
# clave en SESSION_COOKIE_AES_KEY (.env). Ver HTTPONLY_COOKIES y
# SECURE_COOKIES en .env. Son cookies de sesión: sin max_age/expires, el
# navegador las descarta al cerrarse.
JWT_SESSION_COOKIE_NAME = 'jwt_token'
REFRESH_SESSION_COOKIE_NAME = 'refresh_jwt_token'
SESSION_COOKIE_PATH = '/'

_AES_KEY_BYTES = 16  # AES-128 => 10 rondas
_GCM_NONCE_BYTES = 12


def _session_cookie_cipher() -> AESGCM:
    """
    AESGCM con la clave SESSION_COOKIE_AES_KEY (.env): 16 bytes en base64
    (generar con `python -c "import os,base64;print(base64.b64encode(os.urandom(16)).decode())"`).
    """
    raw = config('SESSION_COOKIE_AES_KEY', default='')
    try:
        key = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError):
        key = b''
    if len(key) != _AES_KEY_BYTES:
        raise ImproperlyConfigured(
            'SESSION_COOKIE_AES_KEY debe ser una clave AES-128 (16 bytes) en base64.'
        )
    return AESGCM(key)


def encrypt_cookie_value(value: str, name: str) -> str:
    """
    Cifra un string con AES-128-GCM. Resultado: base64url(nonce || cifrado+tag).
    El nombre de la cookie va como dato asociado, así un valor no se puede
    trasladar de una cookie a otra.
    """
    nonce = os.urandom(_GCM_NONCE_BYTES)
    ciphertext = _session_cookie_cipher().encrypt(
        nonce, value.encode('utf-8'), name.encode('utf-8')
    )
    return base64.urlsafe_b64encode(nonce + ciphertext).rstrip(b'=').decode('ascii')


def decrypt_cookie_value(value: str, name: str) -> str:
    """Descifra un valor producido por encrypt_cookie_value; InvalidTag si fue alterado."""
    data = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
    nonce, ciphertext = data[:_GCM_NONCE_BYTES], data[_GCM_NONCE_BYTES:]
    return _session_cookie_cipher().decrypt(
        nonce, ciphertext, name.encode('utf-8')
    ).decode('utf-8')


def set_session_token_cookies(response, jwt_token, refresh_token=None):
    """Adjunta jwt_token y refresh_token (cifrados con AES-128-GCM) como cookies de sesión."""
    if not cookies_enabled():
        return
    common = {
        'httponly': config('HTTPONLY_COOKIES', cast=bool, default=True),
        'secure': config('SECURE_COOKIES', cast=bool, default=True),
        'samesite': config('AUTH_COOKIE_SAMESITE', default='Strict'),
        'domain': config('AUTH_COOKIE_DOMAIN', default='') or None,
        'path': SESSION_COOKIE_PATH,
    }
    if jwt_token:
        response.set_cookie(
            JWT_SESSION_COOKIE_NAME,
            encrypt_cookie_value(jwt_token, JWT_SESSION_COOKIE_NAME),
            **common,
        )
    if refresh_token:
        response.set_cookie(
            REFRESH_SESSION_COOKIE_NAME,
            encrypt_cookie_value(refresh_token, REFRESH_SESSION_COOKIE_NAME),
            **common,
        )


def delete_session_token_cookies(response):
    """Elimina las cookies de sesión de jwt_token, refresh_token y sockets_available."""
    domain = config('AUTH_COOKIE_DOMAIN', default='') or None
    for name in (JWT_SESSION_COOKIE_NAME, REFRESH_SESSION_COOKIE_NAME, SOCKETS_COOKIE_NAME):
        response.delete_cookie(name, path=SESSION_COOKIE_PATH, domain=domain)


# --- Cookie de sesión con los sockets a los que el usuario tiene acceso según
# sus roles (tablas SocketAvailable / SocketAvailableRole). El valor es la
# lista en JSON codificada como URL (en el front: JSON.parse(decodeURIComponent(v))).
# Es solo informativa para el front: el servidor de sockets debe validar el
# acceso por su cuenta. Por defecto no es httpOnly para que el front la lea
# (SOCKETS_COOKIE_HTTPONLY en .env).
SOCKETS_COOKIE_NAME = 'sockets_available'


def set_sockets_cookie(response, user):
    """Adjunta la cookie sockets_available con los sockets permitidos para los roles del usuario."""
    if user is None or not cookies_enabled():
        return
    from custom_auth.models.models_global import SocketAvailable

    sockets = SocketAvailable.nombres_para_usuario(user)
    response.set_cookie(
        SOCKETS_COOKIE_NAME,
        quote(json.dumps(sockets, separators=(',', ':')), safe=''),
        httponly=config('SOCKETS_COOKIE_HTTPONLY', cast=bool, default=False),
        secure=config('SECURE_COOKIES', cast=bool, default=True),
        samesite=config('AUTH_COOKIE_SAMESITE', default='Strict'),
        domain=config('AUTH_COOKIE_DOMAIN', default='') or None,
        path=SESSION_COOKIE_PATH,
    )


def _read_encrypted_cookie(request, name):
    value = request.COOKIES.get(name)
    if not value:
        return None
    try:
        return decrypt_cookie_value(value, name)
    except (InvalidTag, ValueError, binascii.Error, UnicodeDecodeError):
        return None


def get_jwt_from_cookies(request):
    """jwt_token (AES-128-GCM) de la cookie de sesión; respaldo: cookie access_token."""
    if not cookies_enabled():
        return None
    return (
        _read_encrypted_cookie(request, JWT_SESSION_COOKIE_NAME)
        or request.COOKIES.get(ACCESS_TOKEN_COOKIE_NAME)
    )


def get_refresh_from_cookies(request):
    """refresh_jwt_token (AES-128-GCM) de la cookie de sesión; respaldo: cookie refresh_token."""
    if not cookies_enabled():
        return None
    return (
        _read_encrypted_cookie(request, REFRESH_SESSION_COOKIE_NAME)
        or request.COOKIES.get(REFRESH_TOKEN_COOKIE_NAME)
    )
