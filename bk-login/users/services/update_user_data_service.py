"""
Servicio para actualización de datos de usuario
Maneja la creación/actualización completa de información del usuario
"""

import requests
from typing import Dict, Any, Optional, Tuple
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from django.db import transaction, IntegrityError
from django.utils import timezone
from django.core.exceptions import ValidationError as DjangoValidationError
from decouple import config
from custom_auth.exceptions import ValidationError, UserNotFoundError
from users.models.models_global import (
    DatosBasicosUsuario,
    IdentificacionUsuario,
    NombrePersonaUsuario,
    TelefonoCelularContactoUsuario,
    CorreoElectronicoContactoUsuario,
    DatosContactoUsuario,
    DatosUbicacionUsuario,
    UbicacionUrbana,
    UbicacionRural,
    DatosComplementariosUsuario,
    ContratoContratista,
    ResolucionFuncionario,
    PerfilUsuario,
)
from users.models.models_static import TipoVinculacion
from users.serializer.serializer_get import ApiGetPKUser
from utils.save_data import save_data
from utils.tools import mask_pii
from users.services.beneficiario_profile_helpers import (
    handle_beneficiario_api_response,
    handle_proteccion_api_response,
)
from utils.logger_generico import _log_warn

class UpdateUserDataService:
    """
    Servicio para actualización completa de datos de usuario
    Maneja múltiples modelos relacionados en una transacción atómica
    """

    @staticmethod
    def extract_username(form_data: Dict[str, Any], is_mobile: bool) -> str:
        """
        Extrae el username dependiendo de si es mobile o web

        Args:
            form_data: Datos del formulario
            is_mobile: Si la petición viene de móvil

        Returns:
            Username del usuario

        Raises:
            ValidationError: Si no se encuentra el username
        """
        if is_mobile:
            estado = form_data.get("estado", {})
            username = estado.get("username")
        else:
            username = form_data.get("username")

        if not username:
            _log_warn("Username no proporcionado en la petición", level="warning")
            raise ValidationError(
                message="Username es requerido", code="USERNAME_REQUIRED"
            )

        _log_warn(f"Username extraído: {username} (mobile: {is_mobile})", level="debug")
        return username

    @staticmethod
    def get_user(username: str) -> User:
        """
        Obtiene el usuario por username

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
                message="Usuario no encontrado", code="USER_NOT_FOUND"
            )

        _log_warn(f"Usuario encontrado: {username}", level="debug")
        return user

    @staticmethod
    def get_existing_pks(basicos_usuario_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Obtiene las PKs existentes del usuario si ya tiene datos básicos

        Args:
            basicos_usuario_id: ID de datos básicos del usuario

        Returns:
            Diccionario con PKs existentes o None
        """
        if not basicos_usuario_id:
            return None

        try:
            datos_basicos_instance = DatosBasicosUsuario.objects.get(
                id_busuario=basicos_usuario_id
            )
            user_pk_data = ApiGetPKUser(datos_basicos_instance).data
            _log_warn(f"PKs existentes obtenidos: {user_pk_data}", level="info")
            return user_pk_data

        except DatosBasicosUsuario.DoesNotExist:
            _log_warn(f"DatosBasicosUsuario con ID {basicos_usuario_id} no encontrado", level="warning")
            return None

    @staticmethod
    def _has_key(data: Dict[str, Any], key: str) -> bool:
        """Indica si `key` llegó explícitamente en el payload (para updates parciales)."""
        return key in data

    @staticmethod
    def save_identification_data(
        form_data: Dict[str, Any], user_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de identificación del usuario

        Para actualizaciones (pk existente), solo persiste los campos que
        llegaron explícitamente en form_data — evita anular numero_identificacion/
        tipo_identificacion (campos requeridos) cuando el caller solo quiere
        tocar otra sección del usuario.

        Args:
            form_data: Datos del formulario
            user_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de IdentificacionUsuario guardada

        Raises:
            ValidationError: Si el número de identificación ya existe
        """
        pk_identificacion = user_pk_data.get(
            "id_iusuario") if user_pk_data else None

        campos = ("numero_identificacion", "fecha_expedicion", "tipo_identificacion")
        if pk_identificacion:
            datos_identificacion = {
                campo: form_data.get(campo)
                for campo in campos
                if UpdateUserDataService._has_key(form_data, campo)
            }
        else:
            # Creación: se requieren todos los campos (full_clean() valida lo faltante).
            datos_identificacion = {campo: form_data.get(campo) for campo in campos}

        _log_warn(f"Guardando datos de identificación: "
            f"numero={mask_pii(datos_identificacion.get('numero_identificacion'))}, "
            f"tipo={datos_identificacion.get('tipo_identificacion')}", level="info")

        try:
            identificacion_usuario = save_data(
                datos_identificacion, IdentificacionUsuario, pk_identificacion
            )
        except IntegrityError as e:
            _log_warn(f"IntegrityError al guardar identificación. "
                f"Número duplicado: {mask_pii(datos_identificacion.get('numero_identificacion'))}", level="error")
            raise ValidationError(
                message="El número de identificación ya está registrado",
                code="IDENTIFICATION_ALREADY_EXISTS",
                status_code=409,
            )
        except DjangoValidationError as e:
            _log_warn(f"DjangoValidationError al guardar identificación. "
                f"Número duplicado: {mask_pii(datos_identificacion.get('numero_identificacion'))}", level="error")
            raise ValidationError(
                message="El número de identificación ya está registrado",
                code="IDENTIFICATION_ALREADY_EXISTS",
                status_code=409,
            )

        return identificacion_usuario

    @staticmethod
    def save_name_data(
        form_data: Dict[str, Any], user_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de nombre del usuario

        Para actualizaciones (pk existente), solo persiste los campos que
        llegaron explícitamente en form_data — evita anular primer_nombre/
        primer_apellido (requeridos) cuando el caller solo quiere tocar otra
        sección del usuario.

        Args:
            form_data: Datos del formulario
            user_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de NombrePersonaUsuario guardada
        """
        pk_persona = user_pk_data.get("id_npersona") if user_pk_data else None

        campos = ("primer_nombre", "segundo_nombre", "primer_apellido", "segundo_apellido")
        if pk_persona:
            datos_persona = {
                campo: form_data.get(campo)
                for campo in campos
                if UpdateUserDataService._has_key(form_data, campo)
            }
        else:
            # Creación: se requieren primer_nombre/primer_apellido (full_clean() valida lo faltante).
            datos_persona = {campo: form_data.get(campo) for campo in campos}

        _log_warn(f"Guardando datos de persona: {datos_persona}", level="info")

        nombre_persona = save_data(
            datos_persona, NombrePersonaUsuario, pk_persona)

        return nombre_persona

    @staticmethod
    def save_basic_user_data(
        form_data: Dict[str, Any],
        identificacion_usuario: Any,
        nombre_persona: Any,
        basicos_usuario_id: Optional[str],
    ) -> Any:
        """
        Guarda datos básicos del usuario

        Para actualizaciones (basicos_usuario_id existente), sexo/género/
        orientación/gp_rh solo se tocan si llegaron explícitamente en
        form_data — evita anularlos cuando el caller solo quiere actualizar
        otra sección del usuario. isJuridico sigue forzándolos a None
        siempre que se envíe, sin importar si es creación o actualización.

        Args:
            form_data: Datos del formulario
            identificacion_usuario: Instancia de identificación
            nombre_persona: Instancia de nombre
            basicos_usuario_id: ID existente (si es actualización)

        Returns:
            Instancia de DatosBasicosUsuario guardada
        """

        is_juridico = form_data.get("isJuridico")

        datos_basicos = {
            "identificacion_usuario": identificacion_usuario,
            "nombre_persona": nombre_persona,
        }

        campos_persona = ("sexo_persona", "genero_persona", "orientacion_persona", "gp_rh")
        if is_juridico:
            for campo in campos_persona:
                datos_basicos[campo] = None
        elif basicos_usuario_id:
            for campo in campos_persona:
                if UpdateUserDataService._has_key(form_data, campo):
                    datos_basicos[campo] = form_data.get(campo)
        else:
            for campo in campos_persona:
                datos_basicos[campo] = form_data.get(campo)

        _log_warn(f"Guardando datos básicos: {datos_basicos}", level="info")

        pk_basicos = basicos_usuario_id if basicos_usuario_id else None
        basicos_usuario = save_data(
            datos_basicos, DatosBasicosUsuario, pk_basicos)

        return basicos_usuario

    @staticmethod
    def save_phone_data(
        form_data: Dict[str, Any], user_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de teléfono del usuario

        Para actualizaciones (pk existente), solo persiste los campos que
        llegaron explícitamente en form_data — evita anular celulares
        existentes cuando el caller solo quiere tocar otra sección del
        usuario (ej. solo el correo).

        Args:
            form_data: Datos del formulario
            user_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de TelefonoCelularContactoUsuario guardada
        """
        pk_telefono = user_pk_data.get(
            "id_ctelefono") if user_pk_data else None

        campos = ("celular_uno", "celular_dos", "celular_emergencia")
        if pk_telefono:
            datos_telefono = {
                campo: form_data.get(campo)
                for campo in campos
                if UpdateUserDataService._has_key(form_data, campo)
            }
        else:
            datos_telefono = {campo: form_data.get(campo) for campo in campos}

        _log_warn(f"Guardando datos de teléfono: {datos_telefono}", level="info")

        id_ctelefono = save_data(
            datos_telefono, TelefonoCelularContactoUsuario, pk_telefono
        )

        return id_ctelefono

    @staticmethod
    def save_email_data(
        form_data: Dict[str, Any], user_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de correo electrónico del usuario

        Para actualizaciones (pk existente), solo persiste correo_electronico
        si llegó explícitamente en form_data — evita anularlo (es un campo
        requerido, EmailField sin null/blank) cuando el caller solo quiere
        tocar otra sección del usuario.

        Args:
            form_data: Datos del formulario
            user_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de CorreoElectronicoContactoUsuario guardada
        """
        pk_correo = user_pk_data.get(
            "id_ccelectronico") if user_pk_data else None

        if pk_correo:
            datos_correo = (
                {"correo_electronico": form_data.get("correo_electronico")}
                if UpdateUserDataService._has_key(form_data, "correo_electronico")
                else {}
            )
        else:
            datos_correo = {"correo_electronico": form_data.get("correo_electronico")}

        _log_warn(f"Guardando datos de correo: {datos_correo}", level="info")

        id_ccelectronico = save_data(
            datos_correo, CorreoElectronicoContactoUsuario, pk_correo
        )

        return id_ccelectronico

    @staticmethod
    def save_contact_data(
        id_ctelefono: Any,
        id_ccelectronico: Any,
        basicos_usuario: Any,
        user_pk_data: Optional[Dict[str, Any]],
    ) -> None:
        """
        Guarda datos de contacto agregados

        Args:
            id_ctelefono: Instancia de teléfono
            id_ccelectronico: Instancia de correo
            basicos_usuario: Instancia de datos básicos
            user_pk_data: PKs existentes (si es actualización)
        """
        content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)

        datos_contacto = {
            "id_ctelefono": id_ctelefono,
            "id_ccelectronico": id_ccelectronico,
            "content_type": content_type,
            "object_id": basicos_usuario,
        }

        _log_warn(f"Guardando datos de contacto: {datos_contacto}", level="info")

        pk_contacto = user_pk_data.get("id_contacto") if user_pk_data else None
        save_data(datos_contacto, DatosContactoUsuario, pk_contacto)

    @staticmethod
    def save_location_data(
        form_data: Dict[str, Any],
        basicos_usuario: Any,
        user_pk_data: Optional[Dict[str, Any]],
    ) -> None:
        """
        Guarda datos de ubicación (general, urbana o rural)

        Args:
            form_data: Datos del formulario
            basicos_usuario: Instancia de datos básicos
            user_pk_data: PKs existentes (si es actualización)
        """
        content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)

        # Datos de ubicación general
        datos_ubicacion = {
            "pais": form_data.get("pais"),
            "departamento": form_data.get("departamento"),
            "municipio": form_data.get("municipio"),
            "zona": form_data.get("zona"),
            "content_type": content_type,
            "object_id": basicos_usuario,
        }

        _log_warn(f"Guardando datos de ubicación: {datos_ubicacion}", level="info")

        pk_ubicacion = user_pk_data.get(
            "id_ubicacion") if user_pk_data else None
        save_data(datos_ubicacion, DatosUbicacionUsuario, pk_ubicacion)

        # Datos específicos según zona
        zona = form_data.get("zona")

        if zona == "1":  # Urbana
            datos_ubicacion_urbana = {
                "nombre_barrio": form_data.get("nombre_barrio"),
                "tipo_viaprincipal": form_data.get("tipo_viaprincipal"),
                "numero_viaprincipal": form_data.get("numero_viaprincipal"),
                "letra_principal": form_data.get("letra_principal"),
                "es_bis": form_data.get("es_bis"),
                "cuadrante_principal": form_data.get("cuadrante_principal"),
                "numero_viasecundaria": form_data.get("numero_viasecundaria"),
                "letra_secundaria": form_data.get("letra_secundaria"),
                "cuadrante_secundario": form_data.get("cuadrante_secundario"),
                "numero_placa": form_data.get("numero_placa"),
                "complemento": form_data.get("complemento"),
            }

            _log_warn(f"Guardando ubicación urbana: {datos_ubicacion_urbana}", level="info")
            save_data(datos_ubicacion_urbana, UbicacionUrbana, pk_ubicacion)

        elif zona == "2":  # Rural
            datos_ubicacion_rural = {
                "corregimiento": form_data.get("corregimiento"),
                "centro_poblado": form_data.get("centro_poblado"),
                "vereda": form_data.get("vereda"),
            }

            _log_warn(f"Guardando ubicación rural: {datos_ubicacion_rural}", level="info")
            save_data(datos_ubicacion_rural, UbicacionRural, pk_ubicacion)

    @staticmethod
    def save_complementary_data(
        form_data: Dict[str, Any],
        basicos_usuario: Any,
        user_pk_data: Optional[Dict[str, Any]],
    ) -> Any:
        """
        Guarda datos complementarios del usuario

        Args:
            form_data: Datos del formulario
            basicos_usuario: Instancia de datos básicos
            user_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de DatosComplementariosUsuario guardada
        """
        _has_key = UpdateUserDataService._has_key

        def _normalize_fk(value: Any) -> Any:
            if value in ("", "null", "None"):
                return None
            return value

        # Si es beneficiario, tipo_vinculacion es 3
        tipo_vinculacion = (
            "3" if form_data.get("beneficiario") else form_data.get(
                "tipo_vinculacion")
        )

        # Para updates parciales, solo persistir campos enviados explícitamente.
        datos_complementarios = {"basicos_usuario": basicos_usuario}

        if _has_key(form_data, "estado_civil"):
            datos_complementarios["estado_civil"] = _normalize_fk(
                form_data.get("estado_civil")
            )
        if _has_key(form_data, "fondo_pensiones"):
            datos_complementarios["fondo_pensiones"] = _normalize_fk(
                form_data.get("fondo_pensiones")
            )
        if _has_key(form_data, "eps"):
            datos_complementarios["eps"] = _normalize_fk(form_data.get("eps"))
        if _has_key(form_data, "acepto_politicas"):
            datos_complementarios["acepto_politicas"] = form_data.get(
                "acepto_politicas"
            )

        # tipo_vinculacion se mantiene siempre que llegue en payload reducido
        if _has_key(form_data, "tipo_vinculacion") or UpdateUserDataService._is_truthy(
            form_data.get("beneficiario")
        ):
            tipo_vinculacion_normalizado = _normalize_fk(tipo_vinculacion)

            # Si el catálogo no tiene sembrado ese valor en este ambiente,
            # no bloquear el guardado por una clasificación accesoria: se
            # omite (queda null) y sigue el proceso (p.ej. registro ASP de
            # beneficiario/protección, que no depende de este campo).
            if (
                tipo_vinculacion_normalizado is not None
                and not TipoVinculacion.objects.filter(
                    id_tvinculacion=tipo_vinculacion_normalizado
                ).exists()
            ):
                _log_warn(
                    f"TipoVinculacion {tipo_vinculacion_normalizado} no existe en el "
                    "catálogo de este ambiente; se omite la clasificación de vínculo",
                    level="warning",
                )
                tipo_vinculacion_normalizado = None

            datos_complementarios["tipo_vinculacion"] = tipo_vinculacion_normalizado

        _log_warn(f"Guardando datos complementarios: {datos_complementarios}", level="info")

        pk_complementarios = user_pk_data.get(
            "id_cusuario") if user_pk_data else None
        complementario_usuario = save_data(
            datos_complementarios, DatosComplementariosUsuario, pk_complementarios
        )

        return complementario_usuario

    @staticmethod
    def save_contract_or_resolution(
        form_data: Dict[str, Any],
        complementario_usuario: Any,
        user_pk_data: Optional[Dict[str, Any]],
    ) -> None:
        """
        Guarda contrato o resolución según tipo de vinculación

        Args:
            form_data: Datos del formulario
            complementario_usuario: Instancia de datos complementarios
            user_pk_data: PKs existentes (si es actualización)
        """
        tipo_vinculacion = form_data.get("tipo_vinculacion")

        if tipo_vinculacion == 1:  # Contratista
            datos_complementarios_contrato = {
                "numero_contrato": form_data.get("numero_contrato"),
                "fecha_iniciocontrato": form_data.get("fecha_iniciocontrato"),
                "fecha_fincontrato": form_data.get("fecha_fincontrato"),
                "complementario_usuario": complementario_usuario,
            }

            _log_warn(f"Guardando datos de contrato: {datos_complementarios_contrato}", level="info")

            pk_contrato = user_pk_data.get(
                "id_contrato") if user_pk_data else None
            save_data(datos_complementarios_contrato,
                      ContratoContratista, pk_contrato)

        elif tipo_vinculacion == 2:  # Funcionario
            datos_complementarios_resolucion = {
                "numero_resolucion": form_data.get("numero_resolucion"),
                "complementario_usuario": complementario_usuario,
            }

            _log_warn(f"Guardando datos de resolución: {datos_complementarios_resolucion}", level="info")

            pk_resolucion = user_pk_data.get(
                "id_resolucion") if user_pk_data else None
            save_data(
                datos_complementarios_resolucion, ResolucionFuncionario, pk_resolucion
            )

    @staticmethod
    def _is_truthy(value: Any) -> bool:
        """Normaliza valores booleanos provenientes de payload web/mobile."""
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            return value == 1
        if isinstance(value, str):
            return value.strip().lower() in {"1", "true", "si", "sí", "yes", "on"}
        return False

    @staticmethod
    def _has_location_payload(form_data: Dict[str, Any]) -> bool:
        location_fields = (
            "pais",
            "departamento",
            "municipio",
            "zona",
            "direccion",
            "indicacion",
            "nombre_barrio",
            "tipo_viaprincipal",
            "numero_viaprincipal",
            "letra_principal",
            "es_bis",
            "cuadrante_principal",
            "numero_viasecundaria",
            "letra_secundaria",
            "cuadrante_secundario",
            "numero_placa",
            "complemento",
            "corregimiento",
            "centro_poblado",
            "vereda",
        )
        return any(form_data.get(field) not in (None, "") for field in location_fields)

    @staticmethod
    def _has_complementary_payload(form_data: Dict[str, Any]) -> bool:
        complementary_fields = (
            "estado_civil",
            "fondo_pensiones",
            "eps",
            "tipo_vinculacion",
            "acepto_politicas",
            "beneficiario",
        )
        return any(form_data.get(field) not in (None, "") for field in complementary_fields)

    @staticmethod
    def _has_contract_or_resolution_payload(form_data: Dict[str, Any]) -> bool:
        contract_or_resolution_fields = (
            "numero_contrato",
            "fecha_iniciocontrato",
            "fecha_fincontrato",
            "numero_resolucion",
            "numero_resolucion_beneficiario",
            "fecha_resolucion_beneficiario",
        )
        return any(
            form_data.get(field) not in (None, "") for field in contract_or_resolution_fields
        )

    @staticmethod
    def process_proteccion(
        form_data: Dict[str, Any],
        username: str,
        basicos_usuario: Any,
        user_instance: User,
    ) -> None:
        """
        Procesa registro de persona con protección (tipo_vinculacion == 4) en ASP.
        Solo HTTP 201 crea perfil 3098; cualquier otro resultado lanza ValidationError.

        Args:
            form_data: Datos del formulario
            username: Username del usuario
            basicos_usuario: Instancia de datos básicos
            user_instance: Instancia de User

        Raises:
            ValidationError: Si ASP rechaza el registro o hay error de conexión
        """
        headers = {
            "x-api-key": config("API_KEY_ASP"), "Referer": config("API_REFERER")}

        data_payload = {
            "cedula_pdp": form_data.get("numero_identificacion"),
            "username": username,
        }

        _log_warn(f"Payload insert protección: {data_payload}", level="info")

        try:
            proteccion_insert_resp = requests.post(
                config("SP_REGISTRO_PDP"),
                headers=headers,
                data=data_payload,
                timeout=5,
            )
        except requests.exceptions.RequestException as e:
            _log_warn(f"Error en llamada a API de protección: {e}", level="warning", exc_info=True)
            raise ValidationError(
                message="No se pudo conectar con el servicio de registro de protección",
                code="PROTECCION_API_ERROR",
                details={"error": str(e)},
            ) from e

        handle_proteccion_api_response(
            proteccion_insert_resp, basicos_usuario, user_instance
        )

    @staticmethod
    def process_beneficiario(
        form_data: Dict[str, Any],
        username: str,
        basicos_usuario: Any,
        user_instance: User,
    ) -> None:
        """
        Procesa registro de beneficiario en ASP.
        Solo HTTP 201 crea perfil 3099; cualquier otro resultado lanza ValidationError.

        Args:
            form_data: Datos del formulario
            username: Username del usuario
            basicos_usuario: Instancia de datos básicos
            user_instance: Instancia de User

        Raises:
            ValidationError: Si ASP rechaza el registro o hay error de conexión
        """
        headers = {
            "x-api-key": config("API_KEY_ASP"), "Referer": config("API_REFERER")}

        data_payload = {
            "fecha_acto": form_data.get("fecha_resolucion_beneficiario"),
            "numero_acto": form_data.get("numero_resolucion_beneficiario"),
            "celular": form_data.get("celular_uno"),
            "correo": form_data.get("correo_electronico"),
            "not_correo": (
                True if form_data.get("correo_electronico") else False
            ),
            "username": username,
            "cedula_beneficiario": form_data.get("numero_identificacion"),
        }

        _log_warn(f"Payload insert beneficiario: {data_payload}", level="info")

        try:
            beneficiario_insert_resp = requests.post(
                config("SP_REGISTRO_BENEFICIARIO"),
                headers=headers,
                data=data_payload,
                timeout=5,
            )
        except requests.exceptions.RequestException as e:
            _log_warn(f"Error en llamada a API de beneficiario: {e}", level="warning", exc_info=True)
            raise ValidationError(
                message="No se pudo conectar con el servicio de registro de beneficiario",
                code="BENEFICIARIO_API_ERROR",
                details={"error": str(e)},
            ) from e

        handle_beneficiario_api_response(
            beneficiario_insert_resp, basicos_usuario, user_instance
        )

    @staticmethod
    def cleanup_duplicate_default_profiles(user_instance: User) -> int:
        """
        Limpia perfiles por defecto duplicados, dejando solo el más reciente

        Args:
            user_instance: Instancia de User

        Returns:
            Cantidad de perfiles duplicados eliminados
        """
        # Obtener todos los perfiles por defecto del usuario
        default_profiles = PerfilUsuario.objects.filter(
            user=user_instance, dependencia=9999, grupo=9999, rol=9999
        ).order_by("-id_pusuario")  # Ordenar por ID descendente (más reciente primero)

        count = default_profiles.count()

        if count <= 1:
            # No hay duplicados
            return 0

        # Mantener el primero (más reciente) y eliminar el resto
        profiles_to_delete = list(default_profiles)[
            1:]  # Todos excepto el primero
        deleted_count = len(profiles_to_delete)

        for profile in profiles_to_delete:
            _log_warn(f"Eliminando perfil por defecto duplicado "
                f"(ID: {profile.id_pusuario}) para usuario {user_instance.username}", level="info")
            profile.delete()

        _log_warn(f"Limpiados {deleted_count} perfiles por defecto duplicados "
            f"para usuario {user_instance.username}", level="info")

        return deleted_count

    @staticmethod
    def create_default_profile(basicos_usuario: Any, user_instance: User) -> None:
        """
        Crea el perfil por defecto del usuario si no existe
        Evita duplicación verificando si ya existe un perfil por defecto

        Args:
            basicos_usuario: Instancia de datos básicos
            user_instance: Instancia de User
        """
        # Primero limpiar duplicados existentes (por si acaso)
        # UpdateUserDataService.cleanup_duplicate_default_profiles(user_instance)

        # Si ya existe uno activo, no crear ni modificar
        active_default_profile = PerfilUsuario.objects.filter(
            user=user_instance,
            dependencia=9999,
            grupo=9999,
            rol=9999,
            activo=True,
        ).first()
        if active_default_profile:
            _log_warn(f"Perfil por defecto activo ya existe para usuario {user_instance.username} "
                f"(ID: {active_default_profile.id_pusuario}), omitiendo creación", level="info")
            return

        # Si existe uno inactivo, reactivarlo para evitar usuario sin perfiles activos
        inactive_default_profile = (
            PerfilUsuario.objects.filter(
                user=user_instance,
                dependencia=9999,
                grupo=9999,
                rol=9999,
                activo=False,
            )
            .order_by("-fecha_actualizacion", "-id_pusuario")
            .first()
        )

        if inactive_default_profile:
            inactive_default_profile.activo = True
            if basicos_usuario:
                inactive_default_profile.basicos_usuario = basicos_usuario
            inactive_default_profile.fecha_actualizacion = timezone.now().date()
            inactive_default_profile.save(
                update_fields=["activo", "basicos_usuario", "fecha_actualizacion"]
            )
            _log_warn(f"Perfil por defecto inactivo reactivado para usuario {user_instance.username} "
                f"(ID: {inactive_default_profile.id_pusuario})", level="info")
            return

        # Si no existe ninguno, crear nuevo perfil por defecto
        ecosistemito_instance = DatosBasicosUsuario.objects.get(
            id_busuario="9fcb9766-dbf7-43ac-a985-03979e1aeaec"
        )

        datos_perfil = {
            "dependencia": 9999,
            "grupo": 9999,
            "rol": 9999,
            "basicos_usuario": basicos_usuario,
            "user": user_instance.id,
            "activo": True,
            # "asignador": ecosistemito_instance,
        }

        _log_warn(f"Creando perfil por defecto para usuario {user_instance.username}", level="info")
        save_data(datos_perfil, PerfilUsuario)

    @classmethod
    def update_user_data(cls, form_data: Dict[str, Any], is_mobile: bool) -> None:
        """
        Proceso completo de actualización de datos de usuario
        Maneja todas las entidades relacionadas en una transacción atómica

        Args:
            form_data: Datos del formulario
            is_mobile: Si la petición viene de móvil

        Raises:
            UserNotFoundError: Si el usuario no existe
            ValidationError: Si hay errores de validación
            Exception: Si hay errores en el proceso de guardado
        """
        # 1. Extraer username
        username = cls.extract_username(form_data, is_mobile)

        # 2. Obtener usuario
        user_instance = cls.get_user(username)

        # 3. Obtener PKs existentes si es actualización.
        # Si el frontend no envió basicos_usuario, intentar obtenerlo
        # del perfil existente del usuario para evitar crear duplicados.
        basicos_usuario_id = form_data.get("basicos_usuario")
        if not basicos_usuario_id:
            # Intento 1: Buscar a través de PerfilUsuario (activo o inactivo)
            existing_profile = (
                PerfilUsuario.objects
                .filter(user=user_instance, basicos_usuario__isnull=False)
                .select_related('basicos_usuario')
                .first()
            )
            if existing_profile and existing_profile.basicos_usuario:
                basicos_usuario_id = str(existing_profile.basicos_usuario.id_busuario)
                _log_warn(f"basicos_usuario_id inferido del perfil existente: "
                    f"{basicos_usuario_id}", level="info")

        if not basicos_usuario_id:
            # Intento 2: Buscar DatosBasicosUsuario a través del número de
            # identificación enviado en el formulario (para usuarios que ya
            # tienen datos pero no tienen PerfilUsuario activo).
            numero_identificacion = form_data.get("numero_identificacion")
            if numero_identificacion:
                try:
                    identificacion = IdentificacionUsuario.objects.filter(
                        numero_identificacion=numero_identificacion
                    ).first()
                    if identificacion:
                        basicos = DatosBasicosUsuario.objects.filter(
                            identificacion_usuario=identificacion
                        ).first()
                        if basicos:
                            basicos_usuario_id = str(basicos.id_busuario)
                            _log_warn(f"basicos_usuario_id inferido por número de "
                                f"identificación '{numero_identificacion}': "
                                f"{basicos_usuario_id}", level="info")
                except Exception as e:
                    _log_warn(f"Error al buscar DatosBasicosUsuario por identificación: {e}", level="warning")

        user_pk_data = cls.get_existing_pks(basicos_usuario_id)

        # 4. Procesar toda la actualización en una transacción
        with transaction.atomic():
            # Grupo 1: Identificación y Nombre
            identificacion_usuario = cls.save_identification_data(
                form_data, user_pk_data
            )
            nombre_persona = cls.save_name_data(form_data, user_pk_data)

            # Grupo 2: Datos Básicos
            basicos_usuario = cls.save_basic_user_data(
                form_data, identificacion_usuario, nombre_persona, basicos_usuario_id
            )

            # Grupo 3: Contacto
            id_ctelefono = cls.save_phone_data(form_data, user_pk_data)
            id_ccelectronico = cls.save_email_data(form_data, user_pk_data)
            cls.save_contact_data(
                id_ctelefono, id_ccelectronico, basicos_usuario, user_pk_data
            )

            # Grupo 4: Ubicación
            if cls._has_location_payload(form_data):
                cls.save_location_data(form_data, basicos_usuario, user_pk_data)

            # Grupo 5: Datos Complementarios
            complementario_usuario = None
            if cls._has_complementary_payload(form_data):
                complementario_usuario = cls.save_complementary_data(
                    form_data, basicos_usuario, user_pk_data
                )

            # Grupo 6: Contrato o Resolución
            if (
                complementario_usuario is not None
                and cls._has_contract_or_resolution_payload(form_data)
            ):
                cls.save_contract_or_resolution(
                    form_data, complementario_usuario, user_pk_data
                )

            # Grupo 7: Procesos especiales según tipo de vinculación
            tipo_vinculacion = form_data.get("tipo_vinculacion")

            if tipo_vinculacion == 4:  # Protección
                cls.process_proteccion(
                    form_data, username, basicos_usuario, user_instance
                )

            # Grupo 8: Beneficiario
            if cls._is_truthy(form_data.get("beneficiario")):
                cls.process_beneficiario(
                    form_data, username, basicos_usuario, user_instance
                )

            # Grupo 9: Perfil por defecto
            cls.create_default_profile(basicos_usuario, user_instance)

        _log_warn(f"Datos de usuario actualizados exitosamente: {username}", level="info")
