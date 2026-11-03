"""
Servicio de gestión de sesiones
"""
from typing import Optional
from django.contrib.auth.models import User
from django.db import transaction
from django.http import HttpRequest
from custom_auth.models.models_global import Session
from custom_auth.exceptions import SessionError, DatabaseError
from utils.utils import logout_other_sessions
from utils.save_data import save_session as save_session_util
from utils.logger_generico import _log_warn

class SessionService:
    """
    Servicio para gestión de sesiones de usuario
    """

    @staticmethod
    def validate_and_close_existing_sessions(user: User) -> None:
        """
        Cierra sesiones activas del usuario de forma atómica.
        Usa select_for_update() para prevenir race conditions entre
        peticiones concurrentes del mismo usuario.

        Args:
            user: Instancia de User

        Raises:
            DatabaseError: Si hay un error cerrando sesiones
        """
        try:
            with transaction.atomic():
                # Bloquear filas de sesiones activas para evitar
                # que otra petición concurrente las modifique
                active_sessions = (
                    Session.objects
                    .select_for_update()
                    .filter(user=user, is_active=True)
                )

                if not active_sessions.exists():
                    _log_warn(f"No hay sesiones activas para {user.username}", level="debug")
                    return

                _log_warn(f"Cerrando {active_sessions.count()} sesiones activas "
                    f"para usuario {user.username}", level="info")

                # Cierre atómico con update()
                count = active_sessions.update(is_active=False)
                _log_warn(f"Se cerraron {count} sesiones para usuario {user.username}", level="info")
        except Exception as e:
            _log_warn(f"Error validando/cerrando sesiones para {user.username}: {str(e)}", level="error")
            # No fallar la autenticación por este error
            # pero registrarlo para investigación
            pass

    @staticmethod
    def create_session(
        request: HttpRequest,
        user: User,
        token: str,
        platform: str
    ) -> str:
        """
        Crea una nueva sesión para el usuario

        Args:
            request: HttpRequest
            user: Instancia de User
            token: Token de autenticación
            platform: Plataforma (web, mobile, etc)

        Returns:
            ID de la sesión creada

        Raises:
            SessionError: Si hay un error creando la sesión
        """
        try:
            session_id = save_session_util(
                request=request,
                user=user,
                token=token,
                platform=platform
            )

            _log_warn(f"Sesión creada exitosamente - "
                f"user: {user.username}, "
                f"platform: {platform}, "
                f"session_id: {session_id}", level="info")

            return str(session_id)

        except Exception as e:
            _log_warn(f"Error creando sesión para {user.username}: {str(e)}", level="error", exc_info=True)
            raise SessionError(
                message="Error al crear sesión",
                code="SESSION_CREATION_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def get_active_session(user: User) -> Optional[Session]:
        """
        Obtiene la sesión activa más reciente de un usuario

        Args:
            user: Instancia de User

        Returns:
            Instancia de Session o None si no hay sesión activa
        """
        try:
            return Session.objects.filter(
                user=user,
                is_active=True
            ).order_by('-created_at').first()

        except Exception as e:
            _log_warn(f"Error obteniendo sesión activa para {user.username}: {str(e)}", level="error")
            return None

    @staticmethod
    def close_session(session_id: str) -> bool:
        """
        Cierra una sesión por su ID

        Args:
            session_id: ID de la sesión

        Returns:
            True si se cerró exitosamente, False en caso contrario
        """
        try:
            session = Session.objects.filter(
                id_session=session_id,
                is_active=True
            ).first()

            if session:
                session.is_active = False
                session.save(update_fields=['is_active'])
                _log_warn(f"Sesión {session_id} cerrada exitosamente", level="info")
                return True

            _log_warn(f"Sesión {session_id} no encontrada o ya cerrada", level="warning")
            return False

        except Exception as e:
            _log_warn(f"Error cerrando sesión {session_id}: {str(e)}", level="error")
            raise DatabaseError(
                message="Error cerrando sesión",
                code="SESSION_CLOSE_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def close_all_user_sessions(user: User) -> int:
        """
        Cierra todas las sesiones activas de un usuario

        Args:
            user: Instancia de User

        Returns:
            Número de sesiones cerradas
        """
        try:
            count = logout_other_sessions(user=user)
            _log_warn(f"Se cerraron {count} sesiones para usuario {user.username}", level="info")
            return count

        except Exception as e:
            _log_warn(f"Error cerrando sesiones para {user.username}: {str(e)}", level="error")
            raise DatabaseError(
                message="Error cerrando sesiones de usuario",
                code="SESSION_CLOSE_ALL_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def revoke_user_access(user: User, motivo: str) -> None:
        """
        Invalida todo el acceso vigente de un usuario: cierra sus sesiones
        activas y revoca sus refresh tokens.

        Basta con cerrar las sesiones para invalidar los access tokens de
        inmediato, porque autenticar_jwt exige que el token esté vinculado a
        una sesión activa. Revocar los refresh tokens evita que se emitan
        tokens nuevos sin volver a iniciar sesión.

        Args:
            user: Usuario cuyo acceso se revoca
            motivo: Motivo de la revocación (para trazabilidad en logs)
        """
        from custom_auth.services.refresh_token_service import RefreshTokenService

        sesiones = logout_other_sessions(user=user)
        refresh = RefreshTokenService.revoke_user_tokens(user)
        _log_warn(f"Acceso revocado para usuario {user.username} ({motivo}): "
            f"{sesiones} sesiones cerradas, {refresh} refresh tokens revocados", level="info")

    @staticmethod
    def revoke_user_access_on_commit(user: User, motivo: str) -> None:
        """
        Programa revoke_user_access para cuando se confirme la transacción
        actual, así la sesión solo se invalida si el cambio se guardó.
        """
        def _revocar():
            try:
                SessionService.revoke_user_access(user, motivo)
            except Exception as e:
                _log_warn(f"Error revocando acceso de {user.username} ({motivo}): {str(e)}",
                    level="error", exc_info=True)

        transaction.on_commit(_revocar)

    @staticmethod
    def update_session_token(user: User, old_token: str, new_token: str) -> bool:
        """
        Actualiza el token en la sesión activa del usuario

        Args:
            user: Instancia de User
            old_token: Token actual almacenado en la sesión
            new_token: Nuevo token a almacenar

        Returns:
            True si se actualizó exitosamente, False si no se encontró la sesión

        Raises:
            DatabaseError: Si hay un error actualizando la sesión
        """
        try:
            # Buscar la sesión activa que contiene el token antiguo
            active_sessions = Session.objects.filter(user=user, is_active=True)

            for session in active_sessions:
                try:
                    decrypted_token = session.get_decrypted_token()
                    if decrypted_token == old_token:
                        # Actualizar con el nuevo token
                        session.set_encrypted_token(new_token)
                        session.save(update_fields=['token'])
                        _log_warn(f"Token actualizado en sesión {session.id_session} "
                            f"para usuario {user.username}", level="info")
                        return True
                except Exception as e:
                    # Sesión con token corrupto, continuar con la siguiente
                    _log_warn(f"Error descifrando token en sesión {session.id_session}: {str(e)}", level="warning")
                    continue

            _log_warn(f"No se encontró sesión activa con el token antiguo para {user.username}", level="warning")
            return False

        except Exception as e:
            _log_warn(f"Error actualizando token de sesión para {user.username}: {str(e)}", level="error")
            raise DatabaseError(
                message="Error actualizando token de sesión",
                code="SESSION_UPDATE_TOKEN_ERROR",
                details={"error": str(e)}
            )
