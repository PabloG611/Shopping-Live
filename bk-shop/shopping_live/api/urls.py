"""
Enrutador principal de la API de Shopping Live.

Un solo backend sirve a los dos mundos (web empresas/admin y móvil compradores).
Las rutas de dominio son compartidas; si en el futuro un cliente necesita
endpoints propios, se agregan bajo api-shop/web/ o api-shop/mobile/ apuntando a
apiviews específicas, pero reutilizando los mismos services (sin duplicar negocio).
"""
from django.urls import include, path
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    # --- Dominios de negocio (compartidos web + móvil) ---
    path("", include("tiendas.urls")),
    # Próximas apps: catalogo, lives, ordenes, pagos, chat
    # path("", include("catalogo.urls")),
    # path("", include("ordenes.urls")),

    # --- Documentación OpenAPI ---
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("swagger/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
]
