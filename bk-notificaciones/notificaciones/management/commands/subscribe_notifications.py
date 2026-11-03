import logging
import signal
import time
from urllib.parse import urlparse

import redis
from django.conf import settings
from django.core.management.base import BaseCommand

from notificaciones.services import procesar_mensaje_pubsub

logger = logging.getLogger(__name__)

# Reintentos: backoff exponencial hasta MAX_BACKOFF segundos (inicio y reconexión en marcha).
INITIAL_BACKOFF_SEC = 1.0
MAX_BACKOFF_SEC = 60.0
SOCKET_CONNECT_TIMEOUT_SEC = 10.0


def _redis_target_label(url: str) -> str:
    """Host:puerto y db para mensajes de error (sin credenciales)."""
    try:
        p = urlparse(url)
        host = p.hostname or '(sin host)'
        port = p.port if p.port is not None else 6379
        db = (p.path or '/0').strip('/')
        db = db if db else '0'
        return f'{host}:{port} (db {db})'
    except Exception:
        return '(URL Redis no parseable)'


class Command(BaseCommand):
    help = (
        'Inicia un suscriptor Redis Pub/Sub que escucha el canal de notificaciones '
        'y persiste cada mensaje recibido en la base de datos.'
    )

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._pubsub = None
        self._client = None
        self._running = True

    def handle(self, *args, **options):
        channel = settings.REDIS_PUBSUB_CHANNEL
        url = settings.REDIS_PUBSUB_URL

        signal.signal(signal.SIGINT, self._shutdown)
        signal.signal(signal.SIGTERM, self._shutdown)

        backoff = INITIAL_BACKOFF_SEC
        while self._running:
            try:
                self._connect_and_subscribe(url, channel)
            except (
                redis.ConnectionError,
                redis.TimeoutError,
                redis.AuthenticationError,
                OSError,
            ) as exc:
                if not self._running:
                    break
                target = _redis_target_label(url)
                self.stderr.write(
                    self.style.ERROR(
                        'No se pudo conectar a Redis en '
                        f'{target}. Comprueba servicio, red/VPN y credenciales en .env.\n'
                        f'Reintento en {backoff:.0f}s. (Ctrl+C para salir)\n'
                        f'Detalle: {exc}'
                    )
                )
                logger.warning(
                    'Redis no disponible en %s: %s. Reintento en %.1fs',
                    target,
                    exc,
                    backoff,
                )
                self._close_connection()
                time.sleep(backoff)
                backoff = min(backoff * 2, MAX_BACKOFF_SEC)
                continue

            backoff = INITIAL_BACKOFF_SEC

            self.stdout.write(
                self.style.SUCCESS(
                    f"Suscrito al canal '{channel}' en {_redis_target_label(url)}. "
                    'Esperando mensajes...'
                )
            )

            while self._running:
                try:
                    message = self._pubsub.get_message(
                        ignore_subscribe_messages=True,
                        timeout=1.0,
                    )
                except (
                    redis.ConnectionError,
                    redis.TimeoutError,
                    OSError,
                ) as exc:
                    logger.warning(
                        'Conexión a Redis perdida en el bucle: %s. Reconectando...',
                        exc,
                    )
                    self._close_connection()
                    break

                if message is None:
                    continue

                if message['type'] != 'message':
                    continue

                raw_data = message['data']
                if isinstance(raw_data, bytes):
                    raw_data = raw_data.decode('utf-8')

                preview = raw_data[:100] + ('...' if len(raw_data) > 100 else '')
                self.stdout.write(f"Mensaje recibido en '{channel}': {preview}")
                logger.info(
                    "Mensaje recibido en canal '%s' (%d caracteres)",
                    channel,
                    len(raw_data),
                )

                notificacion = procesar_mensaje_pubsub(raw_data)
                if notificacion:
                    self.stdout.write(
                        self.style.SUCCESS(
                            f'Notificación guardada: id={notificacion.id_notificacion}'
                        )
                    )
                    logger.info(
                        'Notificación persistida: id_notificacion=%s',
                        notificacion.id_notificacion,
                    )
                else:
                    self.stderr.write(
                        self.style.WARNING(
                            'El mensaje no pudo ser procesado. Ver logs del nivel ERROR.'
                        )
                    )
                    logger.warning(
                        'Fallo al procesar mensaje del canal %s (payload %d caracteres)',
                        channel,
                        len(raw_data),
                    )

        self._close_connection()
        self.stdout.write(self.style.SUCCESS('Suscriptor finalizado.'))

    def _connect_and_subscribe(self, url: str, channel: str) -> None:
        self._close_connection()
        self._client = redis.Redis.from_url(
            url,
            socket_connect_timeout=SOCKET_CONNECT_TIMEOUT_SEC,
            socket_timeout=None,
        )
        try:
            self._client.ping()
            self._pubsub = self._client.pubsub()
            self._pubsub.subscribe(channel)
        except Exception:
            self._close_connection()
            raise

    def _close_connection(self) -> None:
        if self._pubsub is not None:
            try:
                self._pubsub.unsubscribe()
            except redis.ConnectionError:
                pass
            try:
                self._pubsub.close()
            except redis.ConnectionError:
                pass
            self._pubsub = None
        if self._client is not None:
            try:
                self._client.close()
            except redis.ConnectionError:
                pass
            self._client = None

    def _shutdown(self, signum, frame):
        self.stdout.write(
            self.style.WARNING(f'\nSeñal {signum} recibida. Cerrando suscriptor...')
        )
        self._running = False
        self._close_connection()
        self.stdout.write(self.style.SUCCESS('Suscriptor cerrado correctamente.'))
