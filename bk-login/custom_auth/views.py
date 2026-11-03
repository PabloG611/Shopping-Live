"""
Vistas de autenticación refactorizadas usando Service Layer Pattern
Orquesta servicios sin contener lógica de negocio
"""

import json
import jwt
import pyotp
from typing import Dict, Any
from django.http import JsonResponse
from django.contrib.auth import authenticate, get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.decorators import api_view
from decouple import config
from django.contrib.auth.models import User
from django_otp.plugins.otp_totp.models import TOTPDevice
from custom_auth.models.models_global import *
from custom_auth.exceptions import (
    AuthenticationError,
    InvalidCredentialsError,
    ValidationError,
    UserNotFoundError,
)
from custom_auth.services import (
    ValidationService,
    UserService,
    MicrosoftAuthService,
    ExternalAuthService,
    TwoFactorAuthService,
    ProfileService,
    SessionService,
    TokenService,
    RefreshTokenService,
    MicrosoftPermissionsService,
)
from builders import ResponseBuilder
from api.decorators.jwt_decorator import jwt_required, validate_microsoft_token
from api.decorators.rate_limit import rate_limit
from utils.save_data import save_biometric
from utils.validate import validate_2fa_device
from utils.generate import (
    generate_2fa_device,
    generate_jwt_token,
    generate_refresh_jwt_token,
)
from utils.tools import mask_pii
from utils.generate import refresh_microsoft_token, refresh_propio_token
from utils.auth_cookies import (
    cookies_enabled,
    ocultar_tokens_body,
    set_refresh_token_cookie,
    set_access_token_cookie,
    set_session_token_cookies,
    set_sockets_cookie,
    delete_session_token_cookies,
    get_refresh_from_cookies,
    ACCESS_TOKEN_COOKIE_NAME,
    ACCESS_TOKEN_COOKIE_PATH,
)
from django.db.models import Q
from cryptography.fernet import InvalidToken

from utils.logger_generico import _log_warn


def _extraer_fingerprint_id(request, data: dict):
    """Id del fingerprint del dispositivo.

    El header X-Fingerprint tiene prioridad. En el body, ``fingerprint``
    puede ser el id (str) o el objeto con la información del dispositivo
    que envía ft-login, del que se toma ``id``.
    """
    header = request.headers.get("X-Fingerprint")
    if header:
        return header
    body = data.get("fingerprint")
    if isinstance(body, dict):
        return body.get("id")
    return body


def get_user_by_identifier(identifier: str):
    User = get_user_model()
    return User.objects.filter(
        Q(email__iexact=identifier) | Q(username__iexact=identifier)
    ).first()


