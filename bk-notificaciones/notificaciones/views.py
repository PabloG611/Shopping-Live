from django.db import transaction
from django.db.models import OuterRef, Subquery
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.generics import GenericAPIView
from rest_framework.pagination import PageNumberPagination

from .constants import ESTADO_ELIMINADA, ESTADO_LEIDA, ESTADO_NO_LEIDA
from .models import (
    Notificacion,
    NotificacionEstado,
    NotificacionUsuario,
    NotificacionDestinatario,
    NotificacionAdjunto,
    NotificacionRegistro,
)
from .serializer.serializers import NotificacionUsuarioListSerializer, NotificacionCrearSerializer

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

class EcoPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 1000

    def get_page_number(self, request, paginator):
        # Permite usar parámetros personalizados
        page_param = getattr(self, 'custom_page_param', self.page_query_param)
        return request.query_params.get(page_param, 1)

def _notificaciones_visibles(usuario_id, medio_id=None):
    """NotificacionUsuario del usuario que no estén eliminadas."""
    fecha_creacion_sq = (
        NotificacionEstado.objects
            .filter(notificacion_usuario_id=OuterRef('id_notificacionusuario'))
            .order_by('fecha_estado')
            .values('fecha_estado')[:1]
    )
    qs = (
        NotificacionUsuario.objects
        .filter(usuario_id=usuario_id)
        .select_related('notificacion', 'notificacion__tipo_notificacion', 'notificacion__medio_notificacion')
        .prefetch_related('estados')
        .annotate(fecha_creacion=Subquery(fecha_creacion_sq))
        .order_by('-fecha_creacion')
    )

    if medio_id is not None:
        qs = qs.filter(notificacion__medio_notificacion_id=medio_id)
  
    return [nu for nu in qs if not nu.eliminada]


def _count_no_leidas(usuario_id, medio_id=None):
    return sum(1 for nu in _notificaciones_visibles(usuario_id, medio_id=medio_id) if not nu.leida)


def _parse_bool_query(value: str):
    """Parsea query ?leida=... → True/False o None si no es reconocible."""
    v = (value or '').strip().lower()
    if v in ('true', '1', 'yes', 'si', 'sí'):
        return True
    if v in ('false', '0', 'no'):
        return False
    return None


