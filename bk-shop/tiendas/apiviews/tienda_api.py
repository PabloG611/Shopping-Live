"""
API de tiendas (CRUD). Hereda de BaseViewSet para el manejo de errores y
security headers centralizados. La lógica no trivial vive en TiendaService.
"""
from core.base_viewset import BaseViewSet
from tiendas.models import Tienda
from tiendas.serializers import TiendaSerializer


class TiendaViewSet(BaseViewSet):
    queryset = Tienda.objects.all()
    serializer_class = TiendaSerializer
    lookup_field = "slug"
