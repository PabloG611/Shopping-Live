import json
import uuid

from django.test import TestCase
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from notificaciones.constants import ESTADO_LEIDA, ESTADO_NO_LEIDA
from notificaciones.models import (
    MedioNotificacion,
    Notificacion,
    NotificacionEstado,
    NotificacionRegistro,
    NotificacionUsuario,
    TipoNotificacion,
)
from notificaciones.services import parse_message, procesar_mensaje_pubsub


class ParseMessageTests(TestCase):
    """Tests unitarios de parse_message (sin base de datos)."""

    def test_json_valido_devuelve_dict(self):
        payload = {
            'tipo_notificacion_id': 1,
            'medio_notificacion_id': 2,
            'titulo': 'Título',
            'usuarios': [str(uuid.uuid4())],
        }
        raw = json.dumps(payload)
        data = parse_message(raw)
        self.assertIsNotNone(data)
        self.assertEqual(data['titulo'], 'Título')
        self.assertEqual(len(data['usuarios']), 1)

    def test_json_invalido_devuelve_none(self):
        self.assertIsNone(parse_message('no es json'))

    def test_faltan_campos_obligatorios_devuelve_none(self):
        raw = json.dumps({'titulo': 'x', 'usuarios': [str(uuid.uuid4())]})
        self.assertIsNone(parse_message(raw))

    def test_usuarios_vacia_devuelve_none(self):
        raw = json.dumps({
            'tipo_notificacion_id': 1,
            'medio_notificacion_id': 1,
            'titulo': 'x',
            'usuarios': [],
        })
        self.assertIsNone(parse_message(raw))

    def test_usuarios_no_es_lista_devuelve_none(self):
        raw = json.dumps({
            'tipo_notificacion_id': 1,
            'medio_notificacion_id': 1,
            'titulo': 'x',
            'usuarios': 'no-lista',
        })
        self.assertIsNone(parse_message(raw))


class ProcesarMensajePubsubTests(TestCase):
    """Tests de procesar_mensaje_pubsub con base de datos."""

    def setUp(self):
        self.tipo = TipoNotificacion.objects.create(
            nombre_tiponotificacion='Tipo prueba'
        )
        self.medio = MedioNotificacion.objects.create(
            nombre_medionotificacion='Medio prueba'
        )
        self.uid = uuid.uuid4()

    def _payload(self, **extra):
        base = {
            'tipo_notificacion_id': self.tipo.pk,
            'medio_notificacion_id': self.medio.pk,
            'titulo': 'Hola',
            'mensaje': 'Cuerpo',
            'usuarios': [str(self.uid)],
        }
        base.update(extra)
        return json.dumps(base)

    def test_crea_notificacion_y_relaciones(self):
        raw = self._payload()
        n = procesar_mensaje_pubsub(raw)
        self.assertIsNotNone(n)
        self.assertTrue(Notificacion.objects.filter(pk=n.pk).exists())
        self.assertEqual(
            NotificacionUsuario.objects.filter(
                notificacion=n, usuario_id=self.uid
            ).count(),
            1,
        )

    def test_con_registro_id_opcional(self):
        raw = self._payload(registro_id='ext-123')
        n = procesar_mensaje_pubsub(raw)
        self.assertIsNotNone(n)
        self.assertTrue(
            NotificacionRegistro.objects.filter(
                notificacion=n, registro_id='ext-123'
            ).exists()
        )

    def test_parse_falla_no_crea_nada(self):
        antes = Notificacion.objects.count()
        self.assertIsNone(procesar_mensaje_pubsub('{'))
        self.assertEqual(Notificacion.objects.count(), antes)

    def test_tipo_inexistente_devuelve_none(self):
        raw = self._payload(tipo_notificacion_id=999999)
        self.assertIsNone(procesar_mensaje_pubsub(raw))


class NotificacionesListadoApiTests(APITestCase):
    """GET /usuarios/<uuid>/notificaciones/ con ?leida= y ?medio=."""

    def setUp(self):
        self.tipo = TipoNotificacion.objects.create(
            nombre_tiponotificacion='Tipo API'
        )
        self.medio_a = MedioNotificacion.objects.create(
            nombre_medionotificacion='Medio A'
        )
        self.medio_b = MedioNotificacion.objects.create(
            nombre_medionotificacion='Medio B'
        )
        self.uid = uuid.uuid4()

        n1 = Notificacion.objects.create(
            tipo_notificacion=self.tipo,
            medio_notificacion=self.medio_a,
            titulo='Leída A',
            mensaje='',
        )
        self.nu_leida = NotificacionUsuario.objects.create(
            usuario_id=self.uid,
            notificacion=n1,
        )
        NotificacionEstado.objects.create(
            notificacion_usuario=self.nu_leida,
            estado_notificacion=ESTADO_LEIDA,
        )

        n2 = Notificacion.objects.create(
            tipo_notificacion=self.tipo,
            medio_notificacion=self.medio_b,
            titulo='No leída B',
            mensaje='',
        )
        self.nu_no_leida = NotificacionUsuario.objects.create(
            usuario_id=self.uid,
            notificacion=n2,
        )
        NotificacionEstado.objects.create(
            notificacion_usuario=self.nu_no_leida,
            estado_notificacion=ESTADO_NO_LEIDA,
        )

        self.url = reverse(
            'notificaciones:notificaciones-por-usuario',
            kwargs={'usuario_id': self.uid},
        )

    def _ids_results(self, response):
        self.assertIn('results', response.data)
        return {row['id_notificacionusuario'] for row in response.data['results']}

    def test_lista_todas_paginado(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._ids_results(response)
        self.assertEqual(len(ids), 2)
        self.assertIn(str(self.nu_leida.pk), ids)
        self.assertIn(str(self.nu_no_leida.pk), ids)

    def test_filtro_leida_true(self):
        response = self.client.get(self.url, {'leida': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._ids_results(response)
        self.assertEqual(ids, {str(self.nu_leida.pk)})

    def test_filtro_leida_false(self):
        response = self.client.get(self.url, {'leida': 'false'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._ids_results(response)
        self.assertEqual(ids, {str(self.nu_no_leida.pk)})

    def test_filtro_medio(self):
        response = self.client.get(self.url, {'medio': self.medio_b.pk})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._ids_results(response)
        self.assertEqual(ids, {str(self.nu_no_leida.pk)})

    def test_filtro_medio_y_leida(self):
        response = self.client.get(
            self.url,
            {'medio': self.medio_a.pk, 'leida': 'true'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = self._ids_results(response)
        self.assertEqual(ids, {str(self.nu_leida.pk)})

    def test_medio_invalido_400(self):
        response = self.client.get(self.url, {'medio': 'x'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_leida_invalida_400(self):
        response = self.client.get(self.url, {'leida': 'talvez'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
