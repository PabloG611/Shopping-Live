from django.contrib import admin
from django.urls import path, include

from utils.HealthService import HealthCheckView

urlpatterns = [
    path('admin/', admin.site.urls),
    # NOTA: Todo endpoint en api-auth/auth o api-gateway esta bypasseado,
    #       por lo que no requiere token interno ni validación de origen.
    path('api-auth/auth/', include('custom_auth.urls')),
    path('api-gateway/', include('gateway.urls')),
    # Todo endpoint que requiera seguridad debe acceder acá
    path('api-auth/users/', include('users.urls')),
    
    
    
    # Health endpoints
    path('health/', HealthCheckView.as_view(), {'endpoint': 'health'}, name='health'),
    path('ready/', HealthCheckView.as_view(), {'endpoint': 'ready'}, name='ready'),
    path('status/', HealthCheckView.as_view(), {'endpoint': 'status'}, name='status'),
    path('metrics/', HealthCheckView.as_view(), {'endpoint': 'metrics'}, name='metrics'),
]
