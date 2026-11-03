from django.conf import settings

from users.replicator.datos_complementarios import replicar_complementarios_usuario, replicar_contrato_usuario, replicar_perfil_usuario, replicar_resolucion_usuario, replicar_user_usuario
from users.service.datos_complementarios import construir_evento_complementarios_usuario, construir_evento_contratista_usuario, construir_evento_perfil_usuario, construir_evento_resolucion_usuario, construir_evento_user_usuario

def enviar_evento_complementarios(DatosComplementariosUsuario):
    evento = construir_evento_complementarios_usuario(DatosComplementariosUsuario,settings.BACKEND_ID)
    replicar_complementarios_usuario(evento["datos"])

def enviar_evento_contrato(ContratoContratista):
    evento = construir_evento_contratista_usuario(ContratoContratista,settings.BACKEND_ID)
    replicar_contrato_usuario(evento["datos"])
    
def enviar_evento_resolucion(ResolucionFuncionario):
    evento = construir_evento_resolucion_usuario(ResolucionFuncionario,settings.BACKEND_ID)
    replicar_resolucion_usuario(evento["datos"])
    
def enviar_evento_user(User):
    evento = construir_evento_user_usuario(User,settings.BACKEND_ID)
    replicar_user_usuario(evento["datos"])
    
def enviar_evento_perfil(PerfilUsuario):
    evento = construir_evento_perfil_usuario(PerfilUsuario,settings.BACKEND_ID)
    replicar_perfil_usuario(evento["datos"])