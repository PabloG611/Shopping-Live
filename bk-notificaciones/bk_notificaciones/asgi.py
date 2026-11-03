"""
ASGI config for bk_notificaciones project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.auth import AuthMiddlewareStack

import notificaciones.websocket.routing

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'bk_notificaciones.settings')

# application = get_asgi_application()

application = ProtocolTypeRouter({
    "http": get_asgi_application(),
    "websocket": AuthMiddlewareStack(
        URLRouter(
            notificaciones.websocket.routing.websocket_urlpatterns
        )
    ),
    "lifespan": None,
})
