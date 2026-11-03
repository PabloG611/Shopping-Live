"""
Servicio de gestión de perfiles de usuario
"""
from typing import Dict, Any, Optional, List
from django.contrib.auth.models import User
from django.db.models import Exists, OuterRef
from django.utils import timezone
from custom_auth.models.models_global import *
from users.models.models_global import *
from custom_auth.exceptions import ProfileNotFoundError, DatabaseError
from users.serializer.serializer_get import ApiDatosBasicosUsuario
from utils.logger_generico import _log_warn

class ProfileService:
    """
    Servicio para gestión de perfiles de usuario
    """

    @staticmethod
    def _cast_uuids_to_str(data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convierte UUIDs a strings en un diccionario

        Args:
            data: Diccionario con posibles UUIDs

        Returns:
            Diccionario con UUIDs convertidos a strings
        """
        import uuid
        result = {}
        for key, value in data.items():
            if isinstance(value, uuid.UUID):
                result[key] = str(value)
            elif isinstance(value, dict):
                result[key] = ProfileService._cast_uuids_to_str(value)
            else:
                result[key] = value
        return result

    @staticmethod
    def get_user_profiles(user: User) -> Optional[Any]:
        """
        Obtiene los perfiles activos de un usuario.
        Si no hay perfiles activos pero el usuario ya tiene datos básicos,
        reactiva o crea un perfil por defecto automáticamente para evitar
        que se fuerce al usuario a re-registrar información ya existente.

        Args:
            user: Instancia de User

        Returns:
            QuerySet de PerfilUsuario o None si no hay perfiles ni datos previos
        """
        try:
            if not user:
                _log_warn("Se intentó obtener perfiles con user=None", level="warning")
                return None


            profiles = VisibilidadPerfilUsuario.objects.filter(
                id_perfil_usuario__user=user,
                id_perfil_usuario__activo=True,
                visible=True
            ).select_related(
                'id_perfil_usuario__dependencia',
                'id_perfil_usuario__grupo',
                'id_perfil_usuario__rol',
                'id_perfil_usuario__basicos_usuario__identificacion_usuario',
                'id_perfil_usuario__basicos_usuario__nombre_persona'
            )
            
            profiles = PerfilUsuario.objects.filter(
                user=user,
                activo=True
            ).select_related(
                'dependencia',
                'grupo',
                'rol',
                'basicos_usuario__identificacion_usuario',
                'basicos_usuario__nombre_persona'
            )

            if profiles.exists():
                _log_warn(f"Se encontraron {profiles.count()} perfiles "
                    f"para usuario {user.username}", level="info")
                return profiles

            # No hay perfiles activos. Verificar si el usuario ya tiene datos
            # básicos guardados (identificación, nombre, etc.) a través de
            # cualquier PerfilUsuario (activo o inactivo).
            existing_profile_with_data = PerfilUsuario.objects.filter(
                user=user,
                basicos_usuario__isnull=False
            ).select_related('basicos_usuario').first()

            if existing_profile_with_data and existing_profile_with_data.basicos_usuario:
                _log_warn(f"Usuario {user.username} tiene datos básicos pero perfil inactivo. "
                    f"Reactivando perfil automáticamente.", level="info")
                # Reactivar el perfil existente que tiene datos
                existing_profile_with_data.activo = True
                existing_profile_with_data.fecha_actualizacion = timezone.now().date()
                existing_profile_with_data.save(update_fields=['activo', 'fecha_actualizacion'])

                # Re-consultar perfiles activos
                profiles = PerfilUsuario.objects.filter(
                    user=user,
                    activo=True
                ).select_related(
                    'dependencia',
                    'grupo',
                    'rol',
                    'basicos_usuario__identificacion_usuario',
                    'basicos_usuario__nombre_persona'
                )
                if profiles.exists():
                    _log_warn(f"Perfil reactivado exitosamente para usuario {user.username}", level="info")
                    return profiles

            # Si no hay perfil con datos, verificar si hay DatosBasicosUsuario
            # ligados al usuario a través de su identificación (por migración)
            from users.models.models_global import DatosBasicosUsuario, IdentificacionUsuario

            # Buscar un DatosBasicosUsuario que potencialmente pertenezca a este usuario
            # a través de coincidencia de nombre/apellido con el username o email
            _log_warn(f"No se encontraron perfiles con datos para usuario {user.username}. "
                f"Buscando datos básicos huérfanos...", level="info")

            # Buscar cualquier DatosBasicosUsuario que pueda estar vinculado
            # a través de un PerfilUsuario inactivo sin basicos_usuario
            inactive_profile = PerfilUsuario.objects.filter(
                user=user,
                activo=False
            ).first()

            if inactive_profile:
                # Reactivar el perfil inactivo (aunque no tenga basicos_usuario,
                # al menos el usuario no verá BdRequired)
                inactive_profile.activo = True
                inactive_profile.fecha_actualizacion = timezone.now().date()
                inactive_profile.save(update_fields=['activo', 'fecha_actualizacion'])

                profiles = PerfilUsuario.objects.filter(
                    user=user,
                    activo=True
                ).select_related(
                    'dependencia',
                    'grupo',
                    'rol',
                    'basicos_usuario__identificacion_usuario',
                    'basicos_usuario__nombre_persona'
                )
                if profiles.exists():
                    _log_warn(f"Perfil inactivo reactivado para usuario {user.username}", level="info")
                    return profiles

            _log_warn(f"No se encontraron perfiles ni datos previos para usuario {user.username}", level="info")
            return None

        except Exception as e:
            _log_warn(f"Error obteniendo perfiles para usuario {user.username}: {str(e)}", level="error")
            raise DatabaseError(
                message="Error obteniendo perfiles de usuario",
                code="PROFILE_FETCH_ERROR",
                details={"error": str(e)}
            )

    @staticmethod
    def build_profile_data(profiles: Any) -> Dict[str, Any]:
        """
        Construye los datos de perfil para la respuesta

        Args:
            profiles: QuerySet de PerfilUsuario

        Returns:
            Diccionario con datos del perfil:
            {
                'servicios': List[Dict],
                'id_busuario': str,
                'dependencia': str,
                'grupo': str,
                'datos_usuario': Dict (opcional)
            }

        Raises:
            ProfileNotFoundError: Si no hay datos básicos de usuario
            DatabaseError: Si hay un error procesando los datos
        """
        try:
            first_profile = profiles.first()
            if not first_profile:
                _log_warn("Perfil sin datos básicos de usuario", level="error")
                raise ProfileNotFoundError(
                    message="Perfil de usuario incompleto",
                    code="INCOMPLETE_PROFILE"
                )

            if first_profile.basicos_usuario:
                basicos_usuario = first_profile.basicos_usuario
            else:
                _log_warn("Perfil sin basicos_usuario, usando ecosistemito como fallback", level="info")
                basicos_usuario = DatosBasicosUsuario.objects.get(
                    id_busuario="9fcb9766-dbf7-43ac-a985-03979e1aeaec"
                )

            # Construir nombre completo
            nombre_persona = basicos_usuario.nombre_persona
            nombres_parts = [nombre_persona.primer_nombre]

            if nombre_persona.segundo_nombre:
                nombres_parts.append(nombre_persona.segundo_nombre)

            nombres_parts.append(nombre_persona.primer_apellido)

            if nombre_persona.segundo_apellido:
                nombres_parts.append(nombre_persona.segundo_apellido)

            nombres = ' '.join(nombres_parts)

            # Construir lista de servicios
            servicios = []
            dependencia = None
            grupo = None

            for perfil in profiles:
                url_servicio = (
                    f'{perfil.dependencia.url}/'
                    f'{perfil.grupo.url}/'
                    f'{perfil.rol.url}'
                )

                servicio = {
                    "url": url_servicio,
                    "rol": perfil.rol.nombre_rol,
                    "id_rol": perfil.rol.id_rol
                }

                servicios.append(servicio)

                # Guardar dependencia y grupo del primer perfil
                if not dependencia:
                    dependencia = perfil.dependencia.nombre_dependencia
                if not grupo:
                    grupo = perfil.grupo.nombre_grupo

            # Obtener datos serializados del usuario
            datos_usuario = None
            try:
                # basicos_usuario ya es la instancia de DatosBasicosUsuario; se reutiliza.
                serializer = ApiDatosBasicosUsuario(basicos_usuario)
                datos_usuario = ProfileService._cast_uuids_to_str(
                    serializer.data)
            except Exception as e:
                _log_warn(f"Error serializando datos de usuario: {str(e)}", level="warning")

            # Obtener la cédula del usuario
            documento = None
            try:
                _log_warn(f"Intentando obtener cédula para usuario con id_busuario: {basicos_usuario.id_busuario}", level="info")
                
                if hasattr(basicos_usuario, 'identificacion_usuario') and basicos_usuario.identificacion_usuario:
                    documento = basicos_usuario.identificacion_usuario.numero_identificacion
                else:
                    _log_warn(f"⚠️ basicos_usuario NO tiene identificacion_usuario o es None", level="warning")
                    _log_warn(f"⚠️ Atributos de basicos_usuario: {dir(basicos_usuario)}", level="warning")
            except AttributeError as e:
                _log_warn(f"❌ AttributeError al obtener cédula: {str(e)}", level="error")
            except Exception as e:
                _log_warn(f"❌ Error inesperado al obtener cédula: {str(e)}", level="error", exc_info=True)

            profile_data = {
                'servicios': servicios,
                'id_busuario': str(basicos_usuario.id_busuario),
                'dependencia': dependencia,
                'grupo': grupo,
                'nombres': nombres
            }

            # Agregar documento si existe
            if documento:
                profile_data['documento'] = documento

            if datos_usuario:
                profile_data['datos_usuario'] = datos_usuario

            _log_warn(f"Datos de perfil construidos exitosamente - "
                f"{len(servicios)} servicios", level="info")

            return profile_data

        except ProfileNotFoundError:
            raise

        except Exception as e:
            _log_warn(f"Error construyendo datos de perfil: {str(e)}", level="error")
            raise DatabaseError(
                message="Error procesando datos de perfil",
                code="PROFILE_BUILD_ERROR",
                details={"error": str(e)}
            )
