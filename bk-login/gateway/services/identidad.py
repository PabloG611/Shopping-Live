"""
Resolución del id del usuario (Pato-ID, `DatosBasicosUsuario.id_busuario`)
a partir del payload de un JWT ya validado.

La usan el gateway, para el header Pato-ID que envía a los backends, y
LoggerMiddlewareDatabase, para registrar quién hizo cada petición.
"""
from django.contrib.auth.models import User

from users.models.models_global import PerfilUsuario

SIN_USERNAME = "sin_username"
USUARIO_NO_ENCONTRADO = "usuario_no_encontrado"
SIN_DATOS_BASICOS = "sin_datos_basicos"


def username_desde_payload(payload):
    """Username del token según su tipo (Microsoft o propio)."""
    if payload.get('token_type', '') == 'microsoft':
        # Token de Microsoft - extraer de preferred_username
        preferred_username = payload.get('preferred_username', '')
        return preferred_username.split('@')[0] if preferred_username else None
    # Token propio - username está directamente en el payload
    return payload.get('username')


def resolver_id_usuario(payload):
    """
    Retorna `(id_usuario, motivo)`: el id_busuario como str y None, o None y
    el motivo por el que no se pudo resolver (SIN_USERNAME,
    USUARIO_NO_ENCONTRADO o SIN_DATOS_BASICOS).
    """
    username = username_desde_payload(payload)
    if not username:
        return None, SIN_USERNAME

    user = User.objects.filter(username__iexact=username).first()
    if not user:
        return None, USUARIO_NO_ENCONTRADO

    perfil_usuario = PerfilUsuario.objects.filter(
        user=user,
        activo=True
    ).select_related('basicos_usuario').first()

    if not perfil_usuario or not perfil_usuario.basicos_usuario:
        return None, SIN_DATOS_BASICOS

    return str(perfil_usuario.basicos_usuario.id_busuario), None
