import jwt
from functools import wraps
from django.http import JsonResponse
from rest_framework import status
from decouple import config
from jwt import PyJWKClient
from jwt.exceptions import InvalidTokenError, InvalidAudienceError, InvalidIssuerError
from custom_auth.models.models_global import Session
from django.contrib.auth.models import User
from builders import ResponseBuilder
from utils.auth_cookies import cookies_enabled, get_jwt_from_cookies
from custom_auth.models.models_global import UsuarioExtendido

from utils.logger_generico import _log_warn

# Valor de Session.platform con el que los logins mobile registran la sesión.
SESSION_PLATFORM_MOBILE = "mobile"


def validate_microsoft_token(token):
    jwks_url = f"https://login.microsoftonline.com/{config('MICROSOFT_TENANT')}/discovery/v2.0/keys"
    issuer_url = f"https://login.microsoftonline.com/{config('MICROSOFT_TENANT')}/v2.0"
    audience = config('MICROSOFT_CLIENT_ID')

    try:
        jwks_client = PyJWKClient(jwks_url)
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        decoded_token = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=issuer_url
        )

        return decoded_token
    
    except InvalidAudienceError as e:
        raise InvalidTokenError(f"Audiencia del token inválida: {e}")
    except InvalidIssuerError as e:
        raise InvalidTokenError(f"Emisor del token inválido: {e}")
    except jwt.InvalidAlgorithmError as e:
        raise InvalidTokenError(f"Algoritmo de firma no soportado: {e}")
    except jwt.DecodeError as e:
        raise InvalidTokenError(f"Token malformado o firma inválida: {e}")
    except Exception as e:
        raise InvalidTokenError(f"Error al validar el token: {str(e)}")


def validate_propio_token(token):
    try:
        payload = jwt.decode(token, config('TOKEN_SECRET_KEY'), algorithms=["HS256"])
        return payload
    
    except jwt.InvalidTokenError as e:
        raise InvalidTokenError(f"Token inválido: {str(e)}")


def _validate_token(token: str) -> tuple:
    """
    Valida un token JWT probando ambos validadores disponibles.
    NO confía en el header 'alg' sin verificar (previene algorithm confusion).

    Orden de validación:
        1. Token propio (HS256) — validación local, rápida y sin red.
        2. Token Microsoft (RS256) — validación con JWKS remoto.

    Args:
        token: Token JWT a validar.

    Returns:
        Tuple (payload: dict, token_type: str).

    Raises:
        InvalidTokenError: Si el token no es válido con ningún método.
    """
    errors = []

    # Intento 1: Token propio (HS256) — validación local, sin llamada de red
    try:
        payload = validate_propio_token(token)
        _log_warn("Token validado como propio (HS256)", level="debug")
        return payload, "propio"
    except InvalidTokenError as e:
        errors.append(f"propio: {e}")

    # Intento 2: Token Microsoft (RS256) — validación con JWKS
    try:
        payload = validate_microsoft_token(token)
        _log_warn("Token validado como Microsoft (RS256)", level="debug")
        return payload, "microsoft"
    except InvalidTokenError as e:
        errors.append(f"microsoft: {e}")

    # Ambos fallaron — token inválido o malformado
    _log_warn(f"Token no válido con ningún validador. Errores: {' | '.join(errors)}", level="warning")
    raise InvalidTokenError(
        "Token inválido: no se pudo validar con ningún método"
    )


def _extraer_bearer(request):
    """
    Devuelve (token, error_response) del header Authorization.
    (None, None) si no viene header.
    """
    auth_header = request.headers.get("Authorization", None)
    if not auth_header:
        return None, None
    try:
        return auth_header.split(" ")[1], None
    except IndexError:
        _log_warn("Formato de Authorization header inválido", level="warning")
        return None, ResponseBuilder.error(
            message="Formato de token inválido. Use: Bearer <token>",
            code="TOKEN_FORMAT_INVALID",
            status_code=status.HTTP_401_UNAUTHORIZED
        )


