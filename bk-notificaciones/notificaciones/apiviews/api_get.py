from rest_framework import viewsets

from notificaciones.models import MedioNotificacion, TipoNotificacion
from notificaciones.serializer.serializers import ApiMedioNotificacionSerializer, ApiTipoNotificacionSerializer

class TipoNotificacionApi(viewsets.ModelViewSet):
    queryset = TipoNotificacion.objects.all().order_by('id_tiponotificacion')
    serializer_class = ApiTipoNotificacionSerializer
    http_method_names = ['get']

class MedioNotificacionApi(viewsets.ModelViewSet):
    queryset = MedioNotificacion.objects.all().order_by('id_medionotificacion')
    serializer_class = ApiMedioNotificacionSerializer
    http_method_names = ['get']