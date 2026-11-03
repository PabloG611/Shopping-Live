import uuid
from django.db import models


## Logger Static
class Log(models.Model):
    id_log = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    metodo = models.CharField(max_length=10, blank=True, null=True)
    url = models.TextField(blank=True, null=True)
    version_protocolo = models.CharField(max_length=20, blank=True, null=True)
    headers = models.JSONField(default=dict, blank=True, null=True)
    parametros = models.JSONField(default=dict, blank=True, null=True)
    ipsolicitud = models.CharField(max_length=45, blank=True, null=True)
    body_solicitud = models.TextField(blank=True, null=True)
    response_status = models.IntegerField(blank=True, null=True)
    response_headers = models.JSONField(default=dict, blank=True, null=True)
    body_response = models.TextField(blank=True, null=True)
    fecha_creacion = models.DateTimeField(auto_now_add=True)
    pato_id = models.CharField(max_length=100, blank=True, null=True)
    es_archivo = models.BooleanField(default=False)

    class Meta:
        db_table = 'eco_sis_log'
        verbose_name_plural = 'Logs'

    def __str__(self):
        return str(self.id_log)
