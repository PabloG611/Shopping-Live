from django.conf import settings

from users.replicator.basicos import replicar_evento_rol_usuario
from users.service.basicos import construir_evento_rol_usuario


def enviar_evento_rol_usuario(rol):
    evento = construir_evento_rol_usuario(rol,settings.BACKEND_ID)
    replicar_evento_rol_usuario(evento["datos"])
    