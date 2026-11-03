import pyotp
import datetime
import jwt
import string
import secrets
import random
from decouple import config
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError, InvalidAudienceError, InvalidIssuerError
from django.contrib.auth.models import User
from django_otp.plugins.otp_totp.models import TOTPDevice
from custom_auth.models.models_global import *
from msal import ConfidentialClientApplication
from utils.utils import *
from utils.validate import *
from utils.save_data import *

from utils.logger_generico import _log_warn
def generate_2fa_device(user: User) -> str:
    try:
        user = User.objects.get(id=user.id)
    except user.DoesNotExist:
        return None

    secret = pyotp.random_base32()

    totp_device = TOTPDevice.objects.create(user=user, name='auth device', key=secret, confirmed=False)
    totp_device.save()

    totp = pyotp.TOTP(secret, interval=30)
    opt_uri = totp.provisioning_uri(name=user.username, issuer_name='ECO-UNP')

    twoFactorAuth = TwoFactorAuth.objects.create(user=user, secret=secret)
    twoFactorAuth.save()

    return opt_uri


def generate_jwt_token(data: dict, exp_minutes: int = 1440) -> str:
    username = data.get('datos_basicos', {}).get('username') or data.get('username')
    issued_at = datetime.datetime.utcnow()
    expiration_time = issued_at + datetime.timedelta(minutes=exp_minutes)
    payload = {
        **data,
        'token_id': str(uuid.uuid4()),
        'iat': issued_at,
        'exp': expiration_time
    }
    token = jwt.encode(payload, config('TOKEN_SECRET_KEY'), algorithm='HS256')

    # Se instancia el usuario
    user_instance = User.objects.filter(username__iexact=username).first()

    token_instance = Token(user=user_instance)
    token_instance.set_encrypted_token(token)
    token_instance.save()

    return token


def generate_refresh_jwt_token(data: dict, exp_minutes: int = 15) -> str:
    username = data.get('datos_basicos', {}).get('username') or data.get('username')
    issued_at = datetime.datetime.utcnow()
    expiration_time = issued_at + datetime.timedelta(minutes=exp_minutes)
    payload = {
        **data,
        'token_id': str(uuid.uuid4()),
        'iat': issued_at,
        'exp': expiration_time,
        'type': 'refresh'
    }
    token = jwt.encode(payload, config(
        'REFRESH_TOKEN_SECRET_KEY'), algorithm='HS256')

    user_instance = User.objects.filter(username__iexact=username).first()

    refresh_token_instance = RefreshToken(user=user_instance)
    refresh_token_instance.set_encrypted_token(token)
    refresh_token_instance.save()

    return token


def user_generate(nombre: str):
    nombreMayus = nombre.upper()
    while True:
        numero = random.randint(1000, 9999)
        username = f"{nombreMayus}{numero}"

        if not User.objects.filter(username__iexact=username).exists():
            return username


def password_generate(length=12):
    characters = string.ascii_letters + string.digits + string.punctuation
    password = ''.join(secrets.choice(characters) for _ in range(length))
    return password


def code_validation(email):
    letters = ''.join(secrets.choice(string.ascii_letters) for _ in range(3))
    digits = ''.join(secrets.choice(string.digits) for _ in range(3))

    combined = list(letters + digits)
    random.shuffle(combined)

    code = ''.join(combined)

    send_email(
        subject="Creación de cuentas - Ecosistema",
        to_email=email,
        template_name='email_template_registro.html',
        context={
            'code': code,
        }
    )


def refresh_microsoft_token(request, user: User):
    """
    Refresca un token de Microsoft usando el refresh token almacenado

    Args:
        request: HttpRequest
        user: Usuario (puede venir como string con @dominio)

    Returns:
        Nuevo id_token de Microsoft

    Raises:
        InvalidTokenError: Si no hay refresh token o el refresh falla
    """
    # Extraer username si viene con dominio
    username = user.split('@')[0] if isinstance(user, str) else user.username
    user_instance = User.objects.filter(username__iexact=username).first()

    if not user_instance:
        raise InvalidTokenError(f"Usuario {username} no encontrado")

    # Buscar refresh token activo de Microsoft
    # Los tokens de Microsoft tienen fingerprint='microsoft_token'
    token_entry = RefreshToken.objects.filter(
        user=user_instance,
        is_active=True,
        fingerprint='microsoft_token'
    ).last()

    if not token_entry or not token_entry.token:
        raise InvalidTokenError("No hay refresh token de Microsoft guardado para el usuario")

    # Verificar expiración
    from django.utils import timezone
    if token_entry.expires_at and timezone.now() > token_entry.expires_at:
        token_entry.is_active = False
        token_entry.save()
        raise InvalidTokenError("Refresh token de Microsoft expirado")

    # Verificar inactividad (si existe la función)
    try:
        check_refresh_token_inactivity(token_entry)
    except NameError:
        # La función no existe, continuar
        pass

    # Crear cliente MSAL
    app = ConfidentialClientApplication(
        client_id=config("MICROSOFT_CLIENT_ID"),
        client_credential=config("MICROSOFT_CREDENTIAL"),
        authority=f"https://login.microsoftonline.com/{config('MICROSOFT_TENANT')}"
    )

    # Refrescar token usando MSAL
    # El token de Microsoft ya viene en texto plano
    result = app.acquire_token_by_refresh_token(
        refresh_token=token_entry.token,
        scopes=["User.Read"]
    )

    if not result.get("id_token"):
        raise InvalidTokenError("No se pudo refrescar el token de Microsoft")

    # Actualizar last_used_at
    token_entry.last_used_at = timezone.now()
    token_entry.save(update_fields=["last_used_at"])

    # Actualizar refresh token si fue renovado
    new_refresh_token = result.get("refresh_token")
    if new_refresh_token:
        save_refresh(user=user_instance, token=new_refresh_token)

    # Cerrar sesiones anteriores y crear nueva
    Session.objects.filter(user=user_instance, is_active=True).update(is_active=False)
    save_session(request, user=user_instance, token=result["id_token"], platform="refreshed")

    return result["id_token"]


