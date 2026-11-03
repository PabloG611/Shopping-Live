from rest_framework import serializers

from ..models import (
    MedioNotificacion,
    Notificacion,
    NotificacionUsuario,
    NotificacionDestinatario,
    NotificacionAdjunto,
    NotificacionRegistro,
    NotificacionEstado,
    TipoNotificacion
)


class NotificacionCorreoSerializer(serializers.Serializer):
    """Destinatarios."""
    destinatarios = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        default=list
    )
    adjuntos = serializers.ListField(
        child=serializers.CharField(max_length=256),
        required=False,
        default=list
    )


class NotificacionCrearSerializer(serializers.Serializer):
    """Payload  uno o varios usuarios."""
    titulo_notificacion = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')
    mensaje_notificacion = serializers.CharField(max_length=15000, required=False, allow_blank=True, default='')
    tipo_notificacion = serializers.IntegerField(min_value=0)
    medio_notificacion = serializers.IntegerField(min_value=0)
    usuario_id = serializers.UUIDField(required=False)
    usuario_ids = serializers.ListField(
        child=serializers.UUIDField(),
        required=False,
        default=list
    )
    notificacion_correo = NotificacionCorreoSerializer(required=False, allow_null=True)
    registro_id = serializers.CharField(max_length=64, required=False, allow_blank=True, allow_null=True)

    def validate(self, data):
        tipo = data.get('tipo_notificacion')
        medio = data.get('medio_notificacion')
        usuario_id = data.get('usuario_id')
        usuario_ids = data.get('usuario_ids') or []

        if usuario_id is not None:
            usuario_ids = list(usuario_ids)
            if usuario_id not in usuario_ids:
                usuario_ids.append(usuario_id)
        if not usuario_ids:
            raise serializers.ValidationError(
                {'usuario_id': 'Debe enviar usuario_id o usuario_ids con al menos un UUID.'}
            )
        data['usuario_ids'] = usuario_ids

        from ..models import TipoNotificacion, MedioNotificacion
        if not TipoNotificacion.objects.filter(id_tiponotificacion=tipo).exists():
            raise serializers.ValidationError({'tipo_notificacion': f'Tipo {tipo} no existe.'})
        if not MedioNotificacion.objects.filter(id_medionotificacion=medio).exists():
            raise serializers.ValidationError({'medio_notificacion': f'Medio {medio} no existe.'})

        return data


class NotificacionResumenSerializer(serializers.ModelSerializer):
    """Contenido de la notificación para listados."""
    tipo = serializers.SerializerMethodField()
    medio = serializers.SerializerMethodField()

    class Meta:
        model = Notificacion
        fields = ['id_notificacion', 'titulo', 'mensaje', 'tipo', 'medio']

    def get_tipo(self, obj):
        return getattr(obj.tipo_notificacion, 'nombre_tiponotificacion', '') if obj.tipo_notificacion_id else ''

    def get_medio(self, obj):
        return getattr(obj.medio_notificacion, 'nombre_medionotificacion', '') if obj.medio_notificacion_id else ''


class NotificacionUsuarioListSerializer(serializers.ModelSerializer):
    """Notificación por usuario para listar (incluye contenido y si está leída)."""
    notificacion = NotificacionResumenSerializer(read_only=True)
    leida = serializers.SerializerMethodField()
    fecha_estado = serializers.SerializerMethodField()

    class Meta:
        model = NotificacionUsuario
        fields = ['id_notificacionusuario', 'usuario_id', 'notificacion', 'leida', 'fecha_estado']

    def get_leida(self, obj):
        try:
            return obj.leida
        except Exception:
            return False

    def get_fecha_estado(self, obj):
        est = NotificacionEstado.objects.filter(notificacion_usuario = obj.id_notificacionusuario).last()
        if est is None:
            return None
        f = getattr(est, 'fecha_estado', None)
        return f.isoformat() if f else None

class ApiTipoNotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = TipoNotificacion
        fields = '__all__'
        read_only_fields = ('__all__',)

class ApiMedioNotificacionSerializer(serializers.ModelSerializer):
    class Meta:
        model = MedioNotificacion
        fields = '__all__'
        read_only_fields = ('__all__',)