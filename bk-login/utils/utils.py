import base64
import json
from utils.logger_generico import _log_warn
from django.contrib.auth.models import User
from custom_auth.models.models_global import *
from django.core.mail import EmailMessage
from django.template.loader import render_to_string

def logout_other_sessions(user: User, current_session_id: str = None) -> int:
    """
    Cierra todas las sesiones activas de un usuario de forma atómica.
    Usa update() en lugar de iterar para prevenir race conditions.

    Args:
        user: Usuario cuyas sesiones se cerrarán.
        current_session_id: Opcional, ID de sesión a conservar activa.

    Returns:
        Número de sesiones cerradas.
    """
    sessions = Session.objects.filter(user=user, is_active=True)

    if current_session_id:
        sessions = sessions.exclude(id_session=current_session_id)

    # update() atómico — evita race condition del bucle iterativo
    updated_count = sessions.update(is_active=False)

    if updated_count:
        _log_warn(f"Cerradas {updated_count} sesiones para usuario {user.username}"
            f"{' (excepto sesión actual)' if current_session_id else ''}", level="info")

    return updated_count


def send_email(subject, to_email, template_name, context):
    message = render_to_string(template_name, context)
    from_email = config('DEFAULT_FROM_EMAIL')

    if isinstance(to_email, str):
        recipient_list = [to_email]
    else:
        recipient_list = to_email

    email = EmailMessage(subject, message, from_email, recipient_list)
    email.content_subtype = 'html'

    email.send()


def identificar_tipo_token(token):
    """
    DEPRECATED: Esta función determina el tipo de token basándose en el header
    'alg' del JWT sin verificar la firma, lo que es vulnerable a algorithm
    confusion attacks (un atacante puede manipular el header).

    Usar en su lugar _validate_token() en api/decorators/jwt_decorator.py,
    que prueba ambos validadores (propio y Microsoft) secuencialmente.

    Se mantiene solo por compatibilidad con código que aún la referencie.
    """
    import warnings
    warnings.warn(
        "identificar_tipo_token() está deprecada. Usar _validate_token() "
        "en api/decorators/jwt_decorator.py",
        DeprecationWarning,
        stacklevel=2,
    )
    try:
        header_encoded = token.split(".")[0]
        header_decoded = base64.urlsafe_b64decode(
            header_encoded + "==").decode("utf-8")
        header = json.loads(header_decoded)

        if header.get("alg") == "RS256":
            return "microsoft"
        elif header.get("alg") == "HS256":
            return "propio"
        else:
            return "desconocido"
    except Exception as e:
        return "desconocido"