from rest_framework import routers

from tiendas.apiviews import TiendaViewSet

app_name = "tiendas"

router = routers.DefaultRouter()
router.register(r"tiendas", TiendaViewSet, basename="tienda")

urlpatterns = router.urls
