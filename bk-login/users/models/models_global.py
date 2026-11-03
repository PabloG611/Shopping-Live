import uuid
from django.utils import timezone
from django.contrib.contenttypes.fields import GenericRelation
from django.contrib.contenttypes.models import ContentType
from django.db import models
from django.contrib.auth.models import User
from users.models.models_static import Pais, Departamento, Municipio, ZonaUbicacion, TipoIdentificacion, TipoSexo, TipoGenero, TipoOrientacionSexual, GpRh, EstadoCivil, FondoPensiones, Eps, TipoVinculacion, Dependencia, Grupo, Rol
from decouple import config
from cryptography.fernet import Fernet
from django.utils import timezone
from datetime import timedelta

# * Modelos de usuarios


class TelefonoCelularContactoUsuario(models.Model):
    id_ctelefono = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    celular_uno = models.CharField(max_length=15, blank=True, null=True)
    celular_dos = models.CharField(max_length=15, blank=True, null=True)
    celular_emergencia = models.CharField(max_length=15, blank=True, null=True)

    class Meta:
        db_table = 'eco_usr_ctelefono'
        verbose_name_plural = 'Datos de contacto'

    def __str__(self):
        return str(self.id_ctelefono)


class CorreoElectronicoContactoUsuario(models.Model):
    id_ccelectronico = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    correo_electronico = models.EmailField(max_length=100)

    class Meta:
        db_table = 'eco_usr_ccelectronico'
        verbose_name_plural = 'Datos de contacto'

    def __str__(self):
        return str(self.id_ccelectronico)


class DatosContactoUsuario(models.Model):
    id_contacto = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    id_ctelefono = models.ForeignKey(
        TelefonoCelularContactoUsuario, to_field='id_ctelefono', on_delete=models.CASCADE)
    id_ccelectronico = models.ForeignKey(
        CorreoElectronicoContactoUsuario, to_field='id_ccelectronico', on_delete=models.CASCADE)
    content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, blank=True, null=True)
    object_id = models.CharField(blank=True, null=True, max_length=50)

    class Meta:
        db_table = 'eco_usr_contacto'
        verbose_name_plural = 'Datos de contacto'

    def __str__(self):
        return str(self.id_contacto)


class DatosUbicacionUsuario(models.Model):
    id_ubicacion = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    pais = models.ForeignKey(Pais, to_field='id_pais',
                             on_delete=models.CASCADE)
    departamento = models.ForeignKey(
        Departamento, to_field='id_departamento', on_delete=models.CASCADE)
    municipio = models.ForeignKey(
        Municipio, to_field='id_municipio', on_delete=models.CASCADE)
    zona = models.ForeignKey(
        ZonaUbicacion, to_field='id_zubicacion', on_delete=models.CASCADE)
    direccion = models.CharField(max_length=160, blank=True, null=True)
    indicacion = models.CharField(max_length=160, blank=True, null=True)
    content_type = models.ForeignKey(
        ContentType, on_delete=models.CASCADE, blank=True, null=True)
    object_id = models.CharField(blank=True, null=True, max_length=50)

    class Meta:
        db_table = 'eco_usr_ubicacion'
        verbose_name_plural = 'Datos de ubicación'

    def __str__(self):
        return str(self.id_ubicacion)


class UbicacionRural(DatosUbicacionUsuario):
    corregimiento = models.CharField(max_length=150, null=True, blank=True)
    centro_poblado = models.CharField(max_length=150, null=True, blank=True)
    vereda = models.CharField(max_length=150, null=True, blank=True)

    def __str__(self):
        return self.direccion

    class Meta:
        db_table = 'eco_usr_direccionrural'
        verbose_name_plural = 'Dirección rural'


