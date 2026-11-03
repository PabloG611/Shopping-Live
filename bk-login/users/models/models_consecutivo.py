from django.db import models
import uuid
from django.utils import timezone
from django.db.models.functions import Substr
from django.db import transaction
from django.db.models.functions import Cast
from django.db.models import Max, IntegerField

class OrigenRegistro(models.Model):
    id_origen = models.SmallAutoField(primary_key=True)
    nombre_origen = models.CharField(max_length=10, null=False)
    
    class Meta:
        db_table = 'eco_bas_origen'
        verbose_name_plural = 'Tipo de origen del consecutivo del registro'
        
    def __str__(self):
        return str(self.nombre_origen)

class ConsecutivoRegistro(models.Model):
    id_consecutivo = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    consecutivo = models.CharField(
        max_length=13, unique=True)
    fecha_creacion = models.DateField(
        null=False)
    origen = models.ForeignKey(OrigenRegistro, to_field='id_origen', on_delete=models.CASCADE)
    
    class Meta:
        db_table = 'eco_sis_consecutivo'
        verbose_name_plural = 'Creacion del consecutivo del registro'
        
    def __str__(self):
        return str(self.nombre_origen)
    
    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        
    
def CrearConsecutivo(origen_id):
    with transaction.atomic():
        # Año actual en dos dígitos (ej: '25')
        año_actual = timezone.now().strftime('%y')
        
        # Filtra solo los consecutivos creados en este año
        consecutivos_actuales = ConsecutivoRegistro.objects.filter(
            consecutivo__startswith=año_actual
        )

        # Extrae la parte numérica y encuentra el consecutivo mayor
        maximo = (
            consecutivos_actuales
            .annotate(
                numero=Cast(Substr('consecutivo', 3, 7), IntegerField())
            )
            .aggregate(max_num=Max('numero'))['max_num'] or 0
        )

        nuevo_num = maximo + 1
        nuevo_num_str = f"{nuevo_num:07d}"  # Siempre 7 dígitos
        consecutivo_str = f"{año_actual}{nuevo_num_str}"

        # Crea el registro
        origen_save = OrigenRegistro.objects.get(id_origen=origen_id)
        nuevo = ConsecutivoRegistro.objects.create(
            consecutivo=consecutivo_str,
            fecha_creacion=timezone.now().date(),
            origen=origen_save
        )
        return nuevo.consecutivo
