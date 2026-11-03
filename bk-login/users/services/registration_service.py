"""
Servicio de registro de usuarios
"""
from typing import Dict, Any
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction, IntegrityError
from custom_auth.exceptions import ValidationError, DatabaseError
from utils.logger_generico import _log_warn

class RegistrationService:
    """
    Servicio para registro de nuevos usuarios externos
    """

    @staticmethod
    def validate_registration_data(form_data: Dict[str, Any]) -> Dict[str, str]:
        """
        Valida los datos de registro (usuario individual o colectivo)

        Args:
            form_data: Datos del formulario. Puede ser:
                - Usuario: primerNombre, primerApellido, contraseña, correo
                - Colectivo: razonSocial, acronimo, contraseña, correo

        Returns:
            Diccionario con datos validados:
            {
                'firstName': str,      # primerNombre o razonSocial
                'lastName': str,       # primerApellido o acronimo
                'password': str,
                'email': str,
                'isColectivo': bool,   # True si es colectivo
                'acronimo': str|None   # Acrónimo para generar username (solo colectivos)
            }

        Raises:
            ValidationError: Si faltan datos requeridos
        """
        password = form_data.get('contraseña')
        email = form_data.get('correo')

        # Detectar si es registro de colectivo
        razon_social = form_data.get('razonSocial')
        acronimo = form_data.get('acronimo')
        is_colectivo = bool(razon_social or acronimo)

        if is_colectivo:
            # Validación para colectivos
            if not razon_social or not acronimo or not password or not email:
                _log_warn("Intento de registro colectivo con datos faltantes", level="warning")
                raise ValidationError(
                    message="Todos los datos son requeridos para registro de colectivo (razonSocial, acronimo, contraseña, correo)",
                    code="MISSING_REGISTRATION_DATA"
                )
            first_name = razon_social
            last_name = acronimo
        else:
            # Validación para usuario individual
            first_name = form_data.get('primerNombre')
            last_name = form_data.get('primerApellido')

            if not first_name or not last_name or not password or not email:
                _log_warn("Intento de registro con datos faltantes", level="warning")
                raise ValidationError(
                    message="Todos los datos son requeridos (primerNombre, primerApellido, contraseña, correo)",
                    code="MISSING_REGISTRATION_DATA"
                )

        # Normalizar email
        email = email.strip().lower()

        # Validar formato básico de email
        if '@' not in email or '.' not in email:
            _log_warn(f"Intento de registro con email inválido: {email}", level="warning")
            raise ValidationError(
                message="Formato de email inválido",
                code="INVALID_EMAIL_FORMAT"
            )

        # Política de contraseñas (AUTH_PASSWORD_VALIDATORS). El usuario aún no
        # existe: se usa una instancia sin guardar para comparar con sus datos.
        try:
            validate_password(
                password,
                user=User(email=email, first_name=first_name, last_name=last_name),
            )
        except DjangoValidationError as e:
            _log_warn("Intento de registro con contraseña que no cumple la política", level="warning")
            raise ValidationError(
                message=' '.join(e.messages),
                code="INVALID_PASSWORD"
            )

        _log_warn(f"Datos de registro validados correctamente (colectivo: {is_colectivo})", level="debug")

        return {
            'firstName': first_name.strip(),
            'lastName': last_name.strip(),
            'password': password,
            'email': email,
            'isColectivo': is_colectivo,
            'acronimo': acronimo.strip() if acronimo else None
        }

    @staticmethod
    def check_user_exists(email: str) -> bool:
        """
        Verifica si ya existe un usuario con el email dado

        Args:
            email: Email a verificar

        Returns:
            True si el usuario existe, False en caso contrario
        """
        exists = User.objects.filter(email=email.lower()).exists()

        if exists:
            _log_warn(f"Usuario ya existe con email: {email}", level="info")
        else:
            _log_warn(f"Email disponible para registro: {email}", level="debug")

        return exists

    @staticmethod
    def generate_unique_username(first_name: str) -> str:
        """
        Genera un username único basado en el nombre

        Args:
            first_name: Primer nombre del usuario

        Returns:
            Username único generado

        Raises:
            DatabaseError: Si no se puede generar un username único después de muchos intentos
        """
        from utils.generate import user_generate

        try:
            username = user_generate(first_name)
            _log_warn(f"Username generado: {username}", level="info")
            return username

        except Exception as e:
            _log_warn(f"Error generando username único: {str(e)}", level="error")
            raise DatabaseError(
                message="Error generando nombre de usuario",
                code="USERNAME_GENERATION_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def create_user(
        username: str,
        email: str,
        password: str
    ) -> User:
        """
        Crea un nuevo usuario

        Args:
            username: Nombre de usuario
            email: Email del usuario
            password: Contraseña del usuario

        Returns:
            Usuario creado

        Raises:
            DatabaseError: Si hay un error al crear el usuario
        """
        try:
            with transaction.atomic():
                # Verificar una vez más que no exista (race condition)
                if User.objects.filter(email=email.lower()).exists():
                    _log_warn(f"Usuario ya existe con email {email} "
                        f"(detectado en creación)", level="warning")
                    raise ValidationError(
                        message="El usuario ya existe",
                        code="USER_ALREADY_EXISTS",
                        status_code=409
                    )

                # Crear usuario con is_active=False
                user = User.objects.create_user(
                    username=username,
                    email=email.lower(),
                    password=password,
                    is_active=False
                )

                _log_warn(f"Usuario creado exitosamente - "
                    f"username: {username}, email: {email}", level="info")

                return user

        except ValidationError:
            # Re-lanzar excepciones de validación
            raise

        except IntegrityError as e:
            _log_warn(f"IntegrityError al crear usuario: {str(e)}", level="error")
            raise ValidationError(
                message="El usuario ya existe",
                code="USER_ALREADY_EXISTS",
                status_code=409
            )

        except Exception as e:
            _log_warn(f"Error inesperado al crear usuario: {str(e)}", level="error", exc_info=True)
            raise DatabaseError(
                message="Error al crear usuario",
                code="USER_CREATION_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def send_welcome_email(email: str, username: str) -> None:
        """
        Envía email de bienvenida con credenciales

        Args:
            email: Email del usuario
            username: Username generado

        Raises:
            No lanza excepciones - solo loguea errores
        """
        from utils.utils import send_email

        try:
            send_email(
                subject="Registro usuarios - Ecosistema",
                to_email=email,
                template_name='email_template_credenciales.html',
                context={
                    'username': username,
                }
            )

            _log_warn(f"Email de bienvenida enviado a: {email}", level="info")

        except Exception as e:
            # No fallar el registro si no se puede enviar el email
            _log_warn(f"Error enviando email de bienvenida a {email}: {str(e)}", level="error", exc_info=True)

    @classmethod
    def register_user(
        cls,
        first_name: str,
        last_name: str,
        password: str,
        email: str,
        is_colectivo: bool = False,
        acronimo: str = None
    ) -> Dict[str, Any]:
        """
        Proceso completo de registro de usuario o colectivo

        Args:
            first_name: Primer nombre (o razón social para colectivos)
            last_name: Primer apellido (o acrónimo para colectivos)
            password: Contraseña
            email: Email
            is_colectivo: True si es registro de colectivo
            acronimo: Acrónimo del colectivo (para generar username)

        Returns:
            Diccionario con información del usuario creado:
            {
                'username': str,
                'email': str,
                'is_active': bool,
                'is_colectivo': bool
            }

        Raises:
            ValidationError: Si los datos son inválidos o el usuario ya existe
            DatabaseError: Si hay un error de base de datos
        """
        # 1. Verificar si usuario existe
        if cls.check_user_exists(email):
            raise ValidationError(
                message="El usuario ya existe",
                code="USER_ALREADY_EXISTS",
                status_code=409
            )

        # 2. Generar username único
        # Para colectivos usar el acrónimo, para usuarios el primer nombre
        base_name = acronimo if is_colectivo and acronimo else first_name
        username = cls.generate_unique_username(base_name)

        # 3. Crear usuario
        user = cls.create_user(username, email, password)

        # 4. Enviar email de bienvenida
        cls.send_welcome_email(email, username)

        tipo_registro = "colectivo" if is_colectivo else "usuario"
        _log_warn(f"Proceso de registro completado para {tipo_registro}: {username}", level="info")

        return {
            'username': user.username,
            'email': user.email,
            'is_active': user.is_active,
            'is_colectivo': is_colectivo
        }