class UbicacionUrbana(DatosUbicacionUsuario):
    nombre_barrio = models.CharField(max_length=100, null=True, blank=True)
    tipo_viaprincipal = models.CharField(max_length=20, null=True, blank=True)
    numero_viaprincipal = models.IntegerField(null=True, blank=True)
    letra_principal = models.CharField(max_length=10, null=True, blank=True)
    es_bis = models.BooleanField(null=True)
    cuadrante_principal = models.CharField(
        max_length=10, null=True, blank=True)
    numero_viasecundaria = models.IntegerField(null=True, blank=True)
    letra_secundaria = models.CharField(max_length=10, null=True, blank=True)
    cuadrante_secundario = models.CharField(
        max_length=10, null=True, blank=True)
    numero_placa = models.IntegerField(null=True, blank=True)
    complemento = models.CharField(max_length=60, null=True, blank=True)

    def __str__(self):
        fields = [
            self.tipo_viaprincipal, self.numero_viaprincipal, self.letra_principal,
            self.cuadrante_principal, self.numero_viasecundaria, self.letra_secundaria, self.numero_placa,
            self.cuadrante_secundario, self.complemento]

        fields = [str(field) for field in fields if field]
        return " ".join(fields)

    class Meta:
        db_table = 'eco_usr_direccionurbana'
        verbose_name_plural = 'Dirección urbana'


class IdentificacionUsuario(models.Model):
    id_iusuario = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    numero_identificacion = models.CharField(
        max_length=20, null=False, blank=True, unique=True)
    fecha_expedicion = models.DateField(null=True, blank=True)
    tipo_identificacion = models.ForeignKey(
        TipoIdentificacion, to_field='id_tidentificacion', on_delete=models.CASCADE)

    class Meta:
        db_table = 'eco_usr_iusuario'
        verbose_name_plural = 'Datos de la identificación del usuario'

    def __str__(self):
        return str(self.numero_identificacion) + str(self.fecha_expedicion)


class NombrePersonaUsuario(models.Model):
    id_npersona = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    primer_nombre = models.CharField(max_length=20, null=False, blank=False)
    segundo_nombre = models.CharField(max_length=50, null=True, blank=True)
    primer_apellido = models.CharField(max_length=50, null=False, blank=False)
    segundo_apellido = models.CharField(max_length=50, null=True, blank=True)

    class Meta:
        db_table = 'eco_usr_nombrepersona'
        verbose_name_plural = 'Nombres y apellidos de las personas'

    def __str__(self):
        return str(self.id_npersona) + str(self.primer_nombre)


class DatosBasicosUsuario(models.Model):
    id_busuario = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    identificacion_usuario = models.ForeignKey(
        IdentificacionUsuario, to_field='id_iusuario', on_delete=models.CASCADE)
    nombre_persona = models.ForeignKey(
        NombrePersonaUsuario, to_field='id_npersona',  on_delete=models.CASCADE)
    sexo_persona = models.ForeignKey(
        TipoSexo, to_field='id_tsexo', on_delete=models.CASCADE, null=True, blank=True)
    genero_persona = models.ForeignKey(
        TipoGenero, to_field='id_tgenero', on_delete=models.CASCADE, null=True, blank=True)
    orientacion_persona = models.ForeignKey(
        TipoOrientacionSexual, to_field='id_torientacion', on_delete=models.CASCADE, null=True, blank=True)
    gp_rh = models.ForeignKey(GpRh, to_field='id_grh',
                              on_delete=models.CASCADE, null=True, blank=True)
    ubicacion_persona = GenericRelation(DatosUbicacionUsuario)
    contacto_persona = GenericRelation(DatosContactoUsuario)

    class Meta:
        db_table = 'eco_usr_basicosusuario'
        verbose_name_plural = 'Datos básicos del usuario'

    def __str__(self):
        return str(self.id_busuario)


