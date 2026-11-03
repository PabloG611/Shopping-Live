from rest_framework import serializers
from users.models.models_static import *
from users.models.models_global import *
from custom_auth.models.models_global import *

class UUIDStringField(serializers.UUIDField):
    def to_representation(self, value):
        return str(value)


# Helpers de caché por-instancia: los serializers de PK/datos básicos consultan
# las mismas relaciones (complementario, contacto, ubicación) desde varios
# métodos. Se cachea el resultado en el propio objeto para hacer UNA sola
# consulta por relación en lugar de una por campo.

def _cached_complemento(obj):
    if not hasattr(obj, '_cache_complemento'):
        obj._cache_complemento = DatosComplementariosUsuario.objects.filter(
            basicos_usuario=obj
        ).last()
    return obj._cache_complemento


def _cached_contacto_generic(obj):
    if not hasattr(obj, '_cache_contacto_generic'):
        content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)
        obj._cache_contacto_generic = DatosContactoUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_busuario)
        ).last()
    return obj._cache_contacto_generic


def _cached_ubicacion_generic(obj):
    if not hasattr(obj, '_cache_ubicacion_generic'):
        content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)
        obj._cache_ubicacion_generic = DatosUbicacionUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_busuario)
        ).last()
    return obj._cache_ubicacion_generic

# MSIS'numero' => (Modelos de la aplicación 'sistema')  + Número del modelo


# SERIALIZAORES DE LAS TABLAS ESTÁTICAS
 
#1 MSIS'6'
class ApiPais(serializers.ModelSerializer):         
    class Meta:
        model = Pais                      
        fields = '__all__'                         
        read_only_fields = ('__all__',)             

#2 MSIS'7'
class ApiDepartamento(serializers.ModelSerializer):
    class Meta:
        model = Departamento
        fields = '__all__'
        read_only_fields = ('__all__',)

#3 MSIS'8'
class ApiMunicipio(serializers.ModelSerializer):
    class Meta:
        model = Municipio
        fields = '__all__'
        read_only_fields = ('__all__',)

#4 MSIS'9'
class ApiZona(serializers.ModelSerializer):
    class Meta:
        model = ZonaUbicacion
        fields = '__all__'
        read_only_fields = ('__all__',)

#5 MSIS'10'
class ApiTipoIdentificacion(serializers.ModelSerializer):
    class Meta:
        model = TipoIdentificacion
        fields = '__all__'
        read_only_fields = ('__all__',)

#6 MSIS'11'
class ApiTipoGenero(serializers.ModelSerializer):
    class Meta:
        model = TipoGenero
        fields = '__all__'
        read_only_fields = ('__all__',)

#7 MSIS'12'
class ApiEstadoCivil(serializers.ModelSerializer):
    class Meta:
        model = EstadoCivil
        fields = '__all__'
        read_only_fields = ('__all__',)

#8 MSIS'13'
class ApiGpRh(serializers.ModelSerializer):
    class Meta:
        model = GpRh
        fields = '__all__'
        read_only_fields = ('__all__',)

#9 MSIS'14'
class ApiFondoPensiones(serializers.ModelSerializer):
    class Meta:
        model = FondoPensiones
        fields = '__all__'
        read_only_fields = ('__all__',)

#10 MSIS'15'
class ApiEps(serializers.ModelSerializer):
    class Meta:
        model = Eps
        fields = '__all__'
        read_only_fields = ('__all__',)

#11 MSIS'16'
class apiTipoSexo(serializers.ModelSerializer):
    class Meta:
        model = TipoSexo
        fields = '__all__'
        read_only_fields = ('__all__',)

#12 MSIS'17'
class apiTipoOrientacionSexual(serializers.ModelSerializer):
    class Meta:
        model = TipoOrientacionSexual
        fields = '__all__'
        read_only_fields = ('__all__',)

#13
class apiTipoFactorDiferencial(serializers.ModelSerializer):
    class Meta:
        model = TipoFactorDiferencial
        fields = '__all__'
        read_only_fields = ('__all__',)

#14
class apiTipoVinculacion(serializers.ModelSerializer):         
    class Meta:
        model = TipoVinculacion   
        fields = '__all__'                         
        read_only_fields = ('__all__',)


