from django.core.cache import cache
from django.db import transaction
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from custom_auth.models.models_global import Endpoint

# Debe coincidir con la clave usada en gateway/views.py (_obtener_catalogo_endpoints).
# Se versiona al cambiar los campos de Endpoint (v2: is_mobile) para no leer
# objetos cacheados con el esquema anterior.
ENDPOINTS_CACHE_KEY = "gateway:endpoints_catalog:v2"


@receiver(post_save, sender=Endpoint)
@receiver(post_delete, sender=Endpoint)
def invalidar_cache_endpoints(sender, instance, **kwargs):
    """
    Invalida el catálogo de endpoints cacheado por el gateway ante cualquier
    creación, actualización (de cualquier campo: endpoint, is_active, locked,
    public) o eliminación de un Endpoint, sin importar desde dónde se origine
    el cambio (vistas del gateway, admin, shell, etc.).

    Se usa `on_commit` para no invalidar antes de que el cambio sea visible
    para otras conexiones, evitando que se repueble el cache con datos viejos.
    """
    transaction.on_commit(lambda: cache.delete(ENDPOINTS_CACHE_KEY))
