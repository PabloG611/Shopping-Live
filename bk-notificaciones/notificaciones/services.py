import json
import logging

from django.db import transaction

from .constants import ESTADO_ENVIADA
from .models import (
    Notificacion,
    NotificacionAdjunto,
    NotificacionDestinatario,
    NotificacionEstado,
    NotificacionRegistro,
    NotificacionUsuario,
    MedioNotificacion,
    TipoNotificacion,
)

logger = logging.getLogger(__name__)

CAMPOS_OBLIGATORIOS = {'tipo_notificacion_id', 'medio_notificacion_id', 'titulo', 'usuarios'}


def parse_message(raw_data: str) -> dict | None:
    """Parsea el mensaje JSON del canal Pub/Sub. Retorna dict o None si es inválido."""
    try:
        data = json.loads(raw_data)
    except (json.JSONDecodeError, TypeError) as exc:
        logger.error("JSON inválido recibido: %s — Error: %s", raw_data[:200], exc)
        return None

    faltantes = CAMPOS_OBLIGATORIOS - set(data.keys())
    if faltantes:
        logger.error("Campos obligatorios faltantes: %s — Mensaje: %s", faltantes, raw_data[:200])
        return None

    if not isinstance(data['usuarios'], list) or len(data['usuarios']) == 0:
        logger.error("'usuarios' debe ser una lista no vacía — Mensaje: %s", raw_data[:200])
        return None

    return data


@transaction.atomic
def crear_notificacion(data: dict) -> Notificacion | None:
    """
    Crea una Notificacion y sus registros asociados a partir del dict validado.

    Retorna la instancia Notificacion creada, o None si hubo un error.
    """
    try:
        # ── Validar que tipo y medio existen ──
        tipo = TipoNotificacion.objects.get(pk=data['tipo_notificacion_id'])
        medio = MedioNotificacion.objects.get(pk=data['medio_notificacion_id'])
    except TipoNotificacion.DoesNotExist:
        logger.error("TipoNotificacion id=%s no existe.", data['tipo_notificacion_id'])
        return None
    except MedioNotificacion.DoesNotExist:
        logger.error("MedioNotificacion id=%s no existe.", data['medio_notificacion_id'])
        return None

    # ── Crear el registro central ──
    notificacion = Notificacion.objects.create(
        tipo_notificacion=tipo,
        medio_notificacion=medio,
        titulo=data['titulo'],
        mensaje=data.get('mensaje', ''),
    )

    # ── Asociar usuarios y crear estado inicial ──
    for usuario_uuid in data['usuarios']:
        nu = NotificacionUsuario.objects.create(
            usuario_id=usuario_uuid,
            notificacion=notificacion,
        )
        NotificacionEstado.objects.create(
            notificacion_usuario=nu,
            estado_notificacion=ESTADO_ENVIADA,
        )

    # ── Destinatarios (opcional) ──
    for correo in data.get('destinatarios', []):
        NotificacionDestinatario.objects.create(
            notificacion=notificacion,
            correo=correo,
        )

    # ── Adjuntos (opcional) ──
    for adjunto in data.get('adjuntos', []):
        NotificacionAdjunto.objects.create(
            notificacion=notificacion,
            adjunto=adjunto,
        )

    # ── Registro externo (opcional) ──
    registro_id = data.get('registro_id')
    if registro_id:
        NotificacionRegistro.objects.create(
            notificacion=notificacion,
            registro_id=registro_id,
        )

    logger.info(
        "Notificación %s creada — tipo=%s, medio=%s, usuarios=%d",
        notificacion.id_notificacion, tipo, medio, len(data['usuarios']),
    )
    return notificacion


def procesar_mensaje_pubsub(raw_data: str) -> Notificacion | None:
    """
    Punto de entrada principal: parsea el JSON y crea la notificación.
    Retorna la Notificacion creada o None si falló.
    """
    data = parse_message(raw_data)
    if data is None:
        return None

    return crear_notificacion(data)