class ApiTelefonoCelular(serializers.ModelSerializer):
    id_ctelefono = UUIDStringField()
    class Meta:
        model = TelefonoCelularContactoUsuario
        fields = '__all__'


class ApiCorreoElectronico(serializers.ModelSerializer):
    id_ccelectronico = UUIDStringField()
    class Meta:
        model = CorreoElectronicoContactoUsuario
        fields = '__all__'


class ApiDatosContacto(serializers.ModelSerializer):
    id_contacto = UUIDStringField()
    id_ctelefono = ApiTelefonoCelular()
    id_ccelectronico = ApiCorreoElectronico()

    class Meta:
        model = DatosContactoUsuario
        fields = '__all__'


class ApiUbicacionBase(serializers.ModelSerializer):
    id_ubicacion = UUIDStringField()
    pais = ApiPais()
    departamento = ApiDepartamento()
    municipio = ApiMunicipio()
    zona = ApiZona()

    class Meta:
        model = DatosUbicacionUsuario
        fields = '__all__'


class ApiUbicacionUrbana(ApiUbicacionBase):
    class Meta:
        model = UbicacionUrbana
        fields = '__all__'


class ApiUbicacionRural(ApiUbicacionBase):
    class Meta:
        model = UbicacionRural
        fields = '__all__'


class ApiIdentificacion(serializers.ModelSerializer):
    id_iusuario = UUIDStringField()
    tipo_identificacion = ApiTipoIdentificacion()
    class Meta:
        model = IdentificacionUsuario
        fields = '__all__'


class ApiNombrePersona(serializers.ModelSerializer):
    id_npersona = UUIDStringField()
    class Meta:
        model = NombrePersonaUsuario
        fields = '__all__'


class ApiDatosComplementarios(serializers.ModelSerializer):
    id_cusuario = UUIDStringField()
    basicos_usuario = UUIDStringField()
    estado_civil = ApiEstadoCivil()
    fondo_pensiones = ApiFondoPensiones()
    eps = ApiEps()
    tipo_vinculacion = apiTipoVinculacion()
    class Meta:
        model = DatosComplementariosUsuario
        fields = '__all__'


class ApiContratoContratista(serializers.ModelSerializer):
    id_contrato = UUIDStringField()
    complementario_usuario = UUIDStringField()
    class Meta:
        model = ContratoContratista
        fields = '__all__'


class ApiResolucionFuncionario(serializers.ModelSerializer):
    id_resolucion = UUIDStringField()
    complementario_usuario = UUIDStringField()
    class Meta:
        model = ResolucionFuncionario
        fields = '__all__'


class ApiPerfilUsuario(serializers.ModelSerializer):
    id_pusuario = UUIDStringField()
    basicos_usuario = UUIDStringField()
    class Meta:
        model = PerfilUsuario
        fields = '__all__'


