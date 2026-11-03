import requests
from datetime import timedelta
from django.utils import timezone
from django.utils.timezone import now
from decouple import config
from django.contrib.auth.models import User
from django_otp.plugins.otp_totp.models import TOTPDevice
from jwt.exceptions import InvalidTokenError
from custom_auth.models.models_global import *
from utils.logger_generico import _log_warn

INACTIVITY_LIMIT = timedelta(days=1)

def validate_sesion(user: User) -> bool:
    try:
        session = Session.objects.filter(user=user, is_active=True).last()

        if not session:
            return False

        if session.expires_at and session.expires_at < now():
            session.is_active = False
            session.save(update_fields=['is_active'])
            return False

        return True
    except Exception as e:
        _log_warn(f"[validate_sesion] Error: {e}", level="error")
        return False


def validate_recaptcha(token: str) -> bool:
    try:
        response = requests.post(config('RECAPTCHA_API'), data={
            'secret': config('RECAPTCHA_SECRET_KEY'),
            'response': token
        }, timeout=10)
        response.raise_for_status()

        response_json = response.json()

        success = response_json.get('success', False)
        # score = response_json.get('score')  # Solo en reCAPTCHA v3
        # action = response_json.get('action')
        # hostname = response_json.get('hostname')

        # Puedes agregar lógica extra si usas reCAPTCHA v3:
        # if score < 0.5: return False

        return success

    except requests.RequestException as e:
        _log_warn(f"[Recaptcha] Error en la solicitud: {e}", level="error")
        return False
    except Exception as e:
        _log_warn(f"[Recaptcha] Error inesperado: {e}", level="error")
        return False


def validate_2fa_device(user: User) -> bool:
    try:
        totp_device = TOTPDevice.objects.get(user=user, confirmed=True)
        if totp_device:
            return True
    except TOTPDevice.DoesNotExist:
        return False
    

def check_refresh_token_inactivity(refresh_token_obj):
    if refresh_token_obj.last_used_at:
        if timezone.now() - refresh_token_obj.last_used_at > INACTIVITY_LIMIT:
            refresh_token_obj.is_active = False
            refresh_token_obj.save(update_fields=["is_active"])
            raise InvalidTokenError("Sesión expirada por inactividad.")


def validate_password_for_import(password, username, first_name=None, last_name=None) -> None:
    """
    Aplica la política de contraseñas (AUTH_PASSWORD_VALIDATORS) a una
    contraseña que llega en una migración o importación masiva.

    Lanza ValueError con los mensajes de la política para que la fila quede en
    el reporte de errores de la importación.
    """
    from django.contrib.auth.password_validation import validate_password
    from django.core.exceptions import ValidationError as DjangoValidationError

    if password is None or (isinstance(password, float) and password != password):
        raise ValueError("Campo obligatorio vacío: password")
    try:
        validate_password(
            str(password),
            user=User(username=username or '', first_name=first_name or '', last_name=last_name or ''),
        )
    except DjangoValidationError as e:
        raise ValueError(f"Contraseña no válida: {' '.join(e.messages)}")