class NotificacionesPorUsuarioList(GenericAPIView):
    """
    GET: Lista notificaciones del usuario (no eliminadas), paginado.

    Query opcional:
    - leida=true|false — solo leídas o solo no leídas; sin parámetro, todas.
    - medio=<int> — id de MedioNotificacion (eco_noti_medionotificacion).
    """
    serializer_class = NotificacionUsuarioListSerializer
    pagination_class = EcoPagination

    def get_queryset(self):
        """Requerido por GenericAPIView (p. ej. Browsable API). El GET usa _notificaciones_visibles."""
        usuario_id = self.kwargs.get('usuario_id')
        if not usuario_id:
            return NotificacionUsuario.objects.none()
        return (
            NotificacionUsuario.objects.filter(usuario_id=usuario_id)
            .select_related(
                'notificacion',
                'notificacion__tipo_notificacion',
                'notificacion__medio_notificacion',
            )
            .prefetch_related('estados')
        )

    def get(self, request, usuario_id):
        notificaciones = _notificaciones_visibles(usuario_id)

        medio_raw = request.query_params.get('medio')
        if medio_raw is not None and str(medio_raw).strip() != '':
            try:
                medio_id = int(medio_raw)
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'medio debe ser un entero (id de medio de notificación).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            notificaciones = [
                nu
                for nu in notificaciones
                if nu.notificacion.medio_notificacion_id == medio_id
            ]

        leida_raw = request.query_params.get('leida')
        if leida_raw is not None and str(leida_raw).strip() != '':
            leida_val = _parse_bool_query(leida_raw)
            if leida_val is None:
                return Response(
                    {'detail': 'leida debe ser true o false (también se acepta 1/0).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            notificaciones = [nu for nu in notificaciones if nu.leida is leida_val]

        page = self.paginate_queryset(notificaciones)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(notificaciones, many=True)
        return Response(serializer.data)


class CountNoLeidas(APIView):
    """GET: Conteo de no leídas del usuario. Query opcional: ?medio=<int>."""

    def get(self, request, usuario_id):
        medio_raw = request.query_params.get('medio')
        medio_id = None

        if medio_raw is not None and str(medio_raw).strip() != '':
            try:
                medio_id = int(medio_raw)
            except (TypeError, ValueError):
                return Response(
                    {'detail': 'medio debe ser un entero (id de medio de notificación).'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        count = _count_no_leidas(usuario_id, medio_id=medio_id)
        payload = {'count': count, 'usuario_id': str(usuario_id)}
        if medio_id is not None:
            payload['medio'] = medio_id
        return Response(payload)


class MarcarLeida(APIView):
    """POST: Marcar una notificación como leída."""

    def post(self, request, usuario_id, id_notificacion_usuario):
        nu = _get_notificacion_usuario(id_notificacion_usuario, usuario_id)
        if nu is None:
            return Response(
                {'detail': 'Notificación no encontrada o no pertenece al usuario.'},
                status=status.HTTP_404_NOT_FOUND
            )
        if nu.eliminada:
            return Response(
                {'detail': 'No se puede modificar una notificación eliminada.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        NotificacionEstado.objects.create(
            notificacion_usuario=nu,
            estado_notificacion=ESTADO_LEIDA
        )
        return Response({'detail': 'Marcada como leída.', 'id': str(nu.pk)})


class MarcarNoLeida(APIView):
    """POST: Marcar una notificación como no leída."""

    def post(self, request, usuario_id, id_notificacion_usuario):
        nu = _get_notificacion_usuario(id_notificacion_usuario, usuario_id)
        if nu is None:
            return Response(
                {'detail': 'Notificación no encontrada o no pertenece al usuario.'},
                status=status.HTTP_404_NOT_FOUND
            )
        if nu.eliminada:
            return Response(
                {'detail': 'No se puede modificar una notificación eliminada.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        NotificacionEstado.objects.create(
            notificacion_usuario=nu,
            estado_notificacion=ESTADO_NO_LEIDA
        )
        return Response({'detail': 'Marcada como no leída.', 'id': str(nu.pk)})


class EliminarNotificacion(APIView):
    """POST o DELETE: Marcar notificación como eliminada ."""

    def post(self, request, usuario_id, id_notificacion_usuario):
        return self._eliminar(usuario_id, id_notificacion_usuario)

    def delete(self, request, usuario_id, id_notificacion_usuario):
        return self._eliminar(usuario_id, id_notificacion_usuario)

    def _eliminar(self, usuario_id, id_notificacion_usuario):
        nu = _get_notificacion_usuario(id_notificacion_usuario, usuario_id)
        if nu is None:
            return Response(
                {'detail': 'Notificación no encontrada o no pertenece al usuario.'},
                status=status.HTTP_404_NOT_FOUND
            )
        NotificacionEstado.objects.create(
            notificacion_usuario=nu,
            estado_notificacion=ESTADO_ELIMINADA
        )
        return Response({'detail': 'Notificación eliminada.', 'id': str(nu.pk)}, status=status.HTTP_200_OK)


class EliminarNotificacionesLeidasUsuario(APIView):
    """POST: Marca como eliminadas todas las notificaciones leídas del usuario."""

    def post(self, request, usuario_id):
        ultimo_estado_subquery = (
            NotificacionEstado.objects
            .filter(notificacion_usuario_id=OuterRef('id_notificacionusuario'))
            .order_by('-fecha_estado')
            .values('estado_notificacion')[:1]
        )

        notificaciones_leidas = list(
            NotificacionUsuario.objects
            .filter(usuario_id=usuario_id)
            .annotate(ultimo_estado=Subquery(ultimo_estado_subquery))
            .filter(ultimo_estado=ESTADO_LEIDA)
        )

        if not notificaciones_leidas:
            return Response(
                {
                    'detail': 'No hay notificaciones leídas para eliminar.',
                    'usuario_id': str(usuario_id),
                    'eliminadas': 0,
                },
                status=status.HTTP_200_OK,
            )

        with transaction.atomic():
            NotificacionEstado.objects.bulk_create([
                NotificacionEstado(
                    notificacion_usuario=nu,
                    estado_notificacion=ESTADO_ELIMINADA,
                )
                for nu in notificaciones_leidas
            ])

        return Response(
            {
                'detail': 'Notificaciones leídas eliminadas.',
                'usuario_id': str(usuario_id),
                'eliminadas': len(notificaciones_leidas),
                'ids_notificacion_usuario': [str(nu.id_notificacionusuario) for nu in notificaciones_leidas],
            },
            status=status.HTTP_200_OK,
        )


def _get_notificacion_usuario(id_notificacion_usuario, usuario_id):
    """Obtiene NotificacionUsuario por id si pertenece al usuario_id."""
    try:
        return NotificacionUsuario.objects.get(id_notificacionusuario=id_notificacion_usuario, usuario_id=usuario_id)
    except NotificacionUsuario.DoesNotExist:
        return None


@method_decorator(csrf_exempt, name='dispatch')
class CrearNotificacion(APIView):
    """
    POST: Crea una notificación para uno o varios usuarios.
    Acepta usuario_id (único) o usuario_ids (array). Opcional: notificacion_correo, registro_id.
    """

    def get(self, request):
        """Instrucciones al abrir en el navegador."""
        return Response({
            'metodo': 'POST',
            'content_type': 'application/json',
            'ejemplo': {
                'titulo_notificacion': 'Título',
                'mensaje_notificacion': 'Cuerpo',
                'tipo_notificacion': 1,
                'medio_notificacion': 1,
                'usuario_ids': ['550e8400-e29b-41d4-a716-446655440000'],
            },
        })

    def post(self, request):
        serializer = NotificacionCrearSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        titulo = data.get('titulo_notificacion') or ''
        mensaje = data.get('mensaje_notificacion') or ''
        tipo_id = data['tipo_notificacion']
        medio_id = data['medio_notificacion']
        usuario_ids = data['usuario_ids']
        notificacion_correo = data.get('notificacion_correo') or {}
        registro_id = (data.get('registro_id') or '').strip()

        try:
            with transaction.atomic():
                notif = Notificacion.objects.create(
                    titulo=titulo,
                    mensaje=mensaje,
                    tipo_notificacion_id=tipo_id,
                    medio_notificacion_id=medio_id,
                )
                ids_notificacion_usuario = []
                
                # Obtener nombres de tipo y medio para el mensaje WebSocket
                tipo_nombre = notif.tipo_notificacion.nombre_tiponotificacion if notif.tipo_notificacion else ''
                medio_nombre = notif.medio_notificacion.nombre_medionotificacion if notif.medio_notificacion else ''
                
                # Obtener la fecha del último estado (que acabamos de crear)
                from django.utils import timezone
                fecha_estado = timezone.now().isoformat()
                
                for uid in usuario_ids:
                    nu, _ = NotificacionUsuario.objects.get_or_create(
                        usuario_id=uid,
                        notificacion=notif,
                        defaults={}
                    )
                    NotificacionEstado.objects.create(
                        notificacion_usuario=nu,
                        estado_notificacion=ESTADO_NO_LEIDA,
                    )
                    ids_notificacion_usuario.append(str(nu.id_notificacionusuario))

                    # Enviar mensaje WebSocket para cada usuario
                    if medio_id == 1:  # Solo enviar por WebSocket si el medio es Web
                        channel_layer = get_channel_layer()
                        async_to_sync(channel_layer.group_send)(
                            'notificaciones',
                            {
                                'type': 'notificaciones_message',
                                'id_notificacionusuario': str(nu.id_notificacionusuario),
                                'usuario_id': str(uid),
                                'notificacion': {
                                    'id_notificacion': str(notif.id_notificacion),
                                    'titulo': titulo,
                                    'mensaje': mensaje,
                                    'tipo': tipo_nombre,
                                    'medio': medio_nombre,
                                },
                                'leida': False,
                                'fecha_estado': fecha_estado,
                            }
                        )

                for correo in notificacion_correo.get('destinatarios') or []:
                    NotificacionDestinatario.objects.create(notificacion=notif, correo=correo)

                for adjunto in notificacion_correo.get('adjuntos') or []:
                    NotificacionAdjunto.objects.create(notificacion=notif, adjunto=adjunto[:256])

                if registro_id:
                    NotificacionRegistro.objects.create(notificacion=notif, registro_id=registro_id[:64])

        except Exception as e:
            return Response(
                {'detail': f'Error al crear la notificación: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

        return Response(
            {
                'detail': 'Notificación creada.',
                'id_notificacion': str(notif.id_notificacion),
                'usuarios_asignados': len(usuario_ids),
                'id_notificacion_usuario': ids_notificacion_usuario,
            },
            status=status.HTTP_201_CREATED
        )