class ApiDatosBasicosUsuario(serializers.ModelSerializer):
    id_busuario = UUIDStringField()
    identificacion_usuario = ApiIdentificacion()
    nombre_persona = ApiNombrePersona()
    datos_contacto = serializers.SerializerMethodField()
    datos_ubicacion = serializers.SerializerMethodField()
    datos_complementarios = serializers.SerializerMethodField()
    datos_perfil = serializers.SerializerMethodField()
    contrato = serializers.SerializerMethodField()
    resolucion = serializers.SerializerMethodField()

    sexo_persona = apiTipoSexo()
    genero_persona = ApiTipoGenero()
    orientacion_persona = apiTipoOrientacionSexual()
    gp_rh = ApiGpRh()

    class Meta:
        model = DatosBasicosUsuario
        fields = '__all__'

    # def get_datos_contacto(self, obj):
    #     content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)
    #     contacto_persona = DatosContactoUsuario.objects.filter(content_type=content_type, object_id=str(obj.id_busuario)).last()
    #     return ApiDatosContacto(contacto_persona).data if contacto_persona else None
    
    # def get_datos_ubicacion(self, obj):
    #     content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)
    #     ubicacion_persona = DatosUbicacionUsuario.objects.filter(content_type=content_type, object_id=str(obj.id_busuario)).last()
    #     return ApiUbicacionBase(ubicacion_persona).data if ubicacion_persona else None

    def _find_by_generic_relation(self, model_class, object_id):
        """Busca primero por content_type + object_id, luego por object_id con content_type NULL"""
        content_type = ContentType.objects.get_for_model(DatosBasicosUsuario)
        uuid_str = str(object_id)

        # Intento 1: content_type correcto + object_id
        result = model_class.objects.filter(
            content_type=content_type,
            object_id=uuid_str
        ).last()

        if result:
            return result

        # Intento 2: object_id con content_type NULL
        result = model_class.objects.filter(
            content_type__isnull=True,
            object_id=uuid_str
        ).last()

        return result

    def get_datos_contacto(self, obj):
        contacto_persona = self._find_by_generic_relation(
            DatosContactoUsuario, obj.id_busuario
        )
        return ApiDatosContacto(contacto_persona).data if contacto_persona else None

    def get_datos_ubicacion(self, obj):
        ubicacion_base = self._find_by_generic_relation(
            DatosUbicacionUsuario, obj.id_busuario
        )

        if not ubicacion_base:
            return None

        # Determinar si es urbana o rural según la zona
        zona_id = ubicacion_base.zona.id_zubicacion if ubicacion_base.zona else None

        # zona 1 = Urbana
        if zona_id == 1:
            try:
                ubicacion_urbana = UbicacionUrbana.objects.get(
                    id_ubicacion=ubicacion_base.id_ubicacion
                )
                return ApiUbicacionUrbana(ubicacion_urbana).data
            except UbicacionUrbana.DoesNotExist:
                pass

        # zona 2 = Rural
        elif zona_id == 2:
            try:
                ubicacion_rural = UbicacionRural.objects.get(
                    id_ubicacion=ubicacion_base.id_ubicacion
                )
                return ApiUbicacionRural(ubicacion_rural).data
            except UbicacionRural.DoesNotExist:
                pass

        # Fallback: retornar datos base sin campos específicos
        return ApiUbicacionBase(ubicacion_base).data

    def get_datos_complementarios(self, obj):
        complemento = _cached_complemento(obj)
        return ApiDatosComplementarios(complemento).data if complemento else None

    def get_datos_perfil(self, obj):
        perfil = PerfilUsuario.objects.filter(basicos_usuario=obj).last()
        return ApiPerfilUsuario(perfil).data if perfil else None

    def get_contrato(self, obj):
        complemento = _cached_complemento(obj)
        contrato = ContratoContratista.objects.filter(complementario_usuario=complemento).last() if complemento else None
        return ApiContratoContratista(contrato).data if contrato else None

    def get_resolucion(self, obj):
        complemento = _cached_complemento(obj)
        resolucion = ResolucionFuncionario.objects.filter(complementario_usuario=complemento).last() if complemento else None
        return ApiResolucionFuncionario(resolucion).data if resolucion else None

class ApiBiometricData(serializers.ModelSerializer):
    id_biometric = UUIDStringField()
    class Meta:
        model = Biometric
        fields = '__all__'

class ApiBiometricData(serializers.ModelSerializer):
    id_biometric = UUIDStringField()
    class Meta:
        model = Biometric
        fields = '__all__'


class ActiveUsersSerializer(serializers.Serializer):
    userType = serializers.ChoiceField(choices=["beneficiario", "pproteccion"])
    documento = serializers.CharField()

    # * Solo para beneficiario
    fechaResolucion = serializers.DateField(required=False)
    resolucion = serializers.CharField(required=False)

    def validate(self, attrs):
        if attrs["userType"] == "beneficiario":
            if not attrs.get("fechaResolucion") or not attrs.get("resolucion"):
                raise serializers.ValidationError("fecha de resolucion y resolucion son obligatorios para beneficiario.")
        return attrs
    