def autenticar_jwt(request):
    """
    Ejecuta la validación completa de un JWT sobre una request, sin depender
    de que la vista esté decorada con @jwt_required.

    Se extrae para permitir invocarla manualmente desde vistas que necesitan
    decidir en tiempo de ejecución si exigen autenticación (por ejemplo, el
    gateway con endpoints públicos bypasseados).

    Origen del token según el usuario (UsuarioExtendido.desarrollador):
        - Desarrollador: se acepta el header Authorization: Bearer <token>.
        - Resto: solo las cookies de sesión (jwt_token cifrado con AES-128-GCM, o la cookie
          access_token como respaldo; ver utils/auth_cookies.py). Si llega un
          Bearer de un usuario no desarrollador se ignora y se usan las cookies.
        - Con COOKIES=False (.env) se acepta el Bearer para cualquier usuario y
          las cookies se ignoran.
        - Mobile (request.is_mobile, header x-request-source: mobile_app): solo
          el Bearer, sin importar si es desarrollador, y el token debe estar
          vinculado a una sesión activa con platform="mobile". Así un token
          emitido para web no se puede usar enviando el header de mobile.

    Valida tokens de Microsoft (RS256) y tokens propios (HS256)
    Verifica fingerprint del dispositivo
    Verifica que el token no esté en blacklist (Redis)
    Verifica que el token esté asociado a una sesión activa

    Si es exitosa deja el token usado en request.auth_token.

    Retorna una tupla (payload, error_response):
        - Autenticación exitosa: (payload: dict, None)
        - Autenticación fallida: (None, JsonResponse de error)
    """
    bearer_token, error_response = _extraer_bearer(request)
    if error_response:
        return None, error_response

    if getattr(request, "is_mobile", False):
        return _autenticar_mobile(request, bearer_token)

    bearer_error = None
    if bearer_token:
        payload, user, bearer_error = _autenticar_token(request, bearer_token)
        if not bearer_error:
            if not cookies_enabled() or UsuarioExtendido.es_desarrollador(user):
                _log_warn(f"🥥 Usuario {user.username} validado por header Authorization", level="info")
                payload["auth_source"] = "bearer"
                request.auth_token = bearer_token
                return payload, None
            _log_warn(f"Bearer token ignorado: {user.username} no es desarrollador, "
                "se exigen cookies de sesión", level="info")
            bearer_error = ResponseBuilder.error(
                message="Autenticación por header no permitida. Use las cookies de sesión",
                code="BEARER_NOT_ALLOWED",
                status_code=status.HTTP_401_UNAUTHORIZED
            )

    cookie_token = get_jwt_from_cookies(request)
    if not cookie_token:
        if bearer_error:
            return None, bearer_error
        _log_warn("Intento de acceso sin header Authorization ni cookies de sesión", level="warning")
        return None, ResponseBuilder.error(
            message="Token no proporcionado",
            code="TOKEN_MISSING",
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    payload, user, error_response = _autenticar_token(request, cookie_token)
    if error_response:
        return None, error_response

    _log_warn(f"🍪 Usuario {user.username} validado por cookies", level="info")
    payload["auth_source"] = "cookie"
    request.auth_token = cookie_token
    return payload, None


def _autenticar_mobile(request, bearer_token):
    """
    Autenticación de peticiones mobile: solo header Authorization (mobile no
    maneja cookies), con la sesión del token restringida a platform="mobile".
    """
    if not bearer_token:
        _log_warn("Petición mobile sin header Authorization", level="warning")
        return None, ResponseBuilder.error(
            message="Token no proporcionado",
            code="TOKEN_MISSING",
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    payload, user, error_response = _autenticar_token(
        request, bearer_token, platform=SESSION_PLATFORM_MOBILE
    )
    if error_response:
        return None, error_response

    _log_warn(f"📱 Usuario {user.username} validado por header Authorization (mobile)", level="info")
    payload["auth_source"] = "mobile"
    request.auth_token = bearer_token
    return payload, None


def _autenticar_token(request, token, platform=None):
    """
    Valida un token concreto (blacklist, firma, fingerprint, usuario y
    sesión activa). Si se indica `platform`, la sesión activa debe ser de
    esa plataforma.

    Retorna (payload, user, None) si es válido o (None, None, JsonResponse).
    """
    # 3. Verificar si el token está en la blacklist (Redis)
    try:
        from django.core.cache import cache
        if cache.get(f"blacklist_token:{token}"):
            _log_warn("Intento de uso de token revocado", level="warning")
            return None, None, ResponseBuilder.error(
                message="Token revocado",
                code="TOKEN_REVOKED",
                status_code=status.HTTP_401_UNAUTHORIZED
            )
    except Exception as e:
        _log_warn(f"Error verificando blacklist: {str(e)}", level="warning")

    # 4. Validar token (prueba ambos validadores sin confiar en header 'alg')
    try:
        payload, token_type = _validate_token(token)
        payload["token_type"] = token_type

        require_refresh_fingerprint = config(
            "REQUIRE_REFRESH_FINGERPRINT", cast=bool, default=True
        )

        # 5. Validar fingerprint (solo para tokens propios con fingerprint)
        if (
            require_refresh_fingerprint
            and token_type == "propio"
            and payload.get('fingerprint')
        ):
            request_fingerprint = request.headers.get('X-Fingerprint')

            if not request_fingerprint:
                _log_warn("Token con fingerprint pero request sin X-Fingerprint header", level="warning")
                return None, None, ResponseBuilder.error(
                    message="Fingerprint requerido",
                    code="FINGERPRINT_REQUIRED",
                    status_code=status.HTTP_401_UNAUTHORIZED
                )

            if payload.get('fingerprint') != request_fingerprint:
                _log_warn("Fingerprint no coincide para token "
                    "(esperado: ***REDACTED***, recibido: ***REDACTED***)", level="warning")
                return None, None, ResponseBuilder.error(
                    message="Fingerprint no coincide",
                    code="FINGERPRINT_MISMATCH",
                    status_code=status.HTTP_401_UNAUTHORIZED
                )

        # 6. Extraer username del payload
        username = (
            payload.get("preferred_username") or
            payload.get("upn") or
            payload.get("username")
        )

        if not username:
            _log_warn("Token sin username identificable", level="warning")
            return None, None, ResponseBuilder.error(
                message="No se pudo identificar al usuario",
                code="USER_NOT_IDENTIFIABLE",
                status_code=status.HTTP_401_UNAUTHORIZED
            )

        # 7. Buscar usuario en base de datos
        user = User.objects.filter(username__iexact=username.split('@')[0]).first()
        if not user:
            _log_warn(f"Usuario no encontrado: {username.split('@')[0]}", level="warning")
            return None, None, ResponseBuilder.error(
                message="Usuario no encontrado",
                code="USER_NOT_FOUND",
                status_code=status.HTTP_404_NOT_FOUND
            )

        # 8. Verificar que el token esté vinculado a una sesión activa
        active_sessions = Session.objects.filter(user=user, is_active=True)
        if platform:
            active_sessions = active_sessions.filter(platform=platform)
        valid_session_found = False

        for session in active_sessions:
            try:
                decrypted_token = session.get_decrypted_token()
                if decrypted_token == token:
                    valid_session_found = True
                    break
            except Exception:
                # Sesión con token corrupto, continuar con la siguiente
                continue

        if not valid_session_found:
            _log_warn(f"Token no vinculado a sesión activa para usuario: {username.split('@')[0]}", level="warning")
            return None, None, ResponseBuilder.error(
                message="Token no vinculado a una sesión activa",
                code="SESSION_NOT_FOUND",
                status_code=status.HTTP_401_UNAUTHORIZED
            )

        # 9. Autenticación exitosa
        return payload, user, None

    except jwt.ExpiredSignatureError:
        _log_warn(f"Token expirado para usuario: {username if 'username' in locals() else 'desconocido'}", level="info")
        return None, None, ResponseBuilder.error(
            message="Token expirado",
            code="TOKEN_EXPIRED",
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    except jwt.InvalidTokenError as e:
        _log_warn(f"Token inválido: {str(e)}", level="warning")
        return None, None, ResponseBuilder.error(
            message="Token inválido",
            code="TOKEN_INVALID",
            status_code=status.HTTP_401_UNAUTHORIZED
        )

    except Exception as e:
        _log_warn(f"Error de autenticación: {str(e)}", level="error", exc_info=True)
        return None, None, ResponseBuilder.error(
            message="Error de autenticación",
            code="AUTH_ERROR",
            status_code=status.HTTP_401_UNAUTHORIZED
        )


def jwt_required(view_func):
    """
    Decorator para proteger endpoints que requieren autenticación JWT.

    Delega toda la validación en `autenticar_jwt` y, si es exitosa, adjunta
    el payload del token a request.user antes de ejecutar la vista protegida.
    """
    @wraps(view_func)
    def wrapped_view(request, *args, **kwargs):
        payload, error_response = autenticar_jwt(request)
        if error_response:
            return error_response

        # Adjuntar información del usuario a la request
        request.user = payload
        request.django_user = (
            payload.get("preferred_username") or
            payload.get("upn") or
            payload.get("username")
        )

        # Ejecutar la vista protegida
        return view_func(request, *args, **kwargs)

    return wrapped_view
