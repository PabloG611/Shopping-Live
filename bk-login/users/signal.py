from django.conf import settings
from django.db.models.signals import post_save
from django.dispatch import receiver

from users.producer.basicos import enviar_evento_rol_usuario
from users.producer.datos_basicos import enviar_evento_Usuario, enviar_evento_contacto, enviar_evento_ubicacionrural, enviar_evento_ubicacionurbana
from users.producer.datos_complementario import enviar_evento_complementarios, enviar_evento_contrato, enviar_evento_perfil, enviar_evento_resolucion, enviar_evento_user
from .models.models_global import *
from django.contrib.auth.models import User
from django.db import transaction

@receiver(post_save, sender=DatosBasicosUsuario)
def publicar_evento_datosbasicos_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    transaction.on_commit(lambda: enviar_evento_Usuario(instance))
        
@receiver(post_save, sender=DatosContactoUsuario)
def publicar_evento_contacto_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    transaction.on_commit(lambda: enviar_evento_contacto(instance))

# @receiver(post_save, sender=UbicacionRural)
# def publicar_evento_ubicacionrural_usuario(sender, instance, created, **kwargs):
#     if instance._state.db != 'default':
#         return
#     transaction.on_commit(lambda: enviar_evento_ubicacionrural(instance))
    
# @receiver(post_save, sender=UbicacionUrbana)
# def publicar_evento_ubicacionurbana_usuario(sender, instance, created, **kwargs):
#     if instance._state.db != 'default':
#         return
#     transaction.on_commit(lambda: enviar_evento_ubicacionurbana(instance))
    
# @receiver(post_save, sender=DatosComplementariosUsuario)
# def publicar_evento_complementarios_usuario(sender, instance, created, **kwargs):
#     if instance._state.db != 'default':
#         return
#     transaction.on_commit(lambda: enviar_evento_complementarios(instance))

@receiver(post_save, sender=ContratoContratista)
def publicar_evento_contrato_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    transaction.on_commit(lambda: enviar_evento_contrato(instance))
    
@receiver(post_save, sender=ResolucionFuncionario)
def publicar_evento_resolucion_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    transaction.on_commit(lambda: enviar_evento_resolucion(instance))
    
@receiver(post_save, sender=User)
def publicar_evento_user_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    # Solo replicar en creación o cuando cambien campos críticos
    # (evita replicar en cada login por actualización de last_login)
    if not created:
        update_fields = kwargs.get('update_fields')
        if update_fields is not None:
            campos_criticos = {'password', 'username', 'email', 'is_active'}
            if not campos_criticos.intersection(update_fields):
                return
    transaction.on_commit(lambda: enviar_evento_user(instance))

@receiver(post_save, sender=PerfilUsuario)
def publicar_evento_perfil_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    transaction.on_commit(lambda: enviar_evento_perfil(instance))
    
@receiver(post_save, sender=Rol)
def publicar_evento_rol_usuario(sender, instance, created, **kwargs):
    if instance._state.db != 'default':
        return
    transaction.on_commit(lambda: enviar_evento_rol_usuario(instance))