class ApiGetPKUser(serializers.ModelSerializer):
    # PKs de las tablas directamente relacionadas
    id_busuario = UUIDStringField()
    id_iusuario = serializers.SerializerMethodField()
    id_npersona = serializers.SerializerMethodField()
    
    # PKs de las tablas estáticas
    id_tsexo = serializers.SerializerMethodField()
    id_tgenero = serializers.SerializerMethodField()
    id_torientacion = serializers.SerializerMethodField()
    id_grh = serializers.SerializerMethodField()
    
    # PKs de datos de contacto
    id_contacto = serializers.SerializerMethodField()
    id_ctelefono = serializers.SerializerMethodField()
    id_ccelectronico = serializers.SerializerMethodField()
    
    # PKs de datos de ubicación
    id_ubicacion = serializers.SerializerMethodField()
    id_pais = serializers.SerializerMethodField()
    id_departamento = serializers.SerializerMethodField()
    id_municipio = serializers.SerializerMethodField()
    id_zubicacion = serializers.SerializerMethodField()
    
    # PKs de datos complementarios
    id_cusuario = serializers.SerializerMethodField()
    id_ecivil = serializers.SerializerMethodField()
    id_fpensiones = serializers.SerializerMethodField()
    id_eps = serializers.SerializerMethodField()
    id_tvinculacion = serializers.SerializerMethodField()
    
    # PKs de contrato y resolución
    id_contrato = serializers.SerializerMethodField()
    id_resolucion = serializers.SerializerMethodField()
    
    # PKs de perfil de usuario
    id_pusuario = serializers.SerializerMethodField()
    
    class Meta:
        model = DatosBasicosUsuario
        fields = [
            'id_busuario', 'id_iusuario', 'id_npersona',
            'id_tsexo', 'id_tgenero', 'id_torientacion', 'id_grh',
            'id_contacto', 'id_ctelefono', 'id_ccelectronico',
            'id_ubicacion', 'id_pais', 'id_departamento', 'id_municipio', 'id_zubicacion',
            'id_cusuario', 'id_ecivil', 'id_fpensiones', 'id_eps', 'id_tvinculacion',
            'id_contrato', 'id_resolucion', 'id_pusuario'
        ]
    
    # Métodos para obtener PKs de identificación y nombre
    def get_id_iusuario(self, obj):
        return str(obj.identificacion_usuario.id_iusuario) if obj.identificacion_usuario else None
    
    def get_id_npersona(self, obj):
        return str(obj.nombre_persona.id_npersona) if obj.nombre_persona else None
    
    # Métodos para obtener PKs de tablas estáticas
    def get_id_tsexo(self, obj):
        return str(obj.sexo_persona.id_tsexo) if obj.sexo_persona else None
    
    def get_id_tgenero(self, obj):
        return str(obj.genero_persona.id_tgenero) if obj.genero_persona else None
    
    def get_id_torientacion(self, obj):
        return str(obj.orientacion_persona.id_torientacion) if obj.orientacion_persona else None
    
    def get_id_grh(self, obj):
        return str(obj.gp_rh.id_grh) if obj.gp_rh else None
    
    # Métodos para obtener PKs de datos de contacto
    def get_id_contacto(self, obj):
        contacto = _cached_contacto_generic(obj)
        return str(contacto.id_contacto) if contacto else None

    def get_id_ctelefono(self, obj):
        contacto = _cached_contacto_generic(obj)
        return str(contacto.id_ctelefono.id_ctelefono) if contacto and contacto.id_ctelefono else None

    def get_id_ccelectronico(self, obj):
        contacto = _cached_contacto_generic(obj)
        return str(contacto.id_ccelectronico.id_ccelectronico) if contacto and contacto.id_ccelectronico else None
    
    # Métodos para obtener PKs de datos de ubicación
    def get_id_ubicacion(self, obj):
        ubicacion = _cached_ubicacion_generic(obj)
        return str(ubicacion.id_ubicacion) if ubicacion else None

    def get_id_pais(self, obj):
        ubicacion = _cached_ubicacion_generic(obj)
        return str(ubicacion.pais.id_pais) if ubicacion and ubicacion.pais else None

    def get_id_departamento(self, obj):
        ubicacion = _cached_ubicacion_generic(obj)
        return str(ubicacion.departamento.id_departamento) if ubicacion and ubicacion.departamento else None

    def get_id_municipio(self, obj):
        ubicacion = _cached_ubicacion_generic(obj)
        return str(ubicacion.municipio.id_municipio) if ubicacion and ubicacion.municipio else None

    def get_id_zubicacion(self, obj):
        ubicacion = _cached_ubicacion_generic(obj)
        return str(ubicacion.zona.id_zubicacion) if ubicacion and ubicacion.zona else None
    
    # Métodos para obtener PKs de datos complementarios
    def get_id_cusuario(self, obj):
        complemento = _cached_complemento(obj)
        return str(complemento.id_cusuario) if complemento else None

    def get_id_ecivil(self, obj):
        complemento = _cached_complemento(obj)
        return str(complemento.estado_civil.id_ecivil) if complemento and complemento.estado_civil else None

    def get_id_fpensiones(self, obj):
        complemento = _cached_complemento(obj)
        return str(complemento.fondo_pensiones.id_fpensiones) if complemento and complemento.fondo_pensiones else None

    def get_id_eps(self, obj):
        complemento = _cached_complemento(obj)
        return str(complemento.eps.id_eps) if complemento and complemento.eps else None

    def get_id_tvinculacion(self, obj):
        complemento = _cached_complemento(obj)
        return str(complemento.tipo_vinculacion.id_tvinculacion) if complemento and complemento.tipo_vinculacion else None

    # Métodos para obtener PKs de contrato y resolución
    def get_id_contrato(self, obj):
        complemento = _cached_complemento(obj)
        contrato = ContratoContratista.objects.filter(complementario_usuario=complemento).last() if complemento else None
        return str(contrato.id_contrato) if contrato else None

    def get_id_resolucion(self, obj):
        complemento = _cached_complemento(obj)
        resolucion = ResolucionFuncionario.objects.filter(complementario_usuario=complemento).last() if complemento else None
        return str(resolucion.id_resolucion) if resolucion else None
    
    # Método para obtener PK del perfil de usuario
    def get_id_pusuario(self, obj):
        perfil = PerfilUsuario.objects.filter(basicos_usuario=obj).last()
        return str(perfil.id_pusuario) if perfil else None   


