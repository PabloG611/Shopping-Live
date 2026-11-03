"""
Servicio para obtención de datos de usuario
"""
from typing import Dict, Any, Tuple, Optional, List
from django.contrib.auth.models import User
from django.db.models import QuerySet
from custom_auth.exceptions import ValidationError, UserNotFoundError, ProfileNotFoundError
from users.models.models_global import PerfilUsuario, DatosBasicosUsuario
from users.serializer.serializer_get import ApiDatosBasicosUsuario
from utils.logger_generico import _log_warn

class UserDataService:
    """
    Servicio para obtención y procesamiento de datos de usuario
    Genera tokens con información completa del perfil
    """

    @staticmethod
    def extract_username_from_token(user_info: Dict[str, Any]) -> Tuple[str, str]:
        """
        Extrae el username y tipo de token desde la información del token JWT

        Args:
            user_info: Información del usuario desde request.user

        Returns:
            Tupla (username, token_type)
        """
        token_type = user_info.get('token_type', '')

        # Para usuarios de Microsoft, extraer username antes del @
        if token_type == 'microsoft':
            preferred_username = user_info.get('preferred_username', '')
            username = preferred_username.split('@')[0] if preferred_username else ''
        else:
            username = user_info.get('username', '')

        _log_warn(f"Username extraído: {username}, token_type: {token_type}", level="debug")

        return username, token_type

    @staticmethod
    def get_user_by_username(username: str) -> User:
        """
        Busca un usuario por username

        Args:
            username: Username a buscar

        Returns:
            Usuario encontrado

        Raises:
            UserNotFoundError: Si el usuario no existe
        """
        user = User.objects.filter(username__iexact=username).first()

        if not user:
            _log_warn(f"Usuario no encontrado: {username}", level="warning")
            raise UserNotFoundError(
                message="Usuario no encontrado",
                code="USER_NOT_FOUND"
            )

        _log_warn(f"Usuario encontrado: {username}", level="debug")
        return user

    @staticmethod
    def get_user_profiles(user: User) -> List[Any]:
        """
        Obtiene los perfiles activos de un usuario con datos relacionados

        Args:
            user: Usuario a buscar

        Returns:
            Lista (materializada) de perfiles activos

        Raises:
            ProfileNotFoundError: Si el usuario no tiene perfil
        """
        # Se materializa el queryset una sola vez (list()) para evitar que las
        # posteriores llamadas a .first()/iteración lo reejecuten. El select_related
        # incluye basicos_usuario y sus relaciones más usadas (nombre e
        # identificación) para no disparar consultas lazy al construir el nombre
        # y serializar los datos.
        perfil_instance = list(
            PerfilUsuario.objects.filter(
                user=user,
                activo=True
            ).select_related(
                'dependencia', 'grupo', 'rol',
                'basicos_usuario',
                'basicos_usuario__nombre_persona',
                'basicos_usuario__identificacion_usuario',
            )
        )

        if not perfil_instance:
            _log_warn(f"Usuario sin perfil: {user.username}", level="warning")
            raise ProfileNotFoundError(
                message="Usuario no tiene perfil",
                code="USER_NO_PROFILE"
            )

        _log_warn(f"Perfiles encontrados para {user.username}: {len(perfil_instance)}", level="debug")
        return perfil_instance

    @staticmethod
    def build_full_name(basicos_usuario: Any) -> str:
        """
        Construye el nombre completo del usuario desde basicos_usuario

        Args:
            basicos_usuario: Objeto con datos básicos del usuario

        Returns:
            Nombre completo concatenado
        """
        nombre_persona = basicos_usuario.nombre_persona

        # Construir nombre completo
        partes = [
            nombre_persona.primer_nombre,
            nombre_persona.segundo_nombre if nombre_persona.segundo_nombre else '',
            nombre_persona.primer_apellido,
            nombre_persona.segundo_apellido if nombre_persona.segundo_apellido else ''
        ]

        # Filtrar partes vacías y unir con espacio
        nombre_completo = ' '.join(filter(None, partes))

        _log_warn(f"Nombre completo construido: {nombre_completo}", level="debug")
        return nombre_completo

    @staticmethod
    def build_services_list(perfil_instance: QuerySet) -> Tuple[List[Dict[str, Any]], Optional[str], Optional[str]]:
        """
        Construye la lista de servicios desde los perfiles del usuario

        Args:
            perfil_instance: QuerySet de perfiles

        Returns:
            Tupla (servicios, dependencia, grupo)
            - servicios: Lista de diccionarios con url, rol, id_rol
            - dependencia: Nombre de la primera dependencia encontrada
            - grupo: Nombre del primer grupo encontrado
        """
        servicios = []
        dependencia = None
        grupo = None

        for perfil in perfil_instance:
            # Construir URL del servicio
            url_servicio = f'{perfil.dependencia.url}/{perfil.grupo.url}/{perfil.rol.url}'

            servicio = {
                "url": url_servicio,
                "rol": perfil.rol.nombre_rol,
                "id_rol": perfil.rol.id_rol
            }

            servicios.append(servicio)

            # Guardar primera dependencia y grupo encontrados
            if not dependencia:
                dependencia = perfil.dependencia.nombre_dependencia
            if not grupo:
                grupo = perfil.grupo.nombre_grupo

        _log_warn(f"Servicios construidos: {len(servicios)} servicios, "
            f"dependencia: {dependencia}, grupo: {grupo}", level="debug")

        return servicios, dependencia, grupo

    @staticmethod
    def serialize_basic_data(basicos_usuario: Any) -> Dict[str, Any]:
        """
        Serializa los datos básicos del usuario

        Args:
            basicos_usuario: Objeto con datos básicos

        Returns:
            Diccionario con datos serializados (UUIDs convertidos a strings)
        """
        from uuid import UUID

        def _cast_uuids_to_str(obj):
            """Convierte UUIDs a strings recursivamente"""
            if isinstance(obj, dict):
                return {k: _cast_uuids_to_str(v) for k, v in obj.items()}
            if isinstance(obj, list):
                return [_cast_uuids_to_str(v) for v in obj]
            if isinstance(obj, UUID):
                return str(obj)
            return obj

        try:
            # basicos_usuario ya es la instancia de DatosBasicosUsuario (viene del
            # perfil ya cargado); se serializa directamente sin re-consultar.
            serializer = ApiDatosBasicosUsuario(basicos_usuario)

            # Convertir UUIDs a strings
            data_serializer = _cast_uuids_to_str(serializer.data)

            _log_warn("Datos básicos serializados correctamente", level="debug")
            return data_serializer

        except Exception as e:
            _log_warn(f"Error serializando datos básicos: {str(e)}", level="error", exc_info=True)
            raise ValidationError(
                message="Error obteniendo datos básicos",
                code="SERIALIZATION_ERROR"
            )

    @staticmethod
    def build_user_data(
        username: str,
        nombres: str,
        id_busuario: str,
        dependencia: Optional[str],
        grupo: Optional[str],
        servicios: List[Dict[str, Any]],
        data_serializer: Dict[str, Any],
        remote_addr: Optional[str],
        token_type: str
    ) -> Dict[str, Any]:
        """
        Construye un diccionario con todos los datos del usuario

        Args:
            username: Username del usuario
            nombres: Nombre completo
            id_busuario: ID de básicos usuario
            dependencia: Nombre de dependencia
            grupo: Nombre de grupo
            servicios: Lista de servicios
            data_serializer: Datos básicos serializados
            remote_addr: Dirección IP del cliente
            token_type: Tipo de token ('microsoft' o 'propio')

        Returns:
            Diccionario con todos los datos del usuario
        """
        # Determinar user_type
        user_type = 'intern' if token_type == 'microsoft' else 'external'

        # Construir datos del usuario
        user_data = {
            'datos_basicos': {
                "username": username,
                "nombre": nombres,
                "id_busuario": id_busuario,
                "dependencia": dependencia,
                "grupo": grupo,
                "servicios": servicios,
                "datos": data_serializer
            },
            'address': remote_addr,
            'type': 'data',
            'user_type': user_type
        }

        _log_warn(f"Datos de usuario construidos para: {username}", level="info")

        return user_data

    @classmethod
    def get_user_data(
        cls,
        user_info: Dict[str, Any],
        remote_addr: Optional[str]
    ) -> Dict[str, Any]:
        """
        Proceso completo de obtención de datos de usuario

        Args:
            user_info: Información del usuario desde request.user (JWT)
            remote_addr: Dirección IP del cliente

        Returns:
            Diccionario con todos los datos del usuario

        Raises:
            UserNotFoundError: Si el usuario no existe
            ProfileNotFoundError: Si el usuario no tiene perfil
            ValidationError: Si hay errores en la validación/serialización
        """
        # 1. Extraer username desde token
        username, token_type = cls.extract_username_from_token(user_info)

        # 2. Buscar usuario
        user = cls.get_user_by_username(username)

        # 3. Obtener perfiles activos
        perfil_instance = cls.get_user_profiles(user)

        # 4. Obtener basicos_usuario del primer perfil
        # (get_user_profiles ya devuelve una lista materializada y no vacía)
        basicos_usuario = perfil_instance[0].basicos_usuario

        # 5. Construir nombre completo
        nombres = cls.build_full_name(basicos_usuario)

        # 6. Construir lista de servicios
        servicios, dependencia, grupo = cls.build_services_list(perfil_instance)

        # 7. Serializar datos básicos
        data_serializer = cls.serialize_basic_data(basicos_usuario)

        # 8. Construir datos completos del usuario
        user_data = cls.build_user_data(
            username=username,
            nombres=nombres,
            id_busuario=str(basicos_usuario.id_busuario),
            dependencia=dependencia,
            grupo=grupo,
            servicios=servicios,
            data_serializer=data_serializer,
            remote_addr=remote_addr,
            token_type=token_type
        )

        _log_warn(f"Proceso de obtención de datos completado para: {username}", level="info")

        return user_data
