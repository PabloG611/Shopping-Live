"""
Servicio para obtención de todos los datos de un usuario por username
Soporta usuarios regulares y colectivos (representantes)
"""

from typing import Dict, Any, Optional
from uuid import UUID
from django.contrib.auth.models import User
from django.db.models import QuerySet
from custom_auth.exceptions import ValidationError, UserNotFoundError
from users.models.models_global import (
    PerfilUsuario,
    DatosBasicosUsuario,
    DatosColectivos,
    DatosIdentificacionColectivo,
    DatosRepresentate,
    IdentificacionUsuario,
)
from users.serializer.serializer_get import (
    ApiDatosBasicosUsuario,
    ApiGetPKUser,
    ApiPerfilUsuario,
    ApiDatosRepresentante,
    ApiGetPKRepresentante,
)
from utils.logger_generico import _log_warn

def _cast_uuids_to_str(obj):
    if isinstance(obj, dict):
        return {k: _cast_uuids_to_str(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_cast_uuids_to_str(v) for v in obj]
    if isinstance(obj, UUID):
        return str(obj)
    return obj


class GetUserAllDataService:
    """
    Servicio para consultar todos los datos de un usuario por username.
    Soporta usuarios regulares y colectivos (representantes).
    """

    @staticmethod
    def get_user(username: str) -> User:
        user = User.objects.filter(username__iexact=username).first()
        if not user:
            _log_warn(f"Usuario no encontrado: {username}", level="warning")
            raise UserNotFoundError(
                message="Usuario no encontrado",
                code="USER_NOT_FOUND"
            )
        return user

    @staticmethod
    def get_profiles(user: User) -> QuerySet:
        return PerfilUsuario.objects.filter(
            user=user
        ).select_related(
            'dependencia', 'grupo', 'rol',
            'basicos_usuario'
        )

    @staticmethod
    def get_basic_data(profiles: QuerySet) -> Optional[Dict[str, Any]]:
        perfil = profiles.filter(
            basicos_usuario__isnull=False
        ).first()

        if not perfil or not perfil.basicos_usuario:
            return None, None

        # perfil.basicos_usuario ya es la instancia de DatosBasicosUsuario
        # (cargada vía select_related); no es necesario re-consultarla.
        usuario = perfil.basicos_usuario

        datos_serialized = _cast_uuids_to_str(
            ApiDatosBasicosUsuario(usuario).data
        )
        pks_serialized = _cast_uuids_to_str(
            ApiGetPKUser(usuario).data
        )

        return datos_serialized, pks_serialized

    @staticmethod
    def get_representante_data(numero_identificacion: str) -> Optional[Dict[str, Any]]:
        identificacion = IdentificacionUsuario.objects.filter(
            numero_identificacion=numero_identificacion
        ).first()

        if not identificacion:
            _log_warn(f"Identificación del representante no encontrada: {numero_identificacion}", level="warning")
            raise ValidationError(
                message="Número de identificación del representante no encontrado",
                code="REPRESENTANTE_NOT_FOUND"
            )

        representante = DatosRepresentate.objects.filter(
            identificacion_representante=identificacion
        ).first()

        if not representante:
            _log_warn(f"Datos del representante no encontrados para identificación: {numero_identificacion}", level="warning")
            raise ValidationError(
                message="Datos del representante no encontrados",
                code="REPRESENTANTE_DATA_NOT_FOUND"
            )

        datos_serialized = _cast_uuids_to_str(
            ApiDatosRepresentante(representante).data
        )
        pks_serialized = _cast_uuids_to_str(
            ApiGetPKRepresentante(representante).data
        )

        return datos_serialized, pks_serialized

    @staticmethod
    def get_colectivo_data_by_user(user: User) -> Dict[str, Any]:
        colectivo = (
            DatosColectivos.objects.filter(user=user)
            .select_related("representante")
            .prefetch_related("identificaciones")
            .first()
        )

        if not colectivo:
            raise ValidationError(
                message="No se encontraron datos de colectivo para el usuario",
                code="COLECTIVO_NOT_FOUND",
            )

        datos_colectivo = {
            "id_colectivo": str(colectivo.id_colectivo),
            "nombre_colectivo": colectivo.nombre_colectivo,
            "resolucion": colectivo.resolucion,
            "fecha_resaolucion": colectivo.fecha_resaolucion,
        }

        identificacion = (
            DatosIdentificacionColectivo.objects.filter(colectivo=colectivo)
            .select_related("tipo_identificacion")
            .first()
        )
        datos_identificacion_colectivo = None
        if identificacion:
            datos_identificacion_colectivo = {
                "id_icolectivo": str(identificacion.id_icolectivo),
                "numero_identificacion": identificacion.numero_identificacion,
                "tipo_identificacion": (
                    identificacion.tipo_identificacion.id_tidentificacion
                    if identificacion.tipo_identificacion
                    else None
                ),
            }

        datos_representante = None
        pks_representante = None
        if colectivo.representante:
            datos_representante = _cast_uuids_to_str(
                ApiDatosRepresentante(colectivo.representante).data
            )
            pks_representante = _cast_uuids_to_str(
                ApiGetPKRepresentante(colectivo.representante).data
            )

        return {
            "datos_colectivo": _cast_uuids_to_str(datos_colectivo),
            "datos_identificacion_colectivo": _cast_uuids_to_str(
                datos_identificacion_colectivo
            ),
            "datos_representante": datos_representante,
            "pks_representante": pks_representante,
        }

    @classmethod
    def get_all_data(
        cls,
        username: str,
        is_colectivo: bool = False,
        numero_id_representante: Optional[str] = None
    ) -> Dict[str, Any]:
        # 1. Obtener usuario
        user = cls.get_user(username)

        # 2. Obtener perfiles
        profiles = cls.get_profiles(user)
        perfiles_serialized = _cast_uuids_to_str(
            ApiPerfilUsuario(profiles, many=True).data
        )

        # 3. Construir respuesta base
        result = {
            "username": user.username,
            "email": user.email,
            "is_colectivo": is_colectivo,
            "perfiles": perfiles_serialized,
        }

        if is_colectivo:
            # 4a. Colectivo: obtener datos por relación directa user -> colectivo
            result.update(cls.get_colectivo_data_by_user(user))
        else:
            # 4b. Regular: obtener datos básicos
            datos_basicos, pks = cls.get_basic_data(profiles)
            result["datos_basicos"] = datos_basicos
            result["pks"] = pks

        _log_warn(f"Datos completos obtenidos para usuario: {username} "
            f"(colectivo: {is_colectivo})", level="info")

        return result