### Para asignación de roles
class ApiDependencia(serializers.ModelSerializer):         
    class Meta:
        model = Dependencia                      
        fields = '__all__'                         
        read_only_fields = ('__all__',)

class ApiGrupo(serializers.ModelSerializer):         
    class Meta:
        model = Grupo                      
        fields = '__all__'                         
        read_only_fields = ('__all__',)

class ApiRol(serializers.ModelSerializer):
    class Meta:
        model = Rol
        fields = '__all__'
        read_only_fields = ('__all__',)

# Consulta perfiles
class ApiPerfilUsuario(serializers.ModelSerializer):
    username = serializers.SerializerMethodField()
    dependencia_nombre = serializers.SerializerMethodField()
    grupo_nombre = serializers.SerializerMethodField()
    rol_nombre = serializers.SerializerMethodField()

    class Meta:
        model = PerfilUsuario
        fields = '__all__'
        read_only_fields = ('__all__',)

    def get_username(self, obj):
        return obj.user.username if obj.user else None
    
    def get_dependencia_nombre(self, obj):
        return obj.dependencia.nombre_dependencia if obj.dependencia else None
    
    def get_grupo_nombre(self, obj):
        return obj.grupo.nombre_grupo if obj.grupo else None
    
    def get_rol_nombre(self, obj):
        return obj.rol.nombre_rol if obj.rol else None


class ApiDatosRepresentante(serializers.ModelSerializer):
    id_representante = UUIDStringField()
    identificacion_representante = ApiIdentificacion()
    nombre_representante = ApiNombrePersona()
    contacto_representante = serializers.SerializerMethodField()
    ubicacion_representante = serializers.SerializerMethodField()

    class Meta:
        model = DatosRepresentate
        fields = '__all__'

    def get_contacto_representante(self, obj):
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        contacto = DatosContactoUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_representante)
        ).last()
        return ApiDatosContacto(contacto).data if contacto else None

    def get_ubicacion_representante(self, obj):
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        ubicacion = DatosUbicacionUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_representante)
        ).last()
        return ApiUbicacionBase(ubicacion).data if ubicacion else None


