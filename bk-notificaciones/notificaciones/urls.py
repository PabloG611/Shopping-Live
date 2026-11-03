from django.urls import path, include
from rest_framework import routers

from notificaciones.apiviews.api_get import MedioNotificacionApi, TipoNotificacionApi

from . import views

app_name = 'notificaciones'

routers = routers.DefaultRouter()
routers.register('tiponotificacion', TipoNotificacionApi, 'tiponotificacion')
routers.register('medionotificacion', MedioNotificacionApi, 'medionotificacion')

urlpatterns = [
    path('', include(routers.urls)),

    # Crear notificación para uno o varios usuarios 
    path(
        'notificaciones/crear/',
        views.CrearNotificacion.as_view(),
        name='crear-notificacion'
    ),
    # Listar notificaciones por usuario (?leida=, ?medio=)
    path(
        'usuarios/<uuid:usuario_id>/notificaciones/',
        views.NotificacionesPorUsuarioList.as_view(),
        name='notificaciones-por-usuario'
    ),
    # Conteo de no leídas
    path(
        'usuarios/<uuid:usuario_id>/notificaciones/count-unread/',
        views.CountNoLeidas.as_view(),
        name='count-no-leidas'
    ),
    # Marcar como leída
    path(
        'usuarios/<uuid:usuario_id>/notificaciones/<uuid:id_notificacion_usuario>/marcar-leida/',
        views.MarcarLeida.as_view(),
        name='marcar-leida'
    ),
    # Marcar como no leída
    path(
        'usuarios/<uuid:usuario_id>/notificaciones/<uuid:id_notificacion_usuario>/marcar-no-leida/',
        views.MarcarNoLeida.as_view(),
        name='marcar-no-leida'
    ),
    # Eliminar 
    path(
        'usuarios/<uuid:usuario_id>/notificaciones/<uuid:id_notificacion_usuario>/eliminar/',
        views.EliminarNotificacion.as_view(),
        name='eliminar-notificacion'
    ),
    # Eliminar todas las leídas de un usuario
    path(
        'usuarios/<uuid:usuario_id>/notificaciones/eliminar-leidas/',
        views.EliminarNotificacionesLeidasUsuario.as_view(),
        name='eliminar-notificaciones-leidas'
    ),
]