def refresh_propio_token(request, user: User):
    """
    Refresca un token JWT propio (DEPRECATED)

    NOTA: Esta función está deprecated.
    Use RefreshTokenService.validate_and_rotate_token() del nuevo sistema de seguridad

    Args:
        request: HttpRequest
        user: Usuario

    Returns:
        Nuevo access token

    Raises:
        InvalidTokenError: Si no hay refresh token o es inválido
    """
    _log_warn("refresh_propio_token está deprecated. Use RefreshTokenService", level="warning")

    # Buscar refresh tokens propios (excluyendo los de Microsoft)
    refresh_entry = RefreshToken.objects.filter(
        user=user,
        is_active=True
    ).exclude(fingerprint='microsoft_token').last()

    if not refresh_entry or not refresh_entry.token:
        raise InvalidTokenError("No hay refresh token disponible")

    # Verificar expiración
    from django.utils import timezone
    if refresh_entry.expires_at and timezone.now() > refresh_entry.expires_at:
        refresh_entry.is_active = False
        refresh_entry.save()
        raise InvalidTokenError("Refresh token expirado")

    # Verificar inactividad (si existe la función)
    try:
        check_refresh_token_inactivity(refresh_entry)
    except NameError:
        pass

    # El token ya está en texto plano (nuevo modelo)
    # Si es un token JWT, intentar decodificarlo
    try:
        refresh_payload = jwt.decode(
            refresh_entry.token,
            config('REFRESH_TOKEN_SECRET_KEY'),
            algorithms=["HS256"]
        )

        if refresh_payload.get("type") != "refresh":
            raise InvalidTokenError("El token no es de tipo refresh")

    except ExpiredSignatureError:
        raise InvalidTokenError("Refresh token expirado")
    except jwt.DecodeError:
        # No es un JWT, es un token del nuevo sistema
        # Usar el nuevo servicio
        _log_warn("Token no es JWT, usando RefreshTokenService", level="info")
        from custom_auth.services.refresh_token_service import RefreshTokenService
        from custom_auth.services.token_service import TokenService

        # El nuevo sistema requiere fingerprint
        fingerprint = refresh_entry.fingerprint or 'legacy_token'

        # Validar y rotar
        new_refresh_token = RefreshTokenService.validate_and_rotate_token(
            token=refresh_entry.token,
            fingerprint=fingerprint
        )

        # Obtener servicios del usuario para incluirlos en el token
        servicios = None
        try:
            from custom_auth.services.profile_service import ProfileService
            profiles = ProfileService.get_user_profiles(user)
            if profiles:
                profile_data = ProfileService.build_profile_data(profiles)
                servicios = profile_data.get('servicios')
        except Exception as e:
            _log_warn(f"No se pudieron obtener servicios para el usuario "
                f"{user.username}: {str(e)}", level="warning")

        # Generar nuevo access token con servicios
        new_access_token = TokenService.generate_encrypted_token(
            user=user,
            fingerprint=fingerprint,
            request=request,
            user_type='external',
            exp_minutes=1440,
            servicios=servicios
        )

        # Cerrar sesiones y crear nueva
        Session.objects.filter(user=user, is_active=True).update(is_active=False)
        save_session(request, user=user, token=new_access_token, platform="refreshed")

        return new_access_token

    except Exception as e:
        raise InvalidTokenError(f"Error al decodificar refresh token: {str(e)}")

    # Legacy: generar nuevo access token (JWT antiguo)
    new_access_token = generate_jwt_token(
        data={
            'username': user.username,
            'address': request.META.get('REMOTE_ADDR'),
            'type': 'access',
            'user_type': 'external'
        },
        exp_minutes=1440
    )

    refresh_entry.last_used_at = timezone.now()
    refresh_entry.save(update_fields=["last_used_at"])

    Session.objects.filter(user=user, is_active=True).update(is_active=False)
    save_session(request, user=user, token=new_access_token, platform="refreshed")

    return new_access_token