@api_view(["POST"])
@rate_limit(
    scope="login-external",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.username", "username"),
    allow_referer=True,
    referer_include_path=True,
)
def auth(request):
    """
    Endpoint de autenticación externa (usuarios sin Microsoft AD)
    Requiere autenticación de dos factores (2FA)
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = json.loads(request.body)
        form_data = ValidationService.validate_request_data(data)
        is_mobile = request.is_mobile

        # 2. Extraer y validar credenciales
        identifier = (
            (form_data.get("username") or form_data.get("correo") or "").strip().lower()
        )
        password = form_data.get("password")

        identifier, password = ExternalAuthService.validate_identifier_and_password(
            identifier, password
        )

        # 3. Validar recaptcha
        recaptcha_token = data.get("recaptcha")
        # Nota: no pasamos user aún porque no sabemos si existe
        ValidationService.validate_recaptcha_token(
            token=recaptcha_token,
            is_mobile=is_mobile,
            user=None,  # Se guardará después de autenticar
        )

        # 4. Autenticar usuario
        user = ExternalAuthService.authenticate(identifier, password)

        # 5. Guardar recaptcha después de autenticación exitosa
        if recaptcha_token:
            try:
                from utils.save_data import save_recaptcha

                save_recaptcha(user=user, token=recaptcha_token)
            except Exception as e:
                # No fallar si no se puede guardar
                _log_warn(f"No se pudo guardar recaptcha: {str(e)}", level="warning")

        # 6. Verificar/generar dispositivo 2FA (obligatorio para todo usuario
        # externo; no existen exenciones, ver HALLAZGO-W)
        has_device, qr_code = TwoFactorAuthService.check_user_has_device(user)

        # 7. Construir respuesta

        response_data = {
            "active": user.is_active,
            "twoFARequired": True,
        }
        if qr_code:
            response_data["qr_code"] = qr_code

        response = ResponseBuilder.success(
            message="Login Success" if not qr_code else "User has no device",
            data=response_data,
            status_code=status.HTTP_200_OK,
        )

        _log_warn(f"Login externo {'con' if has_device else 'sin'} 2FA "
            f"para usuario: {user.username}", level="info")

        return response

    except AuthenticationError as e:
        # Errores controlados de autenticación
        _log_warn(f"Error de autenticación externa: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        # Errores no controlados - no exponer detalles al cliente
        _log_warn(f"Error inesperado en auth: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@rate_limit(
    scope="login-external-mobile",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=(
        "datosFormulario.username",
        "username",
        "datosFormulario.correo",
        "correo",
    ),
    allow_referer=True,
    referer_include_path=True,
)
def external_mobile_login(request):
    """
    Endpoint de autenticación externa para mobile SIN 2FA.
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = json.loads(request.body)
        form_data = ValidationService.validate_request_data(data)
        is_mobile = request.is_mobile

        # 2. Validar fuente móvil
        if not is_mobile:
            raise ValidationError(
                message="Endpoint disponible solo para clientes móviles",
                code="MOBILE_SOURCE_REQUIRED",
            )

        # 3. Extraer y validar credenciales
        identifier = (
            (form_data.get("username") or form_data.get("correo") or "").strip().lower()
        )
        password = form_data.get("password")

        identifier, password = ExternalAuthService.validate_identifier_and_password(
            identifier, password
        )

        # 4. Mantener patrón de validación de recaptcha (se omite en mobile por servicio)
        recaptcha_token = data.get("recaptcha")
        ValidationService.validate_recaptcha_token(
            token=recaptcha_token, is_mobile=True, user=None
        )

        # 5. Autenticar usuario
        user = ExternalAuthService.authenticate(identifier, password)

        # 5.1. Cargar servicios para token_sp (si no hay perfiles, lista vacía)
        servicios = []
        profiles = ProfileService.get_user_profiles(user)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            servicios = profile_data.get("servicios", [])

        # 6. Generar access token (con fingerprint si viene)
        fingerprint = _extraer_fingerprint_id(request, data)
        if fingerprint:
            access_token = TokenService.generate_encrypted_token(
                user=user,
                fingerprint=fingerprint,
                request=request,
                user_type="external",
                exp_minutes=1440,
            )
        else:
            access_token = TokenService.generate_access_token(
                user=user,
                request=request,
                fingerprint=None,
                user_type="external",
                exp_minutes=1440,
            )

        # 6.1 Generar token_sp para mobile
        token_sp = TokenService.generate_sp_token(
            user=user,
            servicios=servicios,
            exp_minutes=1440,
        )

        # 7. Gestionar sesiones
        SessionService.validate_and_close_existing_sessions(user)
        session_id = SessionService.create_session(
            request=request, user=user, token=access_token, platform="mobile"
        )

        # 8. Respuesta mínima para mobile
        response = ResponseBuilder.success(
            message="Autenticación externa móvil exitosa",
            data=ocultar_tokens_body({
                "access_token": access_token,
                "session_id": str(session_id),
                "token_sp": token_sp,
            }, es_mobile=True),
            status_code=status.HTTP_200_OK,
        )
        set_access_token_cookie(response, request, access_token, exp_minutes=1440)
        set_session_token_cookies(response, access_token)
        set_sockets_cookie(response, user)
        return response

    except AuthenticationError as e:
        _log_warn(f"Error de autenticación externa mobile: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        _log_warn(f"Error inesperado en external_mobile_login: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@rate_limit(
    scope="login-internal",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.username", "username"),
    allow_referer=True,
    referer_include_path=True,
)
def microsoft_login(request):
    """
    Endpoint de autenticación con Microsoft
    Orquesta servicios para autenticar usuarios contra Microsoft AD
    Devuelve tokens en JSON con soporte para fingerprint
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = json.loads(request.body)
        form_data = ValidationService.validate_request_data(data)
        is_mobile = request.is_mobile

        # 2. Validar datos de login y fingerprint
        username, password = ValidationService.validate_login_data(form_data)
        fingerprint = _extraer_fingerprint_id(request, data)

        # 3. Obtener o crear usuario
        user_instance = UserService.get_or_create_user(username)

        # 4. Validar recaptcha
        recaptcha_token = data.get("recaptcha")
        ValidationService.validate_recaptcha_token(
            token=recaptcha_token,
            is_mobile=is_mobile,
            user=user_instance,
        )

        # 5. Autenticar con Microsoft (sin guardar refresh token aquí)
        microsoft_service = MicrosoftAuthService()
        auth_result = microsoft_service.authenticate(
            username=username,
            password=password,
            user=user_instance,
            save_refresh_token=False,  # No guardar aquí, lo haremos manualmente
        )

        id_token = auth_result.get("id_token")
        microsoft_refresh_token = auth_result.get("refresh_token")

        # 6. Crear refresh token usando el nuevo servicio con fingerprint
        refresh_token_obj = None
        if fingerprint and microsoft_refresh_token:
            from custom_auth.services.refresh_token_service import RefreshTokenService

            # Guardar el refresh token de Microsoft con el fingerprint del usuario
            refresh_token_obj = RefreshTokenService.create_refresh_token(
                user=user_instance,
                fingerprint=fingerprint,
                exp_days=30,  # Microsoft tokens duran más
            )

            # Actualizar el token con el de Microsoft (sin truncar)
            refresh_token_obj.token = microsoft_refresh_token
            refresh_token_obj.save()

            _log_warn(f"Refresh token de Microsoft guardado para usuario {username} "
                f"con fingerprint ***REDACTED***", level="info")
        elif microsoft_refresh_token:
            # Si no hay fingerprint, usar fingerprint genérico (legacy)
            from custom_auth.services.refresh_token_service import RefreshTokenService

            refresh_token_obj = RefreshTokenService.create_refresh_token(
                user=user_instance, fingerprint="microsoft_token", exp_days=30
            )

            refresh_token_obj.token = microsoft_refresh_token
            refresh_token_obj.save()

            _log_warn(f"Refresh token de Microsoft guardado sin fingerprint para usuario {username}", level="warning")

        # 7. Cargar perfil de usuario
        profile_data = None
        servicios = []
        profiles = ProfileService.get_user_profiles(user_instance)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data["username"] = user_instance.username
            servicios = profile_data.get("servicios", [])

        token_sp = TokenService.generate_sp_token(
            user=user_instance,
            servicios=servicios,
            exp_minutes=1440,
        )

        # 8. Gestionar sesiones
        SessionService.validate_and_close_existing_sessions(user_instance)

        platform = "mobile" if is_mobile else "web"
        session_id = SessionService.create_session(
            request=request, user=user_instance, token=id_token, platform=platform
        )

        # 9. Cargar datos del graph
        info = microsoft_service.get_token_info(auth_result)

        graph_data = microsoft_service.get_user_graph_data(
            token=info.get("access_token"), user=user_instance
        )

        # 10. Construir respuesta con tokens en JSON
        response_data = {
            "message": "Autenticación Microsoft exitosa",
            "access_token": id_token,
            "session_id": str(session_id),
            "token_sp": token_sp,
            "user_active": user_instance.is_active,
            "graph_data": graph_data or None,
        }

        # Incluir refresh token en la respuesta si se generó
        if refresh_token_obj:
            response_data["refresh_token"] = refresh_token_obj.token

        # Incluir profile o marcar que se requieren datos básicos
        if profile_data:
            response_data["profile"] = profile_data
            
            _log_warn(f"📋 Profile data keys: {list(profile_data.keys())}", level="info")
            doc_value = profile_data.get('documento')
            _log_warn(f"📋 Documento en profile_data: {mask_pii(doc_value) if doc_value else 'NO ENCONTRADO'}", level="info")
            
            # Agregar objeto user con documento para compatibilidad con frontend
            user_data = {
                "username": user_instance.username,
                "email": user_instance.email or "",
                "is_active": user_instance.is_active,
            }
            
            # Incluir documento si está en profile_data
            if "documento" in profile_data:
                user_data["documento"] = profile_data["documento"]
                _log_warn(f"✅ Documento incluido en respuesta: {mask_pii(profile_data['documento'])}", level="info")
            else:
                _log_warn(f"⚠️ NO se encontró 'documento' en profile_data", level="warning")
            
            response_data["user"] = user_data
            _log_warn(f"📤 User data en respuesta: username={user_instance.username}, email={mask_pii(user_instance.email)}, is_active={user_instance.is_active}", level="info")
        else:
            # Si no hay perfil, incluir username y marcar BdRequired
            response_data["profile"] = {"username": user_instance.username}
            response_data["user"] = {
                "username": user_instance.username,
                "email": user_instance.email or "",
                "is_active": user_instance.is_active,
            }
            response_data["BdRequired"] = True

        response = JsonResponse(ocultar_tokens_body(response_data, es_mobile=is_mobile), status=status.HTTP_200_OK)
        response["X-Content-Type-Options"] = "nosniff"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response["Cache-Control"] = "no-store"

        # Set refresh_token as httpOnly cookie si existe
        if refresh_token_obj:
            set_refresh_token_cookie(
                response, request, refresh_token_obj.token, max_age=30 * 24 * 60 * 60
            )
        set_access_token_cookie(response, request, id_token)
        set_session_token_cookies(
            response, id_token, refresh_token_obj.token if refresh_token_obj else None
        )
        set_sockets_cookie(response, user_instance)

        _log_warn(f"Login Microsoft exitoso para usuario: {username}", level="info")
        return response

    except AuthenticationError as e:
        # Errores controlados de autenticación
        _log_warn(f"Error de autenticación: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        # Errores no controlados - no exponer detalles al cliente
        _log_warn(f"Error inesperado en microsoft_login: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@rate_limit(
    scope="login-mobile-exchange",
    max_attempts=8,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=(
        "id_token",
        "access_token",
        "datosFormulario.username",
        "username",
    ),
    allow_referer=True,
    referer_include_path=True,
)
def mobile_exchange_token(request):
    """
    Endpoint para apps móviles que autentican directamente con Microsoft SDK.
    Valida id_token emitido por Microsoft y crea/reutiliza sesión local.
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos del request
        data = json.loads(request.body)
        form_data = ValidationService.validate_request_data(data)
        is_mobile = request.is_mobile

        if not is_mobile:
            return ResponseBuilder.error(
                message="Endpoint disponible solo para clientes móviles",
                code="MOBILE_SOURCE_REQUIRED",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 2. Obtener token desde body o headers
        id_token = (
            form_data.get("id_token")
            or form_data.get("access_token")
            or request.headers.get("Authorization", "").replace("Bearer ", "")
        )

        if not id_token:
            raise ValidationError(
                message="id_token es requerido", code="MISSING_ID_TOKEN"
            )

        # 3. Validar token de Microsoft (firma, issuer, audience, exp)
        payload = validate_microsoft_token(id_token)
        payload["token_type"] = "microsoft"

        # 4. Resolver username desde claims
        token_username = payload.get("preferred_username") or payload.get("upn")
        if not token_username:
            raise ValidationError(
                message="No se pudo identificar el usuario desde el token",
                code="USER_NOT_IDENTIFIABLE",
            )

        username = token_username.split("@")[0].strip().lower()
        user_instance = UserService.get_or_create_user(username)

        # 5. Cargar perfil (si existe)
        profile_data = None
        try:
            profiles = ProfileService.get_user_profiles(user_instance)
            if profiles:
                profile_data = ProfileService.build_profile_data(profiles)
                profile_data["username"] = user_instance.username
        except AuthenticationError:
            # Compatible con el comportamiento de login: permitir BdRequired
            profile_data = None

        # 6. Reutilizar sesión si el mismo token ya está activo en una sesión
        # mobile (autenticar_jwt exige platform="mobile" a las peticiones mobile)
        existing_session = None
        active_sessions = Session.objects.filter(
            user=user_instance, is_active=True, platform="mobile"
        )
        for session in active_sessions:
            try:
                if session.get_decrypted_token() == id_token:
                    existing_session = session
                    break
            except Exception:
                continue

        if existing_session:
            session_id = str(existing_session.id_session)
            _log_warn(f"Sesión móvil existente reutilizada para usuario {username}: {session_id}", level="info")
        else:
            SessionService.validate_and_close_existing_sessions(user_instance)
            platform = "mobile" if is_mobile else "web"
            session_id = SessionService.create_session(
                request=request, user=user_instance, token=id_token, platform=platform
            )
            _log_warn(f"Nueva sesión móvil creada para usuario {username}: {session_id}", level="info")

        # 7. Respuesta consistente con login Microsoft
        response_data = {
            "message": "Intercambio de token Microsoft exitoso",
            "access_token": id_token,
            "session_id": str(session_id),
            "user_active": user_instance.is_active,
        }

        if profile_data:
            response_data["profile"] = profile_data
            
            # Agregar objeto user con documento para compatibilidad con frontend
            user_data = {
                "username": user_instance.username,
                "email": user_instance.email or "",
                "is_active": user_instance.is_active,
            }
            
            # Incluir documento si está en profile_data
            if "documento" in profile_data:
                user_data["documento"] = profile_data["documento"]
                _log_warn(f"Documento incluido en respuesta mobile exchange: {mask_pii(profile_data['documento'])}", level="info")
            
            response_data["user"] = user_data
        else:
            response_data["profile"] = {"username": user_instance.username}
            response_data["user"] = {
                "username": user_instance.username,
                "email": user_instance.email or "",
                "is_active": user_instance.is_active,
            }
            response_data["BdRequired"] = True

        response = JsonResponse(ocultar_tokens_body(response_data, es_mobile=is_mobile), status=status.HTTP_200_OK)
        response["X-Content-Type-Options"] = "nosniff"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response["Cache-Control"] = "no-store"

        set_access_token_cookie(response, request, id_token)
        set_session_token_cookies(response, id_token)
        set_sockets_cookie(response, user_instance)

        return response

    except AuthenticationError as e:
        _log_warn(f"Error controlado en mobile_exchange_token: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except jwt.InvalidTokenError as e:
        _log_warn(f"id_token de Microsoft inválido: {str(e)}", level="warning")
        return ResponseBuilder.error(
            message="id_token inválido",
            code="TOKEN_INVALID",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        _log_warn(f"Error inesperado en mobile_exchange_token: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


def _create_microsoft_session_response(
    request,
    id_token: str,
    platform: str,
    success_message: str,
    log_label: str,
):
    """
    Valida un id_token de Microsoft y crea/reutiliza una sesión local.
    Compartido por los endpoints de sesión Microsoft mobile y web.
    """
    if not id_token:
        raise ValidationError(message="id_token es requerido", code="MISSING_ID_TOKEN")

    payload = validate_microsoft_token(id_token)
    payload["token_type"] = "microsoft"

    token_username = payload.get("preferred_username") or payload.get("upn")
    if not token_username:
        raise ValidationError(
            message="No se pudo identificar el usuario desde el token",
            code="USER_NOT_IDENTIFIABLE",
        )

    username = token_username.split("@")[0].strip().lower()
    user_instance = UserService.get_or_create_user(username)

    existing_session = None
    active_sessions = Session.objects.filter(user=user_instance, is_active=True)
    for session in active_sessions:
        try:
            if session.get_decrypted_token() == id_token:
                existing_session = session
                break
        except Exception:
            continue

    if existing_session:
        session_id = str(existing_session.id_session)
        _log_warn(f"Sesión {log_label} existente reutilizada para usuario {username}: {session_id}", level="info")
    else:
        SessionService.validate_and_close_existing_sessions(user_instance)
        session_id = SessionService.create_session(
            request=request, user=user_instance, token=id_token, platform=platform
        )
        _log_warn(f"Nueva sesión {log_label} creada para usuario {username}: {session_id}", level="info")

    response_data = {
        "message": success_message,
        "session_id": str(session_id),
    }

    response = JsonResponse(response_data, status=status.HTTP_200_OK)
    response["X-Content-Type-Options"] = "nosniff"
    response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    response["Cache-Control"] = "no-store"

    set_access_token_cookie(response, request, id_token)
    set_session_token_cookies(response, id_token)
    set_sockets_cookie(response, user_instance)

    return response


@api_view(["POST"])
@rate_limit(
    scope="login-microsoft-session",
    max_attempts=8,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=(
        "Authorization",
    ),
    allow_referer=True,
    referer_include_path=True,
)
def microsoft_session(request):
    """
    Endpoint para clientes web que ya autenticaron con Microsoft.
    Valida id_token emitido por Microsoft y crea/reutiliza sesión local web.
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        auth_header = request.headers.get("Authorization", "")
        id_token = auth_header.replace("Bearer ", "", 1) if auth_header.startswith("Bearer ") else ""

        return _create_microsoft_session_response(
            request=request,
            id_token=id_token,
            platform="web",
            success_message="Sesión Microsoft creada",
            log_label="web",
        )

    except AuthenticationError as e:
        _log_warn(f"Error controlado en microsoft_session: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except jwt.InvalidTokenError as e:
        _log_warn(f"id_token de Microsoft inválido: {str(e)}", level="warning")
        return ResponseBuilder.error(
            message="id_token inválido",
            code="TOKEN_INVALID",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )

    except Exception as e:
        _log_warn(f"Error inesperado en microsoft_session: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@rate_limit(
    scope="2fa",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("username",),
    allow_referer=True,
    referer_include_path=True,
)
def two_factor_auth(request):
    """
    Endpoint de verificación de autenticación de dos factores (2FA)
    Valida el código TOTP y genera tokens de sesión con fingerprint
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = json.loads(request.body)
        form_data = ValidationService.validate_request_data(data)

        # 2. Extraer datos de 2FA y fingerprint
        code = form_data.get("code2fa")
        username = form_data.get("username")
        fingerprint = _extraer_fingerprint_id(request, data)
        require_refresh_fingerprint = config(
            "REQUIRE_REFRESH_FINGERPRINT", cast=bool, default=True
        )

        # 3. Validar entrada
        TwoFactorAuthService.validate_2fa_input(code, username)

        if require_refresh_fingerprint and not fingerprint:
            _log_warn(f"Intento de 2FA sin fingerprint para usuario: {username}", level="warning")
            raise ValidationError(
                message="El fingerprint del dispositivo es requerido",
                code="MISSING_FINGERPRINT",
                status_code=400,
            )

        # 4. Obtener usuario
        user = TwoFactorAuthService.get_user_by_username(username)

        # 5. Validar y verificar código 2FA (incluye rate limiting)
        device = TwoFactorAuthService.validate_and_verify_2fa(user, code)

        # 6. Cargar perfil de usuario y obtener servicios
        profile_data = None
        servicios = None
        profiles = ProfileService.get_user_profiles(user)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data["username"] = user.username
            # Extraer solo los servicios para el token
            servicios = profile_data.get("servicios")

        # 7. Generar par de tokens con fingerprint y servicios
        tokens = TokenService.generate_token_pair(
            user=user,
            request=request,
            fingerprint=fingerprint,
            user_type="external",
            access_exp_minutes=1440,
            refresh_exp_days=30,
            servicios=servicios,
        )

        token_sp = TokenService.generate_sp_token(
            user=user,
            servicios=servicios,
            exp_minutes=1440,
        )

        # 8. Gestionar sesiones
        SessionService.validate_and_close_existing_sessions(user)

        session_id = SessionService.create_session(
            request=request, user=user, token=tokens["access_token"], platform="web"
        )

        # 9. Construir respuesta (tokens en body con servicios incluidos en el JWT)
        response_data = {
            "message": "Autenticación exitosa",
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "session_id": str(session_id),
            "user_active": user.is_active,
            "token_sp": token_sp,
        }

        # Incluir profile o marcar que se requieren datos básicos
        if profile_data:
            response_data["profile"] = profile_data
            
            # Agregar objeto user con documento para compatibilidad con frontend
            user_data = {
                "username": user.username,
                "email": user.email or "",
                "is_active": user.is_active,
            }
            
            # Incluir documento si está en profile_data
            if "documento" in profile_data:
                user_data["documento"] = profile_data["documento"]
                _log_warn(f"Documento incluido en respuesta 2FA: {mask_pii(profile_data['documento'])}", level="info")
            
            response_data["user"] = user_data
        else:
            # Si no hay perfil, incluir username y marcar BdRequired
            response_data["profile"] = {"username": user.username}
            response_data["user"] = {
                "username": user.username,
                "email": user.email or "",
                "is_active": user.is_active,
            }
            response_data["BdRequired"] = True

        response = JsonResponse(ocultar_tokens_body(response_data), status=status.HTTP_200_OK)
        response["X-Content-Type-Options"] = "nosniff"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response["Cache-Control"] = "no-store"

        # Set refresh_token as httpOnly cookie (migración a cookie segura)
        set_refresh_token_cookie(
            response, request, tokens.get("refresh_token"), max_age=15 * 24 * 60 * 60
        )
        set_access_token_cookie(response, request, tokens.get("access_token"), exp_minutes=1440)
        set_session_token_cookies(
            response, tokens.get("access_token"), tokens.get("refresh_token")
        )
        set_sockets_cookie(response, user)

        _log_warn(f"Autenticación 2FA exitosa para usuario: {username}", level="info")

        return response

    except AuthenticationError as e:
        # Errores controlados de autenticación
        _log_warn(f"Error en 2FA: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Cuerpo de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        # Errores no controlados - no exponer detalles al cliente
        _log_warn(f"Error inesperado en 2FA: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@rate_limit(
    scope="login-internal",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.username", "username"),
    allow_referer=True,
    referer_include_path=True,
)
def connect_device(request):
    if request.method == "POST":
        data = json.loads(request.body)
        form_data = data.get("datosFormulario", data)

        username = form_data.get("username")
        otp_code = form_data.get("otp_code")

        # * Valid data exists
        if not username or not otp_code:
            return JsonResponse(
                {"message": "All data are required"}, status=status.HTTP_400_BAD_REQUEST
            )

        # * Valid user exists
        user_instance = User.objects.filter(username__iexact=username).first()
        if not user_instance:
            return JsonResponse(
                {"message": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        # * Confirm TOTPDevice
        try:
            device = TOTPDevice.objects.get(user=user_instance, confirmed=False)
        except TOTPDevice.DoesNotExist:
            return JsonResponse(
                {"message": "No pending TOTP device found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        # * Valid otp_code
        totp = pyotp.TOTP(device.key)
        if totp.verify(otp_code, valid_window=1):
            device.confirmed = True
            device.save()
            return JsonResponse(
                {"message": "2FA successfully activated"}, status=status.HTTP_200_OK
            )
        else:
            return JsonResponse(
                {"message": "Invalid OTP code"}, status=status.HTTP_400_BAD_REQUEST
            )

    return JsonResponse(
        {"message": "Method not allowed"}, status=status.HTTP_405_METHOD_NOT_ALLOWED
    )


@api_view(["POST"])
@rate_limit(
    scope="refresh-token",
    max_attempts=10,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("username",),
    allow_referer=True,
    referer_include_path=True,
)
def refresh_token(request):
    """
    Endpoint de refresh de tokens con rotación y fingerprint
    Lee el refresh_token de las cookies de sesión (refresh_jwt_token cifrado con AES-128-GCM
    o refresh_token). El cuerpo ("refresh") solo se acepta para usuarios
    desarrolladores (UsuarioExtendido.desarrollador).
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos del request
        data = json.loads(request.body) if request.body else {}
        require_refresh_fingerprint = config(
            "REQUIRE_REFRESH_FINGERPRINT", cast=bool, default=True
        )

        # 2. Extraer refresh token (cookies > body) y fingerprint
        cookie_refresh_token = get_refresh_from_cookies(request)
        refresh_from_body = not cookie_refresh_token and bool(data.get("refresh"))
        refresh_token = cookie_refresh_token or data.get("refresh")
        fingerprint = _extraer_fingerprint_id(request, data)

        if not refresh_token:
            _log_warn("Intento de refresh sin token", level="warning")
            return ResponseBuilder.error(
                message="Refresh token no proporcionado",
                code="MISSING_REFRESH_TOKEN",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        if require_refresh_fingerprint and not fingerprint:
            _log_warn("Intento de refresh sin fingerprint", level="warning")
            return ResponseBuilder.error(
                message="Fingerprint no proporcionado",
                code="MISSING_FINGERPRINT",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Buscar el refresh token en la BD para saber su tipo
        from custom_auth.models.models_global import RefreshToken as RefreshTokenModel

        token_entry = RefreshTokenModel.objects.filter(
            token=refresh_token, is_active=True
        ).first()

        if not token_entry:
            _log_warn("Refresh token no encontrado o inactivo", level="warning")
            return ResponseBuilder.error(
                message="Refresh token inválido",
                code="INVALID_REFRESH_TOKEN",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # Sesión activa del usuario (se reutiliza en el paso 4). Mobile no
        # maneja cookies: refresca por body, pero solo si su sesión activa es
        # mobile, para que el header x-request-source no habilite el body a web.
        active_session = SessionService.get_active_session(token_entry.user)
        es_refresh_mobile = (
            getattr(request, "is_mobile", False)
            and active_session is not None
            and active_session.platform == "mobile"
        )

        # El refresh token por body solo se acepta para mobile y desarrolladores
        # (o para todos con COOKIES=False)
        if (
            refresh_from_body
            and cookies_enabled()
            and not es_refresh_mobile
            and not UsuarioExtendido.es_desarrollador(token_entry.user)
        ):
            _log_warn(f"Refresh por body rechazado: {token_entry.user.username} "
                f"no es desarrollador", level="warning")
            return ResponseBuilder.error(
                message="Refresh token por body no permitido. Use las cookies de sesión",
                code="REFRESH_COOKIE_REQUIRED",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # Verificar fingerprint (opcional por bandera temporal)
        if require_refresh_fingerprint and token_entry.fingerprint != fingerprint:
            _log_warn("Fingerprint no coincide. Esperado: ***REDACTED***, "
                "Recibido: ***REDACTED***", level="warning")
            return ResponseBuilder.error(
                message="Fingerprint no coincide",
                code="FINGERPRINT_MISMATCH",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        # Si fingerprint es opcional, mantener el fingerprint guardado del token.
        if not require_refresh_fingerprint:
            fingerprint = token_entry.fingerprint

        # 4. Obtener el access token actual de la sesión (antes de generar uno nuevo)
        old_access_token = None

        if active_session:
            try:
                old_access_token = active_session.get_decrypted_token()
            except Exception as e:
                _log_warn(f"No se pudo obtener token de sesión activa: {str(e)}", level="warning")

        # 5. Determinar si es token de Microsoft o propio
        # Microsoft tokens son mucho más largos
        is_microsoft_token = len(refresh_token) > 100

        if is_microsoft_token:
            # Refrescar usando MSAL
            from msal import ConfidentialClientApplication
            _log_warn(f"Refrescando token de Microsoft para usuario {token_entry.user.username}", level="info")

            try:
                app = ConfidentialClientApplication(
                    client_id=config("MICROSOFT_CLIENT_ID"),
                    client_credential=config("MICROSOFT_CREDENTIAL"),
                    authority=f"https://login.microsoftonline.com/{config('MICROSOFT_TENANT')}",
                )

                result = app.acquire_token_by_refresh_token(
                    refresh_token=refresh_token, scopes=["User.Read"]
                )

                if "error" in result or not result.get("id_token"):
                    error_msg = result.get("error")
                    error_desc = result.get("error_description", "No description")
                    _log_warn(f"Error refrescando token de Microsoft: {error_msg} - {error_desc}. "
                        f"Token length: {len(refresh_token)}", level="error")
                    return ResponseBuilder.error(
                        message="No se pudo refrescar el token de Microsoft",
                        code="MICROSOFT_REFRESH_ERROR",
                        status_code=status.HTTP_401_UNAUTHORIZED,
                    )

                new_access_token = result.get("id_token")
                new_microsoft_refresh = result.get("refresh_token")

                # Actualizar el refresh token en BD si cambió
                if new_microsoft_refresh and new_microsoft_refresh != refresh_token:
                    token_entry.token = new_microsoft_refresh
                    token_entry.save()
                    new_refresh_token_value = new_microsoft_refresh
                else:
                    new_refresh_token_value = refresh_token

            except Exception as e:
                _log_warn(f"Error refrescando token de Microsoft: {str(e)}", level="error")
                return ResponseBuilder.error(
                    message="Error al refrescar token de Microsoft",
                    code="MICROSOFT_REFRESH_ERROR",
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        else:
            # Token propio - usar sistema de rotación
            from custom_auth.services.refresh_token_service import RefreshTokenService

            _log_warn(f"Refrescando token propio para usuario {token_entry.user.username}", level="info")

            new_refresh_token_obj = RefreshTokenService.validate_and_rotate_token(
                token=refresh_token,
                fingerprint=fingerprint,
                require_fingerprint=require_refresh_fingerprint,
            )

            # Obtener servicios del usuario para incluirlos en el nuevo token
            servicios = None
            try:
                profiles = ProfileService.get_user_profiles(new_refresh_token_obj.user)
                if profiles:
                    profile_data = ProfileService.build_profile_data(profiles)
                    servicios = profile_data.get("servicios")
            except Exception as e:
                _log_warn(f"No se pudieron obtener servicios para el usuario "
                    f"{new_refresh_token_obj.user.username}: {str(e)}", level="warning")

            # Generar nuevo access token con servicios
            new_access_token = TokenService.generate_encrypted_token(
                user=new_refresh_token_obj.user,
                fingerprint=fingerprint,
                request=request,
                user_type="external",
                exp_minutes=1440,
                servicios=servicios,
            )

            new_refresh_token_value = new_refresh_token_obj.token

        # 6. Actualizar el token en la sesión activa
        if old_access_token and new_access_token:
            try:
                SessionService.update_session_token(
                    user=token_entry.user,
                    old_token=old_access_token,
                    new_token=new_access_token,
                )
            except Exception as e:
                _log_warn(f"Error actualizando token de sesión: {str(e)}. "
                    f"Continuando con respuesta...", level="error")
                # No fallar el refresh por este error, pero registrarlo

        # 7. Construir respuesta con nuevos tokens
        response_data = {
            "message": "Tokens refrescados exitosamente",
            "access_token": new_access_token,
            "refresh_token": new_refresh_token_value,
        }

        response = JsonResponse(
            ocultar_tokens_body(response_data, es_mobile=es_refresh_mobile),
            status=status.HTTP_200_OK,
        )
        response["X-Content-Type-Options"] = "nosniff"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response["Cache-Control"] = "no-store"

        # Set nuevo refresh_token como httpOnly cookie (con rotación)
        set_refresh_token_cookie(
            response, request, new_refresh_token_value, max_age=15 * 24 * 60 * 60
        )
        set_access_token_cookie(
            response, request, new_access_token,
            exp_minutes=None if is_microsoft_token else 1440,
        )
        set_session_token_cookies(response, new_access_token, new_refresh_token_value)

        _log_warn(f"Tokens refrescados exitosamente para usuario: "
            f"{token_entry.user.username}", level="info")

        return response

    except InvalidCredentialsError as e:
        # Errores de validación de refresh token
        _log_warn(f"Error refrescando token: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.error(
            message=e.message, code=e.code, status_code=status.HTTP_401_UNAUTHORIZED
        )

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        # Errores no controlados - no exponer detalles al cliente
        _log_warn(f"Error inesperado en refresh_token: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error al refrescar token",
            code="REFRESH_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@jwt_required
@rate_limit(
    scope="logout",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("username",),
    allow_referer=True,
    referer_include_path=True,
)
def logout(request):
    """
    Endpoint de cierre de sesión
    Cierra la sesión activa, elimina refresh tokens y añade access token a blacklist
    """
    if request.method != "POST":
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = json.loads(request.body)
        form_data = ValidationService.validate_request_data(data)

        # 2. Validar que username exista
        username = form_data.get("username")
        if not username:
            _log_warn("Intento de logout sin username", level="warning")
            raise ValidationError(
                message="Username es requerido", code="MISSING_USERNAME"
            )

        # 2b. Solo se puede cerrar la propia sesión, nunca la de otro usuario
        caller_username = (request.django_user or "").split("@")[0]
        if username.lower() != caller_username.lower():
            _log_warn(f"Intento de logout de otro usuario: autenticado={caller_username}, objetivo={username}", level="warning")
            raise AuthenticationError(
                message="No autorizado para cerrar la sesión de otro usuario",
                code="FORBIDDEN",
                status_code=status.HTTP_403_FORBIDDEN,
            )

        # 3. Obtener usuario
        user = UserService.get_user_by_username(username)
        if not user:
            _log_warn(f"Intento de logout con usuario inexistente: {username}", level="warning")
            raise UserNotFoundError(
                message="Usuario no encontrado", code="USER_NOT_FOUND"
            )

        # 4. Access token con el que se autenticó la petición (Bearer si es
        # desarrollador, cookies de sesión si no; ver autenticar_jwt)
        access_token = getattr(request, "auth_token", None)

        # 5. Añadir access token a la blacklist de Redis (invalidación inmediata)
        if access_token:
            try:
                from django.core.cache import cache

                # Decodificar para obtener tiempo de expiración
                import jwt
                from decouple import config

                payload = jwt.decode(
                    access_token, config("TOKEN_SECRET_KEY"), algorithms=["HS256"]
                )
                exp_timestamp = payload.get("exp")

                if exp_timestamp:
                    from datetime import datetime

                    remaining_seconds = exp_timestamp - datetime.utcnow().timestamp()
                    if remaining_seconds > 0:
                        # Guardar en Redis hasta que expire naturalmente
                        cache.set(
                            f"blacklist_token:{access_token}",
                            "revoked",
                            timeout=int(remaining_seconds),
                        )
                        _log_warn(f"Access token añadido a blacklist para usuario: {username}", level="info")
            except Exception as e:
                _log_warn(f"No se pudo añadir token a blacklist: {str(e)}", level="warning")

        # 6. Revocar todos los refresh tokens del usuario
        from custom_auth.services.refresh_token_service import RefreshTokenService

        revoked_count = RefreshTokenService.revoke_user_tokens(user)
        _log_warn(f"Revocados {revoked_count} refresh tokens para usuario: {username}", level="info")

        # 7. Cerrar sesión activa
        session = SessionService.get_active_session(user)
        if session:
            SessionService.close_session(str(session.id_session))
            _log_warn(f"Sesión cerrada para usuario: {username}", level="info")
        else:
            _log_warn(f"No había sesión activa para usuario: {username}", level="info")

        # 8. Construir respuesta
        response_data = {"message": "Logout exitoso", "tokens_revoked": revoked_count}

        response = JsonResponse(response_data, status=status.HTTP_200_OK)
        response["X-Content-Type-Options"] = "nosniff"
        response["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response["Cache-Control"] = "no-store"

        # Eliminar cookies de refresh_token y access_token
        response.delete_cookie('refresh_token', path='/api-auth/auth/refresh_token/')
        response.delete_cookie(ACCESS_TOKEN_COOKIE_NAME, path=ACCESS_TOKEN_COOKIE_PATH)
        delete_session_token_cookies(response)

        _log_warn(f"Logout exitoso para usuario: {username}", level="info")

        return response

    except AuthenticationError as e:
        # Errores controlados
        _log_warn(f"Error en logout: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        # Errores no controlados - no exponer detalles al cliente
        _log_warn(f"Error inesperado en logout: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(["POST"])
@jwt_required
def update_microsoft_permissions(request):
    """
    Solicita un nuevo token de acceso a Microsoft con permisos (scopes) actualizados.

    Este endpoint no genera un token propio, sino que utiliza el refresh token
    almacenado para pedir a Microsoft un nuevo access token que incluya los
    scopes solicitados.

    Endpoint: POST /api-auth/auth/microsoft/permissions/
    Headers:
        - Authorization: Bearer <access_token_propio>
        - X-Fingerprint: <device_fingerprint>
    Body:
        {
            "scopes": ["User.Read", "Mail.Send", "Calendars.ReadWrite"]
        }

    Returns:
        - 200: Nuevo access token de Microsoft con los permisos solicitados.
        - 400: Scopes inválidos o fingerprint faltante.
        - 401: Refresh token inválido o fingerprint no coincide.
        - 404: Usuario o refresh token no encontrado.
        - 500: Error interno o error al contactar a Microsoft.
    """
    try:
        # 1. Parsear y validar datos del request
        body = json.loads(request.body.decode("utf-8"))
        scopes = body.get("scopes", [])
        MicrosoftPermissionsService.validate_scopes(scopes)

        # 2. Obtener usuario y fingerprint
        username = request.user.get("preferred_username")
        user = User.objects.get(username=username.split("@")[0])

        fingerprint = request.META.get("HTTP_X_FINGERPRINT")
        require_refresh_fingerprint = config(
            "REQUIRE_REFRESH_FINGERPRINT", cast=bool, default=True
        )

        if require_refresh_fingerprint and not fingerprint:
            _log_warn(f"Fingerprint no proporcionado para usuario {username}", level="warning")
            return ResponseBuilder.error(
                message="Fingerprint del dispositivo es requerido",
                code="MISSING_FINGERPRINT",
                status_code=status.HTTP_400_BAD_REQUEST,
            )

        # 3. Obtener el refresh token de Microsoft del usuario
        from custom_auth.models.models_global import RefreshToken as RefreshTokenModel

        token_filters = {"user": user, "is_active": True}
        if require_refresh_fingerprint:
            token_filters["fingerprint"] = fingerprint

        token_entry = RefreshTokenModel.objects.filter(**token_filters).first()

        if not token_entry:
            _log_warn(f"No se encontró un refresh token activo para el usuario {username} con el fingerprint proporcionado.", level="warning")
            return ResponseBuilder.error(
                message="Refresh token no encontrado o inactivo.",
                code="REFRESH_TOKEN_NOT_FOUND",
                status_code=status.HTTP_404_NOT_FOUND,
            )

        microsoft_refresh_token = token_entry.token

        # 4. Solicitar nuevo access token a Microsoft con los scopes requeridos
        from msal import ConfidentialClientApplication
        from decouple import config

        _log_warn(f"Solicitando nuevo token de Microsoft para {username} con scopes: {scopes}", level="info")

        app = ConfidentialClientApplication(
            client_id=config("MICROSOFT_CLIENT_ID"),
            client_credential=config("MICROSOFT_CREDENTIAL"),
            authority=f"https://login.microsoftonline.com/{config('MICROSOFT_TENANT')}",
        )

        result = app.acquire_token_by_refresh_token(
            refresh_token=microsoft_refresh_token,
            scopes=scopes,  # Usar los scopes solicitados
        )

        if "error" in result or not result.get("access_token"):
            error_msg = result.get(
                "error_description", "No se pudo obtener el token de acceso."
            )
            _log_warn(f"Error al adquirir token de Microsoft para {username}: {error_msg}", level="error")
            return ResponseBuilder.error(
                message=f"Error al adquirir token de Microsoft: {error_msg}",
                code="MICROSOFT_TOKEN_ACQUISITION_FAILED",
                status_code=status.HTTP_401_UNAUTHORIZED,
            )

        new_access_token = result.get("access_token")

        # Opcional: Si Microsoft devuelve un nuevo refresh token, actualizarlo
        new_microsoft_refresh = result.get("refresh_token")
        if new_microsoft_refresh and new_microsoft_refresh != microsoft_refresh_token:
            token_entry.token = new_microsoft_refresh
            token_entry.save()
            _log_warn(f"Refresh token de Microsoft actualizado para el usuario {username}.", level="info")

        # 5. Construir y devolver la respuesta
        _log_warn(f"Nuevo token de acceso de Microsoft generado para {username} con scopes {scopes}.", level="info")

        response = ResponseBuilder.success(
            message="Token de Microsoft actualizado exitosamente.",
            data={
                "access_token": new_access_token,
                "scopes": result.get("scope", []),
                "expires_in": result.get("expires_in", 3600),
            },
        )

        response["Cache-Control"] = "no-store"
        return response

    except User.DoesNotExist:
        _log_warn(f"Usuario no encontrado en update_microsoft_permissions", level="warning")
        return ResponseBuilder.error(
            message="Usuario no encontrado",
            code="USER_NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )

    except ValidationError as e:
        _log_warn(f"Error de validación en update_microsoft_permissions: {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    except Exception as e:
        _log_warn(f"Error inesperado en update_microsoft_permissions: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
