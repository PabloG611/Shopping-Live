"""
Clases de paginación reutilizables para la API de Shopping Live.
"""
from rest_framework.pagination import PageNumberPagination


class DefaultPagination(PageNumberPagination):
    """Paginación estándar: ?page= y ?page_size= (tope 1000)."""

    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 1000


class OptionalPagination(DefaultPagination):
    """
    Pagina solo si la petición incluye ?page= o ?page_size=.
    Sin esos parámetros devuelve la lista completa.
    """

    def paginate_queryset(self, queryset, request, view=None):
        if (
            request.query_params.get("page") is None
            and request.query_params.get("page_size") is None
        ):
            return None
        return super().paginate_queryset(queryset, request, view=view)
