"""
Pruebas del login externo (usuarios sin Microsoft AD).

Cubren el HALLAZGO-W: todo login externo exige 2FA, sin exenciones por rol
(beneficiarios, protección ni administrativos). Los servicios se simulan para
no depender de las bases de datos ni de Redis.
"""
import json
from unittest.mock import MagicMock, patch

from django.test import RequestFactory, SimpleTestCase, override_settings

from custom_auth import views
from custom_auth.services import TwoFactorAuthService


@override_settings(
    CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}
)
class LoginExternoTests(SimpleTestCase):
    def setUp(self):
        self.user = MagicMock(username="externo@example.com", is_active=True)
        patches = {
            "ValidationService": patch.object(views, "ValidationService"),
            "ExternalAuthService": patch.object(views, "ExternalAuthService"),
            "TwoFactorAuthService": patch.object(views, "TwoFactorAuthService"),
            "TokenService": patch.object(views, "TokenService"),
            "SessionService": patch.object(views, "SessionService"),
        }
        self.mocks = {name: p.start() for name, p in patches.items()}
        for p in patches.values():
            self.addCleanup(p.stop)

        form_data = {"username": "externo@example.com", "password": "clave"}
        self.mocks["ValidationService"].validate_request_data.return_value = form_data
        self.mocks["ExternalAuthService"].validate_identifier_and_password.return_value = (
            "externo@example.com",
            "clave",
        )
        self.mocks["ExternalAuthService"].authenticate.return_value = self.user

    def _login(self):
        request = RequestFactory().post(
            "/api-auth/auth/",
            data=json.dumps(
                {"datosFormulario": {"username": "externo@example.com", "password": "clave"}}
            ),
            content_type="application/json",
        )
        request.is_mobile = False
        return views.auth(request)

    def test_login_externo_con_dispositivo_exige_2fa(self):
        self.mocks["TwoFactorAuthService"].check_user_has_device.return_value = (True, None)

        response = self._login()
        body = json.loads(response.content)

        self.assertEqual(response.status_code, 200, body)
        self.assertTrue(body["twoFARequired"])
        self.assertNotIn("access_token", body)
        self.mocks["TokenService"].generate_token_pair.assert_not_called()
        self.mocks["SessionService"].create_session.assert_not_called()

    def test_login_externo_sin_dispositivo_devuelve_qr_y_exige_2fa(self):
        self.mocks["TwoFactorAuthService"].check_user_has_device.return_value = (
            False,
            "data:image/png;base64,qr",
        )

        response = self._login()
        body = json.loads(response.content)

        self.assertEqual(response.status_code, 200, body)
        self.assertTrue(body["twoFARequired"])
        self.assertEqual(body["qr_code"], "data:image/png;base64,qr")
        self.mocks["TokenService"].generate_token_pair.assert_not_called()

    def test_no_existe_exencion_de_2fa(self):
        self.assertFalse(hasattr(TwoFactorAuthService, "is_2fa_exempt"))
        self.assertFalse(hasattr(TwoFactorAuthService, "ROLES_EXENTOS_2FA"))
