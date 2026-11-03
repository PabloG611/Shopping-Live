"""
Servicio para actualización de datos de colectivos y representantes
Maneja la creación/actualización completa de información del colectivo
"""

import requests
from typing import Dict, Any, Optional
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from django.db import transaction, IntegrityError
from django.core.exceptions import ValidationError as DjangoValidationError
from decouple import config
from custom_auth.exceptions import ValidationError, UserNotFoundError
from users.models.models_global import (
    DatosBasicosUsuario,
    DatosRepresentate,
    DatosColectivos,
    DatosIdentificacionColectivo,
    IdentificacionUsuario,
    NombrePersonaUsuario,
    TelefonoCelularContactoUsuario,
    CorreoElectronicoContactoUsuario,
    DatosContactoUsuario,
    DatosUbicacionUsuario,
    UbicacionUrbana,
    UbicacionRural,
    PerfilUsuario,
)
from utils.save_data import save_data
from users.services.beneficiario_profile_helpers import handle_beneficiario_api_response
from utils.logger_generico import _log_warn

class UpdateColectivoDataService:
    """
    Servicio para actualización completa de datos de colectivos y representantes
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
    def get_existing_basicos_pks(basicos_usuario_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Obtiene las PKs existentes de DatosBasicosUsuario si ya tiene datos

        Args:
            basicos_usuario_id: ID de datos básicos del colectivo

        Returns:
            Diccionario con PKs existentes o None
        """
        if not basicos_usuario_id:
            return None

        try:
            from users.serializer.serializer_get import ApiGetPKUser
            datos_basicos_instance = DatosBasicosUsuario.objects.get(
                id_busuario=basicos_usuario_id
            )
            user_pk_data = ApiGetPKUser(datos_basicos_instance).data
            _log_warn(f"PKs existentes de basicos_usuario obtenidos: {user_pk_data}", level="info")
            return user_pk_data
        except DatosBasicosUsuario.DoesNotExist:
            _log_warn(f"DatosBasicosUsuario con ID {basicos_usuario_id} no encontrado", level="warning")
            return None

    @staticmethod
    def get_existing_representante_pks(representante_id: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Obtiene las PKs existentes del representante si ya tiene datos

        Args:
            representante_id: ID del representante

        Returns:
            Diccionario con PKs existentes o None
        """
        if not representante_id:
            return None

        try:
            representante_instance = DatosRepresentate.objects.get(
                id_representante=representante_id
            )

            # Construir diccionario de PKs manualmente
            pks = {
                'id_representante': str(representante_instance.id_representante),
                'id_iusuario': str(representante_instance.identificacion_representante.id_iusuario) if representante_instance.identificacion_representante else None,
                'id_npersona': str(representante_instance.nombre_representante.id_npersona) if representante_instance.nombre_representante else None,
            }

            # Obtener PKs de contacto
            content_type = ContentType.objects.get_for_model(DatosRepresentate)
            contacto = DatosContactoUsuario.objects.filter(
                content_type=content_type,
                object_id=str(representante_instance.id_representante)
            ).last()

            if contacto:
                pks['id_contacto'] = str(contacto.id_contacto)
                pks['id_ctelefono'] = str(
                    contacto.id_ctelefono.id_ctelefono) if contacto.id_ctelefono else None
                pks['id_ccelectronico'] = str(
                    contacto.id_ccelectronico.id_ccelectronico) if contacto.id_ccelectronico else None

            # Obtener PKs de ubicación
            ubicacion = DatosUbicacionUsuario.objects.filter(
                content_type=content_type,
                object_id=str(representante_instance.id_representante)
            ).last()

            if ubicacion:
                pks['id_ubicacion'] = str(ubicacion.id_ubicacion)

            _log_warn(f"PKs existentes del representante obtenidos: {pks}", level="info")
            return pks

        except DatosRepresentate.DoesNotExist:
            _log_warn(f"DatosRepresentate con ID {representante_id} no encontrado", level="warning")
            return None

    @staticmethod
    def save_identification_data(
        form_data: Dict[str, Any], representante_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de identificación del representante

        Args:
            form_data: Datos del formulario
            representante_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de IdentificacionUsuario guardada

        Raises:
            ValidationError: Si el número de identificación ya existe
        """
        datos_identificacion = {
            "numero_identificacion": form_data.get("numero_identificacion_representante"),
            "fecha_expedicion": form_data.get("fecha_expedicion_representante"),
            "tipo_identificacion": form_data.get("tipo_identificacion_representante"),
        }

        _log_warn(f"Guardando datos de identificación del representante: {datos_identificacion}", level="info")

        pk_identificacion = representante_pk_data.get(
            "id_iusuario") if representante_pk_data else None

        try:
            identificacion_representante = save_data(
                datos_identificacion, IdentificacionUsuario, pk_identificacion
            )
        except IntegrityError as e:
            _log_warn(f"IntegrityError al guardar identificación del representante: {str(e)}. "
                f"Número de identificación duplicado: {datos_identificacion.get('numero_identificacion')}", level="error")
            raise ValidationError(
                message="El número de identificación del representante ya está registrado",
                code="IDENTIFICATION_ALREADY_EXISTS",
                status_code=409,
            )
        except DjangoValidationError as e:
            _log_warn(f"DjangoValidationError al guardar identificación del representante: {str(e)}. "
                f"Número de identificación duplicado: {datos_identificacion.get('numero_identificacion')}", level="error")
            raise ValidationError(
                message="El número de identificación del representante ya está registrado",
                code="IDENTIFICATION_ALREADY_EXISTS",
                status_code=409,
            )

        return identificacion_representante

    @staticmethod
    def save_name_data(
        form_data: Dict[str, Any], representante_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de nombre del representante

        Args:
            form_data: Datos del formulario
            representante_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de NombrePersonaUsuario guardada
        """
        datos_persona = {
            "primer_nombre": form_data.get("primer_nombre_representante"),
            "segundo_nombre": form_data.get("segundo_nombre_representante"),
            "primer_apellido": form_data.get("primer_apellido_representante"),
            "segundo_apellido": form_data.get("segundo_apellido_representante"),
        }

        _log_warn(f"Guardando datos de persona del representante: {datos_persona}", level="info")

        pk_persona = representante_pk_data.get(
            "id_npersona") if representante_pk_data else None
        nombre_persona = save_data(
            datos_persona, NombrePersonaUsuario, pk_persona)

        return nombre_persona

    @staticmethod
    def save_basic_user_data(
        identificacion_usuario: Any,
        nombre_persona: Any,
        basicos_usuario_id: Optional[str],
    ) -> Any:
        """
        Guarda datos básicos del colectivo (tratado como persona jurídica)

        Args:
            identificacion_usuario: PK de IdentificacionUsuario del representante
            nombre_persona: PK de NombrePersonaUsuario del representante
            basicos_usuario_id: ID existente (si es actualización)

        Returns:
            PK de DatosBasicosUsuario guardado
        """
        datos_basicos = {
            "sexo_persona": None,
            "genero_persona": None,
            "orientacion_persona": None,
            "gp_rh": None,
            "identificacion_usuario": identificacion_usuario,
            "nombre_persona": nombre_persona,
        }

        _log_warn(f"Guardando datos básicos del colectivo: {datos_basicos}", level="info")

        pk_basicos = basicos_usuario_id if basicos_usuario_id else None
        return save_data(datos_basicos, DatosBasicosUsuario, pk_basicos)

    @staticmethod
    def save_representante_data(
        identificacion_representante: Any,
        nombre_representante: Any,
        representante_id: Optional[str],
    ) -> Any:
        """
        Guarda datos del representante

        Args:
            identificacion_representante: Instancia de identificación
            nombre_representante: Instancia de nombre
            representante_id: ID existente (si es actualización)

        Returns:
            Instancia de DatosRepresentate guardada
        """
        datos_representante = {
            "identificacion_representante": identificacion_representante,
            "nombre_representante": nombre_representante,
        }

        _log_warn(f"Guardando datos del representante: {datos_representante}", level="info")

        pk_representante = representante_id if representante_id else None
        representante = save_data(
            datos_representante, DatosRepresentate, pk_representante)

        return representante

    @staticmethod
    def save_phone_data(
        form_data: Dict[str, Any], representante_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de teléfono del representante

        Args:
            form_data: Datos del formulario
            representante_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de TelefonoCelularContactoUsuario guardada
        """
        datos_telefono = {
            "celular_uno": form_data.get("celular_uno_representante"),
            "celular_dos": form_data.get("celular_dos_representante"),
            "celular_emergencia": form_data.get("celular_emergencia_representante"),
        }

        _log_warn(f"Guardando datos de teléfono del representante: {datos_telefono}", level="info")

        pk_telefono = representante_pk_data.get(
            "id_ctelefono") if representante_pk_data else None
        id_ctelefono = save_data(
            datos_telefono, TelefonoCelularContactoUsuario, pk_telefono
        )

        return id_ctelefono

    @staticmethod
    def save_email_data(
        form_data: Dict[str, Any], representante_pk_data: Optional[Dict[str, Any]]
    ) -> Any:
        """
        Guarda datos de correo electrónico del representante

        Args:
            form_data: Datos del formulario
            representante_pk_data: PKs existentes (si es actualización)

        Returns:
            Instancia de CorreoElectronicoContactoUsuario guardada
        """
        datos_correo = {
            "correo_electronico": form_data.get("correo_electronico_representante"),
        }

        _log_warn(f"Guardando datos de correo del representante: {datos_correo}", level="info")

        pk_correo = representante_pk_data.get(
            "id_ccelectronico") if representante_pk_data else None
        id_ccelectronico = save_data(
            datos_correo, CorreoElectronicoContactoUsuario, pk_correo
        )

        return id_ccelectronico

    @staticmethod
    def save_contact_data(
        id_ctelefono: Any,
        id_ccelectronico: Any,
        representante: Any,
        representante_pk_data: Optional[Dict[str, Any]],
    ) -> None:
        """
        Guarda datos de contacto agregados del representante

        Args:
            id_ctelefono: Instancia de teléfono
            id_ccelectronico: Instancia de correo
            representante: Instancia de DatosRepresentate
            representante_pk_data: PKs existentes (si es actualización)
        """
        content_type = ContentType.objects.get_for_model(DatosRepresentate)

        datos_contacto = {
            "id_ctelefono": id_ctelefono,
            "id_ccelectronico": id_ccelectronico,
            "content_type": content_type,
            "object_id": representante,
        }

        _log_warn(f"Guardando datos de contacto del representante: {datos_contacto}", level="info")

        pk_contacto = representante_pk_data.get(
            "id_contacto") if representante_pk_data else None
        save_data(datos_contacto, DatosContactoUsuario, pk_contacto)

    @staticmethod
    def _has_location_payload(form_data: Dict[str, Any]) -> bool:
        """True si el payload incluye al menos un campo de ubicación del representante."""
        location_fields = (
            "pais_representante",
            "departamento_representante",
            "municipio_representante",
            "zona_representante",
            "nombre_barrio_representante",
            "tipo_viaprincipal_representante",
            "numero_viaprincipal_representante",
            "letra_principal_representante",
            "es_bis_representante",
            "cuadrante_principal_representante",
            "numero_viasecundaria_representante",
            "letra_secundaria_representante",
            "cuadrante_secundario_representante",
            "numero_placa_representante",
            "complemento_representante",
            "corregimiento_representante",
            "centro_poblado_representante",
            "vereda_representante",
        )
        return any(
            form_data.get(field) not in (None, "") for field in location_fields
        )

    @staticmethod
    def save_location_data(
        form_data: Dict[str, Any],
        representante: Any,
        representante_pk_data: Optional[Dict[str, Any]],
    ) -> None:
        """
        Guarda datos de ubicación (general, urbana o rural) del representante

        Args:
            form_data: Datos del formulario
            representante: Instancia de DatosRepresentate
            representante_pk_data: PKs existentes (si es actualización)
        """
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        pk_ubicacion = representante_pk_data.get(
            "id_ubicacion") if representante_pk_data else None

        # Datos de ubicación general
        datos_ubicacion = {
            "pais": form_data.get("pais_representante"),
            "departamento": form_data.get("departamento_representante"),
            "municipio": form_data.get("municipio_representante"),
            "zona": form_data.get("zona_representante"),
            "content_type": content_type,
            "object_id": representante,
        }

        # Datos específicos según zona
        zona = form_data.get("zona_representante")

        if str(zona) == "1":  # Urbana
            datos_ubicacion_urbana = {
                "nombre_barrio": form_data.get("nombre_barrio_representante"),
                "tipo_viaprincipal": form_data.get("tipo_viaprincipal_representante"),
                "numero_viaprincipal": form_data.get("numero_viaprincipal_representante"),
                "letra_principal": form_data.get("letra_principal_representante"),
                "es_bis": form_data.get("es_bis_representante"),
                "cuadrante_principal": form_data.get("cuadrante_principal_representante"),
                "numero_viasecundaria": form_data.get("numero_viasecundaria_representante"),
                "letra_secundaria": form_data.get("letra_secundaria_representante"),
                "cuadrante_secundario": form_data.get("cuadrante_secundario_representante"),
                "numero_placa": form_data.get("numero_placa_representante"),
                "complemento": form_data.get("complemento_representante"),
            }
            datos_ubicacion.update(datos_ubicacion_urbana)
            _log_warn(f"Guardando ubicación urbana del representante: {datos_ubicacion}", level="info")
            save_data(datos_ubicacion, UbicacionUrbana, pk_ubicacion)

        elif str(zona) == "2":  # Rural
            datos_ubicacion_rural = {
                "corregimiento": form_data.get("corregimiento_representante"),
                "centro_poblado": form_data.get("centro_poblado_representante"),
                "vereda": form_data.get("vereda_representante"),
            }
            datos_ubicacion.update(datos_ubicacion_rural)
            _log_warn(f"Guardando ubicación rural del representante: {datos_ubicacion}", level="info")
            save_data(datos_ubicacion, UbicacionRural, pk_ubicacion)

        else:
            _log_warn(f"Guardando datos de ubicación del representante: {datos_ubicacion}", level="info")
            save_data(datos_ubicacion, DatosUbicacionUsuario, pk_ubicacion)

    @staticmethod
    def save_colectivo_data(
        form_data: Dict[str, Any],
        colectivo_id: Optional[str],
        identificacion_colectivo_id: Optional[str],
        user_instance: User,
        representante: Any,
    ) -> Any:
        """
        Guarda datos del colectivo

        Args:
            form_data: Datos del formulario
            colectivo_id: ID existente (si es actualización)
            identificacion_colectivo_id: ID existente (si es actualización)

        Returns:
            Instancia de DatosColectivos guardada
        """
        datos_colectivo = {
            "user": user_instance,
            "representante": representante,
            "nombre_colectivo": form_data.get("nombre_colectivo"),
            "resolucion": form_data.get("resolucion_colectivo"),
            "fecha_resaolucion": form_data.get("fecha_resolucion_colectivo"),
        }

        _log_warn(f"Guardando datos del colectivo: {datos_colectivo}", level="info")

        pk_colectivo = colectivo_id if colectivo_id else None
        colectivo = save_data(datos_colectivo, DatosColectivos, pk_colectivo)

        datos_identificacion_colectivo = {
            "numero_identificacion": form_data.get("numero_identificacion_colectivo"),
            "tipo_identificacion": form_data.get("tipo_identificacion_colectivo"),
            "colectivo": colectivo,
        }

        pk_identificacion_colectivo = identificacion_colectivo_id if identificacion_colectivo_id else None

        save_data(datos_identificacion_colectivo,
                  DatosIdentificacionColectivo, pk_identificacion_colectivo)

        _log_warn(f"Datos del colectivo guardados: {colectivo}", level="info")

        return colectivo

    @staticmethod
    def process_beneficiario_colectivo(
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
            "fecha_acto": form_data.get("fecha_resolucion_colectivo"),
            "numero_acto": form_data.get("resolucion_colectivo"),
            "celular": form_data.get("celular_uno_representante"),
            "correo": form_data.get("correo_electronico_representante"),
            "not_correo": (
                True if form_data.get(
                    "correo_electronico_representante") else False
            ),
            "username": username,
            "cedula_beneficiario": form_data.get("numero_identificacion_colectivo"),
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

        # Verificar si ya existe un perfil por defecto para este usuario
        existing_default_profile = PerfilUsuario.objects.filter(
            user=user_instance, dependencia=9999, grupo=9999, rol=9999
        ).first()

        if existing_default_profile:
            _log_warn(f"Perfil por defecto ya existe para usuario {user_instance.username} "
                f"(ID: {existing_default_profile.id_pusuario}), omitiendo creación", level="info")
            return

        # Si no existe, crear nuevo perfil por defecto
        ecosistemito_instance = DatosBasicosUsuario.objects.get(
            id_busuario="9fcb9766-dbf7-43ac-a985-03979e1aeaec"
        )

        datos_perfil = {
            "dependencia": 9999,
            "grupo": 9999,
            "rol": 9999,
            "basicos_usuario": basicos_usuario if basicos_usuario else ecosistemito_instance,
            "user": user_instance.id,
            "activo": True,
            "asignador": ecosistemito_instance,
        }

        _log_warn(f"Creando perfil por defecto para usuario {user_instance.username}", level="info")
        save_data(datos_perfil, PerfilUsuario)

    @classmethod
    def update_colectivo_data(cls, form_data: Dict[str, Any], is_mobile: bool) -> Dict[str, Any]:
        """
        Proceso completo de actualización de datos del colectivo y representante
        Maneja todas las entidades relacionadas en una transacción atómica

        Args:
            form_data: Datos del formulario
            is_mobile: Si la petición viene de móvil

        Returns:
            Diccionario con los IDs del representante y colectivo creados/actualizados

        Raises:
            UserNotFoundError: Si el usuario no existe
            ValidationError: Si hay errores de validación
            Exception: Si hay errores en el proceso de guardado
        """
        # 1. Extraer username
        username = cls.extract_username(form_data, is_mobile)

        # 2. Obtener usuario
        user_instance = cls.get_user(username)

        # 3. Obtener PKs existentes si es actualización
        representante_id = form_data.get("id_representante")
        representante_pk_data = cls.get_existing_representante_pks(
            representante_id)

        colectivo_id = form_data.get("id_colectivo")
        identificacion_colectivo_id = form_data.get(
            "id_identificacion_colectivo")

        # Resolver basicos_usuario_id desde el formulario o el perfil existente
        basicos_usuario_id = form_data.get("basicos_usuario")
        if not basicos_usuario_id:
            existing_profile = (
                PerfilUsuario.objects
                .filter(user=user_instance, basicos_usuario__isnull=False)
                .select_related('basicos_usuario')
                .first()
            )
            if existing_profile and existing_profile.basicos_usuario:
                basicos_usuario_id = str(existing_profile.basicos_usuario.id_busuario)
                _log_warn(f"basicos_usuario_id inferido del perfil existente: {basicos_usuario_id}", level="info")

        # 4. Procesar toda la actualización en una transacción
        with transaction.atomic():
            # Grupo 1: Identificación y Nombre del representante
            identificacion_representante = cls.save_identification_data(
                form_data, representante_pk_data
            )
            nombre_representante = cls.save_name_data(
                form_data, representante_pk_data)

            # Grupo 2: Datos Básicos del colectivo
            basicos_usuario = cls.save_basic_user_data(
                identificacion_representante, nombre_representante, basicos_usuario_id
            )

            # Grupo 3: Datos del Representante
            representante = cls.save_representante_data(
                identificacion_representante, nombre_representante, representante_id
            )

            # Grupo 4: Contacto del representante
            id_ctelefono = cls.save_phone_data(
                form_data, representante_pk_data)
            id_ccelectronico = cls.save_email_data(
                form_data, representante_pk_data)
            cls.save_contact_data(
                id_ctelefono, id_ccelectronico, representante, representante_pk_data
            )

            # Grupo 5: Ubicación del representante (solo si viene en el payload)
            if cls._has_location_payload(form_data):
                cls.save_location_data(
                    form_data, representante, representante_pk_data
                )

            # Grupo 6: Datos del Colectivo
            colectivo = cls.save_colectivo_data(
                form_data,
                colectivo_id,
                identificacion_colectivo_id,
                user_instance,
                representante,
            )

            # Grupo 7: Beneficiario
            cls.process_beneficiario_colectivo(
                form_data, username, basicos_usuario, user_instance
            )

            # Grupo 8: Perfil por defecto
            cls.create_default_profile(basicos_usuario, user_instance)

        _log_warn(f"Datos del colectivo y representante actualizados exitosamente para usuario: {username}", level="info")

        return {
            "id_representante": str(representante),
            "id_colectivo": str(colectivo),
            "username": username
        }
