"""
Servicio de recuperación de contraseñas
"""
import secrets
from typing import Optional, Tuple
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta
from custom_auth.exceptions import ValidationError, DatabaseError
from users.models.models_global import RecoveryCode
from utils.save_data import save_data
from utils.utils import send_email
from utils.logger_generico import _log_warn

class RecoveryService:
    """
    Servicio para recuperación de contraseñas
    Solo aplica a usuarios externos (usuario y contraseña propios del aplicativo).
    La contraseña de los usuarios internos (Microsoft) se cambia en Microsoft,
    nunca desde el aplicativo (backlog 1.1, decisión 2026-10-05).
    """

    # Configuración
    CODE_LENGTH = 6
    CODE_EXPIRATION_MINUTES = 5

    @staticmethod
    def validate_recovery_data(form_data: dict) -> Tuple[str, str]:
        """
        Valida los datos de recuperación

        Args:
            form_data: Datos del formulario

        Returns:
            Tupla (username, user_type)

        Raises:
            ValidationError: Si faltan datos, el tipo es inválido o es un
                usuario interno (Microsoft)
        """
        username = (form_data.get("username") or "").strip()
        user_type = (form_data.get("userType") or "").strip().lower()

        if not username or not user_type:
            _log_warn("Intento de recovery sin username o userType", level="warning")
            raise ValidationError(
                message="Todos los datos son requeridos",
                code="MISSING_RECOVERY_DATA"
            )

        if user_type == "interno":
            _log_warn("Intento de recovery para usuario interno (Microsoft) rechazado", level="warning")
            raise ValidationError(
                message="La contraseña de los usuarios de Microsoft se cambia en Microsoft, no desde el aplicativo",
                code="INTERNAL_USER_RECOVERY_NOT_ALLOWED"
            )

        if user_type != "externo":
            _log_warn(f"Tipo de usuario inválido: {user_type}", level="warning")
            raise ValidationError(
                message="Tipo de usuario inválido",
                code="INVALID_USER_TYPE"
            )

        _log_warn(f"Datos de recovery validados - username: {username}, type: {user_type}", level="debug")

        return username, user_type

    @staticmethod
    def find_external_user_email(username: str) -> Optional[str]:
        """
        Busca el email de un usuario externo

        Args:
            username: Username del usuario

        Returns:
            Email del usuario o None si no existe
        """
        try:
            user = User.objects.filter(username__iexact=username).first()

            if user and user.email:
                _log_warn(f"Usuario externo encontrado: {username}", level="info")
                return user.email

            _log_warn(f"Usuario externo no encontrado: {username}", level="info")
            return None

        except Exception as e:
            _log_warn(f"Error buscando usuario externo {username}: {str(e)}", level="error")
            return None

    # Intentos máximos para encontrar un código que no choque con uno vigente
    CODE_GENERATION_ATTEMPTS = 10

    @staticmethod
    def generate_recovery_code() -> int:
        """
        Genera un código de recuperación de 6 dígitos con `secrets`
        (CSPRNG). Evita los códigos activos y vigentes: `code` es único y
        `save_data` actualiza el registro existente si el código ya está,
        así que un choque reasignaría el código vigente de otro usuario.
        El código nunca se registra en logs (backlog 1.2).

        Returns:
            Código numérico de 6 dígitos

        Raises:
            DatabaseError: Si no se encuentra un código libre
        """
        for _ in range(RecoveryService.CODE_GENERATION_ATTEMPTS):
            code = 100000 + secrets.randbelow(900000)
            in_use = RecoveryCode.objects.filter(
                code=code, is_active=True, expiration__gt=timezone.now()
            ).exists()
            if not in_use:
                return code

        _log_warn("No se encontró un código de recuperación libre", level="error")
        raise DatabaseError(
            message="Error al generar código de recuperación",
            code="RECOVERY_CODE_GENERATION_ERROR"
        )

    @staticmethod
    def save_recovery_code(email: str, code: int) -> None:
        """
        Guarda el código de recuperación en la base de datos

        Args:
            email: Email del usuario
            code: Código de recuperación

        Raises:
            DatabaseError: Si hay un error al guardar
        """
        try:
            expiration = timezone.now() + timedelta(
                minutes=RecoveryService.CODE_EXPIRATION_MINUTES
            )

            save_data({
                "email": email,
                "code": code,
                "expiration": expiration,
                # Si el código ya existía (usado o vencido), save_data lo
                # actualiza: hay que reactivarlo
                "is_active": True,
            }, RecoveryCode)

            _log_warn(f"Código de recuperación guardado para: {email} "
                f"(expira en {RecoveryService.CODE_EXPIRATION_MINUTES} min)", level="info")

        except Exception as e:
            _log_warn(f"Error guardando código de recuperación: {str(e)}", level="error")
            raise DatabaseError(
                message="Error al guardar código de recuperación",
                code="RECOVERY_CODE_SAVE_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def send_recovery_email(email: str, username: str, code: int) -> None:
        """
        Envía email con el código de recuperación

        Args:
            email: Email del destinatario
            username: Username del usuario
            code: Código de recuperación

        Raises:
            No lanza excepciones - solo loguea errores
        """
        try:
            send_email(
                subject="Recuperación de contraseñas - Ecosistema",
                to_email=email,
                template_name="email_template_recuperacion.html",
                context={
                    "username": username,
                    "code": code
                }
            )

            _log_warn(f"Email de recuperación enviado a: {email}", level="info")

        except Exception as e:
            # No fallar el proceso si no se puede enviar el email
            _log_warn(f"Error enviando email de recuperación a {email}: {str(e)}", level="error", exc_info=True)

    @classmethod
    def process_password_recovery(
        cls,
        username: str,
        user_type: str
    ) -> None:
        """
        Proceso completo de recuperación de contraseña

        Args:
            username: Username del usuario
            user_type: Tipo de usuario (solo 'externo'; validado en validate_recovery_data)

        Note:
            Este método siempre retorna exitosamente (no lanza excepciones)
            para no exponer si el usuario existe o no.
            Solo loguea errores internamente.
        """
        try:
            # 1. Buscar email del usuario (solo externos)
            if user_type != "externo":
                _log_warn(f"Recuperación rechazada para tipo no permitido: {user_type}", level="warning")
                return
            recipient_email = cls.find_external_user_email(username)

            # 2. Si el usuario existe, procesar recuperación
            if recipient_email:
                # Generar código
                code = cls.generate_recovery_code()

                # Guardar código
                cls.save_recovery_code(recipient_email, code)

                # Enviar email
                cls.send_recovery_email(recipient_email, username, code)

                _log_warn(f"Proceso de recuperación completado para: {username} "
                    f"(tipo: {user_type})", level="info")
            else:
                # Usuario no existe - no hacer nada pero loguear
                _log_warn(f"Recuperación solicitada para usuario inexistente: {username} "
                    f"(tipo: {user_type})", level="info")

        except DatabaseError:
            # Error al guardar el código - loguear pero no exponer
            _log_warn(f"Error en proceso de recuperación para {username}", level="error", exc_info=True)

        except Exception as e:
            # Cualquier otro error - loguear pero no exponer
            _log_warn(f"Error inesperado en proceso de recuperación para {username}: {str(e)}", level="error", exc_info=True)
