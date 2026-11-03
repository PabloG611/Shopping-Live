from django.urls import path
from .consumers import *


websocket_urlpatterns = [
    path("notificaciones", NotificacionConsumer.as_asgi())
]