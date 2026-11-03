# from kafka import KafkaProducer
import json
from django.conf import settings

from users.replicator.datos_basicos import replicar_contacto_usuario, replicar_datosbasicos_usuario, replicar_ubucacionrural_usuario, replicar_ubucacionurbana_usuario
from users.service.datos_basicos import construir_evento_contacto_usuario, construir_evento_datosbasicos_usuario, construir_evento_ubicacionrural_usuario, construir_evento_ubicacionurbana_usuario

def enviar_evento_Usuario(basicosUsuario):
    evento = construir_evento_datosbasicos_usuario(basicosUsuario,settings.BACKEND_ID)
    replicar_datosbasicos_usuario(evento["datos"])
    
def enviar_evento_contacto(contacto):
    evento = construir_evento_contacto_usuario(contacto, settings.BACKEND_ID)
    replicar_contacto_usuario(evento["datos"])
    
def enviar_evento_ubicacionrural(contacto):
    evento = construir_evento_ubicacionrural_usuario(contacto, settings.BACKEND_ID)
    replicar_ubucacionrural_usuario(evento["datos"])
    
def enviar_evento_ubicacionurbana(contacto):
    evento = construir_evento_ubicacionurbana_usuario(contacto, settings.BACKEND_ID)
    replicar_ubucacionurbana_usuario(evento["datos"])