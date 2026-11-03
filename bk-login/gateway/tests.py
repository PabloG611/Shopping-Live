"""
Pruebas de la validación mobile (x-request-source: mobile_app).

- Mobile se autentica solo con Authorization: Bearer (sin importar si es
  desarrollador) y la sesión del token debe ser platform="mobile".
- Mobile solo accede a endpoints del catálogo con is_mobile=True; web a todos.
- Mobile también exige X-Internal-Token fuera de /api-auth/auth/ y /api-gateway/.

Los modelos y servicios se simulan para no depender de las bases de datos.
"""
import json
from unittest.mock import MagicMock, patch

from django.http import HttpResponse
from django.test import RequestFactory, SimpleTestCase, override_settings

from api.decorators import jwt_decorator
from api.middlewares.SecureRequestMiddleware import SecureRequestMiddleware
from gateway import views

MOBILE_HEADERS = {
    "HTTP_X_REQUEST_SOURCE": "mobile_app",
    "HTTP_USER_AGENT": "application-unp/1.0",
}
CACHES_LOCMEM = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}


class MiddlewareMobileTests(SimpleTestCase):
    def setUp(self):
        self.middleware = SecureRequestMiddleware(lambda request: HttpResponse("ok"))
        self.middleware.internal_token = "token-de-prueba"

    def _get(self, path, **extra):
        return self.middleware(RequestFactory().get(path, **MOBILE_HEADERS, **extra))

    def test_mobile_sin_token_interno_en_ruta_protegida_se_bloquea(self):
        self.assertEqual(self._get("/api-auth/users/datos/").status_code, 404)

    def test_mobile_con_token_interno_en_ruta_protegida_pasa(self):
        response = self._get("/api-auth/users/datos/", HTTP_X_INTERNAL_TOKEN="token-de-prueba")
        self.assertEqual(response.status_code, 200)

    def test_mobile_en_rutas_exentas_pasa_sin_token_interno(self):
        self.assertEqual(self._get("/api-gateway/api-x/recurso/").status_code, 200)
        self.assertEqual(self._get("/api-auth/auth/login/").status_code, 200)


class AutenticacionMobileTests(SimpleTestCase):
    def setUp(self):
        self.user = MagicMock(username="usuario")
        patcher = patch.object(jwt_decorator, "_autenticar_token")
        self.autenticar_token = patcher.start()
        self.addCleanup(patcher.stop)
        self.autenticar_token.return_value = ({"username": "usuario"}, self.user, None)

    def _request(self, mobile=True, **extra):
        headers = dict(MOBILE_HEADERS) if mobile else {}
        request = RequestFactory().get("/api-gateway/api-x/recurso/", **headers, **extra)
        request.is_mobile = mobile
        return request

    def test_mobile_usa_bearer_con_sesion_mobile_sin_exigir_desarrollador(self):
        request = self._request(HTTP_AUTHORIZATION="Bearer abc")
        with patch.object(jwt_decorator.UsuarioExtendido, "es_desarrollador") as es_dev:
            payload, error = jwt_decorator.autenticar_jwt(request)

        self.assertIsNone(error)
        self.assertEqual(payload["auth_source"], "mobile")
        self.assertEqual(request.auth_token, "abc")
        self.autenticar_token.assert_called_once_with(request, "abc", platform="mobile")
        es_dev.assert_not_called()

    def test_mobile_sin_bearer_se_rechaza_aunque_traiga_cookies(self):
        request = self._request()
        with patch.object(jwt_decorator, "get_jwt_from_cookies", return_value="cookie") as cookies:
            payload, error = jwt_decorator.autenticar_jwt(request)

        self.assertIsNone(payload)
        self.assertEqual(error.status_code, 401)
        self.assertEqual(json.loads(error.content)["code"], "TOKEN_MISSING")
        cookies.assert_not_called()
        self.autenticar_token.assert_not_called()

    def test_web_no_restringe_la_plataforma_de_la_sesion(self):
        request = self._request(mobile=False)
        with patch.object(jwt_decorator, "get_jwt_from_cookies", return_value="cookie"):
            payload, error = jwt_decorator.autenticar_jwt(request)

        self.assertIsNone(error)
        self.assertEqual(payload["auth_source"], "cookie")
        self.autenticar_token.assert_called_once_with(request, "cookie")


class SesionPlataformaTests(SimpleTestCase):
    def test_sesion_se_filtra_por_plataforma_mobile(self):
        self.user = MagicMock(username="usuario")
        sesiones = MagicMock()
        sesiones.filter.return_value = []
        with patch.object(jwt_decorator, "_validate_token", return_value=({"username": "usuario"}, "microsoft")), \
                patch.object(jwt_decorator.User.objects, "filter") as users, \
                patch.object(jwt_decorator.Session.objects, "filter", return_value=sesiones):
            users.return_value.first.return_value = self.user
            payload, user, error = jwt_decorator._autenticar_token(
                RequestFactory().get("/"), "abc", platform="mobile"
            )

        sesiones.filter.assert_called_once_with(platform="mobile")
        self.assertIsNone(payload)
        self.assertEqual(json.loads(error.content)["code"], "SESSION_NOT_FOUND")


@override_settings(CACHES=CACHES_LOCMEM)
class PermisoEndpointMobileTests(SimpleTestCase):
    def setUp(self):
        patches = {
            "record_access": patch.object(views, "record_access"),
            "Endpoint": patch.object(views, "Endpoint"),
            "Rol": patch.object(views, "Rol"),
            "EndpointsRole": patch.object(views, "EndpointsRole"),
            "catalogo": patch.object(views, "_obtener_catalogo_endpoints"),
        }
        self.mocks = {name: p.start() for name, p in patches.items()}
        for p in patches.values():
            self.addCleanup(p.stop)

    def _validar(self, is_mobile_request, is_mobile_endpoint, entorno="prod"):
        endpoint = MagicMock(
            locked=False, is_active=True, rolRequired=False, is_mobile=is_mobile_endpoint
        )
        self.mocks["catalogo"].return_value = {"api-x/recurso": endpoint}
        request = RequestFactory().get("/api-gateway/api-x/recurso/")
        request.is_mobile = is_mobile_request
        with patch.object(views, "_normalizar_ruta_endpoint", return_value="api-x/recurso"), \
                patch.object(views, "config", return_value=entorno):
            return views._validar_permiso_endpoint(request, "api-x", "recurso", "id-usuario")

    def test_mobile_en_endpoint_no_mobile_se_rechaza_en_prod(self):
        response = self._validar(is_mobile_request=True, is_mobile_endpoint=False)
        self.assertEqual(response.status_code, 403)
        self.mocks["Endpoint"].objects.filter.return_value.update.assert_not_called()

    def test_mobile_en_endpoint_mobile_pasa(self):
        self.assertIsNone(self._validar(is_mobile_request=True, is_mobile_endpoint=True))

    def test_web_accede_a_endpoint_no_mobile(self):
        self.assertIsNone(self._validar(is_mobile_request=False, is_mobile_endpoint=False))

    def test_fuera_de_prod_se_marca_el_endpoint_como_mobile(self):
        resultado = self._validar(is_mobile_request=True, is_mobile_endpoint=False, entorno="dev")
        self.assertIsNone(resultado)
        self.mocks["Endpoint"].objects.filter.return_value.update.assert_called_once_with(is_mobile=True)
