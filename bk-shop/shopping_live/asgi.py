"""
ASGI config for shopping_live project.

Expone el callable ASGI y enruta HTTP + WebSocket (Django Channels). Los
WebSockets (chat del live, stock en tiempo real) se registrarán aquí cuando se
creen las apps correspondientes.
"""
import os

import django

# 1. Configurar settings ANTES de cualquier import de Django o apps.
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "shopping_live.settings")

# 2. Inicializar el registro de apps explícitamente (evita AppRegistryNotReady
#    cuando los consumers importan modelos en tiempo de import).
django.setup()

# 3. Imports que tocan apps/modelos, ya con el registro listo.
from channels.auth import AuthMiddlewareStack  # noqa: E402
from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from django.core.asgi import get_asgi_application  # noqa: E402

# Rutas WebSocket por app. Ej. a futuro:
#   from chat.routing import websocket_urlpatterns as chat_ws
#   websocket_urlpatterns = chat_ws
websocket_urlpatterns = []

application = ProtocolTypeRouter(
    {
        "http": get_asgi_application(),
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    }
)
