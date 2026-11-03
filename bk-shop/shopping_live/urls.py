from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path

app_name = 'shopping_live'

urlpatterns = [
    path('api-shop/', include('shopping_live.api.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
