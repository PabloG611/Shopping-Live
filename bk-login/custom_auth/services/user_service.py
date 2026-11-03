"""
Servicio de gestión de usuarios
Incluye manejo de race conditions en get_or_create
"""
from typing import Optional
from django.contrib.auth.models import User
from django.db import transaction, IntegrityError
from custom_auth.exceptions import DatabaseError
from utils.logger_generico import _log_warn

class UserService:
    """
    Servicio para gestión de usuarios
    """

    @staticmethod
    def get_or_create_user(username: str) -> User:
        """
        Obtiene o crea un usuario de forma segura manejando race conditions

        Args:
            username: Nombre de usuario (se normaliza a minúsculas)

        Returns:
            Instancia de User

        Raises:
            DatabaseError: Si hay un error de base de datos
        """
        username_normalized = username.lower()

        try:
            # Primero intentar obtener el usuario
            user = User.objects.filter(
                username__iexact=username_normalized).first()
            if user:
                _log_warn(f"Usuario existente encontrado: {username_normalized}", level="debug")
                return user

            # Si no existe, intentar crearlo dentro de una transacción
            with transaction.atomic():
                # Doble check dentro de la transacción para evitar race condition
                user = User.objects.filter(
                    username=username_normalized).first()
                if user:
                    _log_warn(f"Usuario {username_normalized} creado por otro proceso", level="debug")
                    return user

                # Crear nuevo usuario
                user = User.objects.create(
                    username=username_normalized,
                    email=f"{username_normalized}@unp.gov.co",
                    is_active=False
                )
                user.set_unusable_password()
                user.save()

                _log_warn(f"Nuevo usuario creado: {username_normalized}", level="info")
                return user

        except IntegrityError as e:
            # Si hay IntegrityError, probablemente el usuario se creó en paralelo
            # Intentar obtenerlo una vez más
            _log_warn(f"IntegrityError al crear usuario {username_normalized}, "
                f"reintentando obtención: {str(e)}", level="warning")
            user = User.objects.filter(
                username__iexact=username_normalized).first()
            if user:
                return user

            # Si aún no existe, hay un problema mayor
            _log_warn(f"No se pudo crear ni obtener usuario {username_normalized}", level="error")
            raise DatabaseError(
                message="Error al crear usuario",
                code="USER_CREATION_ERROR",
                details={"username": username_normalized, "error": str(e)}
            )

        except Exception as e:
            _log_warn(f"Error inesperado al obtener/crear usuario "
                f"{username_normalized}: {str(e)}", level="error")
            raise DatabaseError(
                message="Error interno al procesar usuario",
                code="USER_SERVICE_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def get_user_by_username(username: str) -> Optional[User]:
        """
        Obtiene un usuario por username

        Args:
            username: Nombre de usuario

        Returns:
            Instancia de User o None si no existe
        """
        try:
            return User.objects.filter(username__iexact=username).first()
        except Exception as e:
            _log_warn(f"Error obteniendo usuario {username}: {str(e)}", level="error")
            return None

    @staticmethod
    def activate_user(user: User) -> None:
        """
        Activa un usuario

        Args:
            user: Instancia de User

        Raises:
            DatabaseError: Si hay un error al guardar
        """
        try:
            if not user.is_active:
                user.is_active = True
                user.save(update_fields=['is_active'])
                _log_warn(f"Usuario {user.username} activado", level="info")
        except Exception as e:
            _log_warn(f"Error activando usuario {user.username}: {str(e)}", level="error")
            raise DatabaseError(
                message="Error al activar usuario",
                code="USER_ACTIVATION_ERROR",
                details={"error": str(e)}
            )