class DatosComplementariosUsuario(models.Model):
    id_cusuario = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    estado_civil = models.ForeignKey(
        EstadoCivil, to_field='id_ecivil', on_delete=models.CASCADE, null=True, blank=True)
    fondo_pensiones = models.ForeignKey(
        FondoPensiones, to_field='id_fpensiones', on_delete=models.CASCADE, null=True, blank=True)
    eps = models.ForeignKey(Eps, to_field='id_eps',
                            on_delete=models.CASCADE, null=True, blank=True)
    tipo_vinculacion = models.ForeignKey(
        TipoVinculacion, to_field='id_tvinculacion', on_delete=models.CASCADE, null=True, blank=True)
    acepto_politicas = models.BooleanField(default=False)
    basicos_usuario = models.ForeignKey(
        DatosBasicosUsuario, to_field='id_busuario', on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        db_table = 'eco_usr_complementariosusuario'
        verbose_name_plural = 'Datos básicos del usuario'

    def __str__(self):
        return str(self.id_cusuario)


class ContratoContratista(models.Model):
    id_contrato = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    numero_contrato = models.CharField(max_length=10, blank=True, null=True)
    fecha_iniciocontrato = models.DateField(blank=True, null=True)
    fecha_fincontrato = models.DateField(blank=True, null=True)
    complementario_usuario = models.ForeignKey(
        DatosComplementariosUsuario, to_field='id_cusuario', on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        db_table = 'eco_usr_datoscontrato'
        verbose_name_plural = 'Datos básicos del contrato'

    def __str__(self):
        return str(self.id_contrato)


class ResolucionFuncionario(models.Model):
    id_resolucion = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    numero_resolucion = models.CharField(max_length=30, blank=True, null=True)
    complementario_usuario = models.ForeignKey(
        DatosComplementariosUsuario, to_field='id_cusuario', on_delete=models.CASCADE, null=True, blank=True)

    class Meta:
        db_table = 'eco_usr_datosresolucion'
        verbose_name_plural = 'Datos básicos de la resolucion del contratista'

    def __str__(self):
        return str(self.id_resolucion)


class PerfilUsuario(models.Model):
    id_pusuario = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    dependencia = models.ForeignKey(
        Dependencia, to_field='id_dependencia', on_delete=models.CASCADE, null=True, blank=True)
    grupo = models.ForeignKey(
        Grupo, to_field='id_grupo', on_delete=models.CASCADE, null=True, blank=True)
    rol = models.ForeignKey(Rol, to_field='id_rol',
                            on_delete=models.CASCADE, null=True, blank=True)
    basicos_usuario = models.ForeignKey(
        DatosBasicosUsuario, to_field='id_busuario', on_delete=models.CASCADE, null=True, blank=True,
        related_name='perfiles_basicos')
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    activo = models.BooleanField(default=True)
    fecha_actualizacion = models.DateField(default=timezone.now)
    frecuencia_actualizacion = models.PositiveIntegerField(default=180)
    asignador = models.ForeignKey(
        DatosBasicosUsuario, to_field='id_busuario', on_delete=models.CASCADE, null=True, blank=True, related_name="asignador_id")
    
    class Meta:
        db_table = 'eco_usr_perfilusuario'
        verbose_name_plural = 'perfil del usuario'

    def __str__(self):
        return str(self.id_pusuario)

    def datos_basicos_expirados(self):
        if not self.fecha_actualizacion:
            return True
        return (timezone.now().date() - self.fecha_actualizacion) > timedelta(days=self.frecuencia_actualizacion)
    
    def __save__(self, *args, **kwargs):
        visible = VisibilidadPerfilUsuario.objects.filter(id_perfil_usuario=self)
        if not visible.exists():
            VisibilidadPerfilUsuario.objects.create(id_perfil_usuario=self, visible=True)
        super().save(*args, **kwargs)
        
    


class VisibilidadPerfilUsuario(models.Model):
    #Un usuario puede tener un Rol y no verlo el en concreto
    id_perfil_usuario = models.ForeignKey(PerfilUsuario, to_field='id_pusuario', on_delete=models.CASCADE, primary_key=True)
    visible = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'eco_usr_visibilidadperfilusuario'
        verbose_name_plural = 'visibilidad del perfil del usuario'
    

class ValidationCode(models.Model):
    id_vcodigo = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    email = models.CharField(max_length=255, unique=False)
    code = models.CharField(max_length=100, unique=True)
    expiration = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_usr_validationcode'
        verbose_name_plural = 'codigos de validacion'

    def is_valid(self):
        if not self.is_active:
            return False

        now = timezone.now()
        if self.expiration.tzinfo is None:
            self.expiration = self.expiration.replace(tzinfo=timezone.utc)
        return now < self.expiration

    def desactivate(self):
        self.is_active = False
        self.save()

    def __str__(self):
        return str(self.id_vcodigo)


class RecoveryCode(models.Model):
    id_rcode = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    email = models.CharField(max_length=255, unique=False)
    code = models.CharField(max_length=100, unique=True)
    expiration = models.DateTimeField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_usr_recoverycode'
        verbose_name_plural = 'codigos de recuperacion'

    def is_valid(self):
        if not self.is_active:
            return False

        now = timezone.now()
        if self.expiration.tzinfo is None:
            self.expiration = self.expiration.replace(tzinfo=timezone.utc)
        return now < self.expiration

    def desactivate(self):
        self.is_active = False
        self.save()

    def __str__(self):
        return str(self.id_rcode)


class Notification(models.Model):
    id_notification = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.BinaryField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_usr_notification'
        verbose_name_plural = 'Notificacion de usuario'

    def set_encrypted_token(self, token):
        if not isinstance(token, (str, bytes)):
            raise TypeError("El token debe ser string o bytes")
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        if isinstance(token, str):
            token = token.encode('utf-8')
        self.token = fernet.encrypt(token)

    def get_decrypted_token(self):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        if isinstance(self.token, memoryview):
            self.token = bytes(self.token)

        decrypted_token = fernet.decrypt(self.token)
        return decrypted_token.decode()

    def desactivate(self):
        self.is_active = False
        self.save()

    def __str__(self):
        return str(self.id_notification)



class DatosRepresentate(models.Model):
    id_representante = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    identificacion_representante = models.ForeignKey(
        IdentificacionUsuario, to_field='id_iusuario', on_delete=models.CASCADE)
    nombre_representante = models.ForeignKey(
        NombrePersonaUsuario, to_field='id_npersona',  on_delete=models.CASCADE)
    ubicacion_representante = GenericRelation(DatosUbicacionUsuario)
    contacto_representante = GenericRelation(DatosContactoUsuario)

    class Meta:
        db_table = 'eco_usr_representate'
        verbose_name_plural = 'Datos de representante'

    def __str__(self):
        return str(self.id_representante)
    

class DatosColectivos(models.Model):
    id_colectivo = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='colectivos', null=True, blank=True)
    representante = models.OneToOneField(
        'DatosRepresentate', on_delete=models.CASCADE, related_name='colectivo', null=True, blank=True)
    nombre_colectivo = models.CharField(max_length=150, null=False, blank=False)
    resolucion = models.CharField(max_length=100, null=True, blank=True)
    fecha_resaolucion = models.DateField(null=True, blank=True)


    class Meta:
        db_table = 'eco_usr_datoscolectivos'
        verbose_name_plural = 'Datos de colectivos'

    def __str__(self):
        return str(self.id_colectivo)


class DatosIdentificacionColectivo(models.Model):
    id_icolectivo = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    numero_identificacion = models.CharField(
        max_length=20, null=False, blank=True, unique=True)
    tipo_identificacion = models.ForeignKey(
        TipoIdentificacion, to_field='id_tidentificacion', on_delete=models.CASCADE)
    colectivo = models.ForeignKey(
        DatosColectivos, to_field='id_colectivo', on_delete=models.CASCADE, related_name='identificaciones')

    class Meta:
        db_table = 'eco_usr_icolectivo'
        verbose_name_plural = 'Datos de identificación del colectivo'

    def __str__(self):
        return str(self.numero_identificacion) + str(self.fecha_expedicion)
    

class FuncionariosMigradosNovasoft(models.Model):
    id_migrado = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    datos_basicos = models.ForeignKey(DatosBasicosUsuario, to_field='id_busuario', on_delete=models.CASCADE, null=True, blank=True)
    fecha_migracion = models.DateTimeField(default=timezone.now)

    class Meta:
        db_table = 'eco_usr_funcnovasoft'
        verbose_name_plural = 'Funcionarios migrados desde Novasoft'

    def __str__(self):
        return str(self.id_migrado)
    

class ActualizacionFuncionarioMigrado(models.Model):
    id_actualizacion = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    funcionario_migrado = models.ForeignKey(FuncionariosMigradosNovasoft, to_field='id_migrado', on_delete=models.CASCADE, null=True, blank=True)
    fecha_actualizacion = models.DateTimeField(default=timezone.now)
    
    class Meta:
        db_table = 'eco_usr_actualizacionfuncmigrado'
        verbose_name_plural = 'Actualizaciones de funcionarios migrados'

    def __str__(self):
        return str(self.id_actualizacion)