class ApiGetPKRepresentante(serializers.ModelSerializer):
    id_representante = UUIDStringField()
    id_iusuario = serializers.SerializerMethodField()
    id_npersona = serializers.SerializerMethodField()
    id_contacto = serializers.SerializerMethodField()
    id_ctelefono = serializers.SerializerMethodField()
    id_ccelectronico = serializers.SerializerMethodField()
    id_ubicacion = serializers.SerializerMethodField()

    class Meta:
        model = DatosRepresentate
        fields = [
            'id_representante', 'id_iusuario', 'id_npersona',
            'id_contacto', 'id_ctelefono', 'id_ccelectronico',
            'id_ubicacion'
        ]

    def get_id_iusuario(self, obj):
        return str(obj.identificacion_representante.id_iusuario) if obj.identificacion_representante else None

    def get_id_npersona(self, obj):
        return str(obj.nombre_representante.id_npersona) if obj.nombre_representante else None

    def get_id_contacto(self, obj):
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        contacto = DatosContactoUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_representante)
        ).last()
        return str(contacto.id_contacto) if contacto else None

    def get_id_ctelefono(self, obj):
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        contacto = DatosContactoUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_representante)
        ).last()
        return str(contacto.id_ctelefono.id_ctelefono) if contacto and contacto.id_ctelefono else None

    def get_id_ccelectronico(self, obj):
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        contacto = DatosContactoUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_representante)
        ).last()
        return str(contacto.id_ccelectronico.id_ccelectronico) if contacto and contacto.id_ccelectronico else None

    def get_id_ubicacion(self, obj):
        content_type = ContentType.objects.get_for_model(DatosRepresentate)
        ubicacion = DatosUbicacionUsuario.objects.filter(
            content_type=content_type,
            object_id=str(obj.id_representante)
        ).last()
        return str(ubicacion.id_ubicacion) if ubicacion else None
    

class ApiConsultarRolesPerfil(serializers.Serializer):
    username = serializers.SerializerMethodField()
    uuid = serializers.SerializerMethodField()
    correo = serializers.SerializerMethodField()
    fecha_ingreso = serializers.SerializerMethodField()
    nombre_completo = serializers.SerializerMethodField()
    tipo_identificacion = serializers.SerializerMethodField()
    numero_identificacion = serializers.SerializerMethodField()
    tipo_usuario = serializers.SerializerMethodField()

    def _get_contacto(self, perfil):
        uuid = str(perfil.basicos_usuario.id_busuario)
        return DatosContactoUsuario.objects.filter(object_id=uuid).last()

    def _get_datos_basicos(self, perfil):
        # perfil.basicos_usuario ya es la instancia (select_related en la vista),
        # evita una consulta redundante por cada fila.
        return perfil.basicos_usuario

    def get_username(self, perfil):
        return perfil.user.username

    def get_uuid(self, perfil):
        return str(perfil.id_pusuario)

    def get_correo(self, perfil):
        # Si la vista precargó un mapa de correos (batch query), se evita 1
        # consulta por fila; si no, se conserva el comportamiento original.
        correo_map = self.context.get('correo_map') if self.context else None
        if correo_map is not None:
            basicos_id = perfil.basicos_usuario_id
            return correo_map.get(str(basicos_id)) if basicos_id else None

        contacto_obj = self._get_contacto(perfil)
        return contacto_obj.id_ccelectronico.correo_electronico if contacto_obj and contacto_obj.id_ccelectronico else None

    def get_fecha_ingreso(self, perfil):
        return perfil.fecha_actualizacion.strftime('%Y-%m-%d')

    def get_nombre_completo(self, perfil):
        nombre = self._get_datos_basicos(perfil).nombre_persona
        return f"{nombre.primer_nombre or ''} {nombre.segundo_nombre or ''} {nombre.primer_apellido or ''} {nombre.segundo_apellido or ''}".strip()

    def get_tipo_identificacion(self, perfil):
        return self._get_datos_basicos(perfil).identificacion_usuario.tipo_identificacion.nombre_tidentificacion

    def get_numero_identificacion(self, perfil):
        return self._get_datos_basicos(perfil).identificacion_usuario.numero_identificacion

    def get_tipo_usuario(self, perfil):
        return 'Interno'


class ApiFuncionarioNovasoft(serializers.ModelSerializer):
    identificacion = serializers.SerializerMethodField()

    class Meta:
        model = FuncionariosMigradosNovasoft
        fields = ['datos_basicos', 'fecha_migracion', 'identificacion']

    def get_identificacion(self, obj):
        datos_basicos = DatosBasicosUsuario.objects.filter(id_busuario=obj.datos_basicos).last()
        if datos_basicos:
            return ApiIdentificacion(datos_basicos.identificacion_usuario) if datos_basicos.identificacion_usuario else None
        return None
