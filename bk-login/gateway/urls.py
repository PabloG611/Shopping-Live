from django.urls import re_path
from django.urls import path
from rest_framework import routers
from gateway.views import *
from gateway.services.protecdoc.protecdoc_views import radicado, trazabilidad, metadata_radicado, detalle_radicado
from gateway.services.protecdoc.protecdoc_views_v1 import documentos_v1, descargar_documento_v1
from gateway.services.protecdoc.protecdoc_views_v2 import documentos_v2, descargar_documento_v2
from gateway.services.novasoft.novasoft_views import consulta_empleado

app_name = 'gateway'
routers = routers.DefaultRouter()

urlpatterns = [
    path('hser/', historico_ser),
    path('protecdoc/radicado/', radicado),
    path('protecdoc/trazabilidad/', trazabilidad),
    path('protecdoc/radicado/metadata/', metadata_radicado),
    path('protecdoc/radicado/detalle/', detalle_radicado),
    path('protecdoc/v1/documentos/', documentos_v1),
    path('protecdoc/v1/documentos/descargar/', descargar_documento_v1),
    path('protecdoc/v2/documentos/', documentos_v2),
    path('protecdoc/v2/documentos/descargar/', descargar_documento_v2),
    path('novasoft/empleado/', consulta_empleado),
    path('endpoints/', listar_endpoints),
    path('endpoints/guardar/', guardar_endpoint),
    path('endpoints/eliminar/', eliminar_endpoint),
    path('endpoints/roles/', listar_endpoints_roles),
    path('endpoints/roles/guardar/', guardar_endpoint_rol),
    path('endpoints/roles/eliminar/', eliminar_endpoint_rol),
    path('sockets/', listar_sockets),
    path('sockets/guardar/', guardar_socket),
    path('sockets/eliminar/', eliminar_socket),
    path('sockets/roles/', listar_sockets_roles),
    path('sockets/roles/guardar/', guardar_socket_rol),
    path('sockets/roles/eliminar/', eliminar_socket_rol),
    path('organizaciones-externas/', listar_organizaciones),
    path('organizaciones-externas/guardar/', guardar_organizacion),
    path('organizaciones-externas/eliminar/', eliminar_organizacion),
    path('organizaciones-externas/endpoints/', listar_endpoints_externos),
    path('organizaciones-externas/endpoints/guardar/', guardar_endpoint_externo),
    path('organizaciones-externas/endpoints/eliminar/', eliminar_endpoint_externo),
    re_path(r'^(?P<path>.*)$', proxy),
]
