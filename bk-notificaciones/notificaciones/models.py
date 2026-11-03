import uuid

from django.db import models


class TipoNotificacion(models.Model):
    """Tipos de notificación (ej: Asignación Informativa, Noticia)."""
    id_tiponotificacion = models.AutoField(primary_key=True)
    nombre_tiponotificacion = models.CharField(max_length=255)

    class Meta:
        db_table = 'eco_noti_tiponotificacion'
        verbose_name = 'Tipo de notificación'
        verbose_name_plural = 'Tipos de notificación'

    def __str__(self):
        return str(self.id_tiponotificacion)


class MedioNotificacion(models.Model):
    """Medios por los que se envía la notificación (ej: Web, Email)."""
    id_medionotificacion = models.AutoField(primary_key=True)
    nombre_medionotificacion = models.CharField(max_length=255)

    class Meta:
        db_table = 'eco_noti_medionotificacion'
        verbose_name = 'Medio de notificación'
        verbose_name_plural = 'Medios de notificación'

    def __str__(self):
        return str(self.id_medionotificacion)


class Notificacion(models.Model):
    """Notificación central: tipo, medio, título y mensaje."""
    id_notificacion = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tipo_notificacion = models.ForeignKey(
        TipoNotificacion,
        to_field='id_tiponotificacion',
        on_delete=models.CASCADE
    )
    medio_notificacion = models.ForeignKey(
        MedioNotificacion,
        to_field='id_medionotificacion',
        on_delete=models.CASCADE
    )
    titulo = models.TextField(max_length=500, blank=True, null=True)
    # Longitud de 15000 para almacenar el cuerpo de los correos electrónicos
    mensaje = models.TextField(max_length=15000, blank=True, null=True)

    class Meta:
        db_table = 'eco_noti_notificacion'
        verbose_name = 'Notificación'
        verbose_name_plural = 'Notificaciones'

    def __str__(self):
        return str(self.id_notificacion)


class NotificacionDestinatario(models.Model):
    """Destinatarios de una notificación (por correo)."""
    id_notificaciondestinatario = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False
    )
    notificacion = models.ForeignKey(
        Notificacion,
        on_delete=models.CASCADE,
        to_field='id_notificacion',
    )
    correo = models.EmailField(max_length=254)

    class Meta:
        db_table = 'eco_noti_notificaciondestinatario'
        verbose_name = 'Destinatario de notificación'
        verbose_name_plural = 'Destinatarios de notificación'

    def __str__(self):
        return str(self.id_notificaciondestinatario)


class NotificacionAdjunto(models.Model):
    """Adjuntos asociados a una notificación."""
    id_notificacionadjunto = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False,
    )
    notificacion = models.ForeignKey(
        Notificacion,
        on_delete=models.CASCADE,
        to_field='id_notificacion',
    )
    adjunto = models.CharField(max_length=256)  # ruta o URL del archivo

    class Meta:
        db_table = 'eco_noti_notificacionadjunto'
        verbose_name = 'Adjunto de notificación'
        verbose_name_plural = 'Adjuntos de notificación'

    def __str__(self):
        return str(self.id_notificacionadjunto)


class NotificacionUsuario(models.Model):
    """Relación notificación–usuario (usuario_id referencia DatosBasicosUsuario.id_busuario)."""
    id_notificacionusuario = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False,
    )
    usuario_id = models.UUIDField(db_index=True)  # FK a usuario
    notificacion = models.ForeignKey(
        Notificacion,
        on_delete=models.CASCADE,
        to_field='id_notificacion',
    )

    class Meta:
        db_table = 'eco_noti_notificacionusuario'
        verbose_name = 'Notificación por usuario'
        verbose_name_plural = 'Notificaciones por usuario'
        constraints = [
            models.UniqueConstraint(
                fields=['usuario_id', 'notificacion'],
                name='eco_noti_unique_usuario_notificacion'
            )
        ]

    def __str__(self):
        return str(self.id_notificacionusuario)
    
    def estado_actual(self):
        """Devuelve el estado más reciente (primer registro por orden fecha_estado desc)."""
        return self.estados.first()

    @property
    def leida(self):
        from .constants import ESTADO_LEIDA
        est = self.estado_actual()
        return est.estado_notificacion == ESTADO_LEIDA if est else False

    @property
    def eliminada(self):
        from .constants import ESTADO_ELIMINADA
        est = self.estado_actual()
        return est.estado_notificacion == ESTADO_ELIMINADA if est else False


class NotificacionRegistro(models.Model):
    """Vinculación de una notificación con un registro externo (registro_id)."""
    id_notificacionregistro = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False,
    )
    notificacion = models.ForeignKey(
        Notificacion,
        on_delete=models.CASCADE,
        to_field='id_notificacion',
    )
    registro_id = models.CharField(max_length=64)  # FK a Registro

    class Meta:
        db_table = 'eco_noti_notificacionregistro'
        verbose_name = 'Registro de notificación'
        verbose_name_plural = 'Registros de notificación'

    def __str__(self):
        return str(self.id_notificacionregistro)


class NotificacionEstado(models.Model):
    """Estados de una notificación por usuario (enviada, leída, fallida, etc.)."""
    id_notificacionestado = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False,
    )
    notificacion_usuario = models.ForeignKey(
        NotificacionUsuario,
        on_delete=models.CASCADE,
        to_field='id_notificacionusuario',
        related_name='estados',
    )
    estado_notificacion = models.IntegerField()
    fecha_estado = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eco_noti_notificacionestado'
        ordering = ['-fecha_estado']
        verbose_name = 'Estado de notificación'
        verbose_name_plural = 'Estados de notificación'

    def __str__(self):
        return str(self.id_notificacionestado)


