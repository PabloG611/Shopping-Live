from pyclbr import Class
import uuid
from django.db import models
from django.contrib.auth.models import User
from decouple import config
from cryptography.fernet import Fernet
from cryptography.fernet import InvalidToken

from users.models.models_static import Rol

# * Modelos de autenticación


class UsuarioExtendido(User):
    """
    Extiende auth_user (herencia multi-tabla: la tabla guarda user_ptr_id +
    los campos propios). Los usuarios sin fila aquí se tratan como no
    desarrolladores.

    desarrollador=True permite autenticarse con el header
    Authorization: Bearer <token>; el resto solo con las cookies de sesión
    (ver utils/auth_cookies.py).
    """
    desarrollador = models.BooleanField(default=False)

    class Meta:
        db_table = 'eco_auth_usuario_extendido'
        verbose_name_plural = 'usuarios extendidos'

    @classmethod
    def es_desarrollador(cls, user) -> bool:
        if not user:
            return False
        return cls.objects.filter(user_ptr_id=user.pk, desarrollador=True).exists()

    @classmethod
    def marcar_desarrollador(cls, user, desarrollador: bool = True):
        """Crea o actualiza la extensión de un auth_user existente."""
        updated = cls.objects.filter(user_ptr_id=user.pk).update(desarrollador=desarrollador)
        if not updated:
            # save_base(raw=True) inserta solo la fila hija, sin re-guardar auth_user
            extendido = cls(user_ptr_id=user.pk, desarrollador=desarrollador)
            extendido.__dict__.update(
                {k: v for k, v in user.__dict__.items() if not k.startswith('_')}
            )
            extendido.save_base(raw=True)


class Session(models.Model):
    id_session = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=False)
    platform = models.CharField(max_length=50, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    user_agent = models.TextField(blank=True, null=True)
    expires_at = models.DateTimeField(blank=True, null=True)
    token = models.BinaryField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True, blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True, blank=True, null=True)

    class Meta:
        db_table = 'eco_auth_session'
        verbose_name_plural = 'sesiones del usuario'

    def set_encrypted_token(self, token):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        encrypted_token = fernet.encrypt(token.encode())
        self.token = encrypted_token

    def get_decrypted_token(self):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        if isinstance(self.token, memoryview):
            self.token = bytes(self.token)

        decrypted_token = fernet.decrypt(self.token)
        return decrypted_token.decode()

    def __str__(self):
        return str(self.id_session)


class TwoFactorAuth(models.Model):
    id_tfactor = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    secret = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_auth_two_factor_auth'
        verbose_name_plural = 'dos factores de autenticación'

    def __str__(self):
        return str(self.id_tfactor)


class Recaptcha(models.Model):
    id_recaptcha = models.UUIDField(
        primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.BinaryField()
    is_valid = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_auth_recaptcha'
        verbose_name_plural = 'recaptcha'

    def set_encrypted_token(self, token):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        encrypted_token = fernet.encrypt(token.encode())
        self.token = encrypted_token

    def get_decrypted_token(self):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        if isinstance(self.token, memoryview):
            self.token = bytes(self.token)

        decrypted_token = fernet.decrypt(self.token)
        return decrypted_token.decode()

    def __str__(self):
        return str(self.id_recaptcha)


class Token(models.Model):
    id_token = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.BinaryField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eco_auth_token'
        verbose_name_plural = 'token'

    def set_encrypted_token(self, token):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        encrypted_token = fernet.encrypt(token.encode())
        self.token = encrypted_token

    def get_decrypted_token(self):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        if isinstance(self.token, memoryview):
            self.token = bytes(self.token)

        decrypted_token = fernet.decrypt(self.token)
        return decrypted_token.decode()

    def __str__(self):
        return str(self.id_token)


class RefreshToken(models.Model):
    id_rtoken = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.TextField(unique=True)  # TextField para soportar tokens largos de Microsoft (hasta 1500+ caracteres)
    fingerprint = models.CharField(max_length=255)  # Fingerprint del dispositivo
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()  # Fecha de expiración explícita
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'eco_auth_refreshtoken'
        verbose_name_plural = 'token de refresco'
        indexes = [
            models.Index(fields=['token']),
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        return str(self.id_rtoken)


class Blacklist(models.Model):
    id_blist = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.BinaryField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_auth_blacklist'
        verbose_name_plural = 'lista negra'

    def set_encrypted_token(self, token):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        encrypted_token = fernet.encrypt(token.encode())
        self.token = encrypted_token

    def get_decrypted_token(self):
        fernet = Fernet(config('FERNET_SECRET_KEY'))
        if isinstance(self.token, memoryview):
            self.token = bytes(self.token)

        decrypted_token = fernet.decrypt(self.token)
        return decrypted_token.decode()

    def __str__(self):
        return str(self.id_blist)


class Biometric(models.Model):
    id_biometric = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    token = models.BinaryField()
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'eco_auth_biometric'
        verbose_name_plural = 'biometria'
        
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
        return str(self.id_biometric)
    
    
    
class Endpoint(models.Model):
    id_endpoint = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint = models.TextField(unique=True)
    is_active = models.BooleanField(default=True)
    rolRequired = models.BooleanField(default=True)
    locked = models.BooleanField(default=False)
    public = models.BooleanField(default=False)
    # Las peticiones mobile (x-request-source: mobile_app) solo pueden acceder
    # a endpoints con is_mobile=True; web accede a todos. Ver gateway/views.py.
    is_mobile = models.BooleanField(default=False)


    class Meta:
        db_table = 'eco_auth_endpoint'
        verbose_name_plural = 'endpoints'

    def __str__(self):
        return str(self.id_endpoint)
    
    
class EndpointsRole(models.Model):
    id_endpoints_role = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint = models.ForeignKey(Endpoint, on_delete=models.CASCADE)
    rol = models.ForeignKey(Rol, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'eco_auth_endpoints_role'
        verbose_name_plural = 'roles de endpoints'

    def __str__(self):
        return str(self.id_endpoints_role)
    
    
    
class ExternalOrganization(models.Model):
    id_external_organization = models.UUIDField(primary_key=True, default=uuid.uuid4,
                                                editable=False)
    name = models.CharField(max_length=255, unique=True)
    
class ExternalEndpoint(models.Model):
    id_external_endpoint = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    endpoint = models.ForeignKey(Endpoint, on_delete=models.CASCADE)
    organizacion = models.ForeignKey(ExternalOrganization, on_delete=models.CASCADE)
    class Meta:
        db_table = 'eco_auth_external_endpoint'
        verbose_name_plural = 'endpoints externos'

    def __str__(self):
        return str(self.id_external_endpoint)


class SocketAvailable(models.Model):
    """
    Catálogo de sockets (WebSocket) a los que se puede dar acceso por rol,
    análogo a Endpoint. La asignación rol-socket vive en SocketAvailableRole.
    """
    id_socket_available = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    socket = models.TextField(unique=True)
    descripcion = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'eco_auth_socket_available'
        verbose_name_plural = 'sockets disponibles'

    @classmethod
    def nombres_para_usuario(cls, user) -> list:
        """
        Sockets activos a los que tiene acceso alguno de los roles activos del
        usuario (PerfilUsuario.rol con activo=True), ordenados y sin repetir.
        """
        return list(
            cls.objects.filter(
                is_active=True,
                socketavailablerole__is_active=True,
                socketavailablerole__rol__perfilusuario__user=user,
                socketavailablerole__rol__perfilusuario__activo=True,
            ).values_list('socket', flat=True).distinct().order_by('socket')
        )

    def __str__(self):
        return str(self.id_socket_available)


class SocketAvailableRole(models.Model):
    id_socket_available_role = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    socket = models.ForeignKey(SocketAvailable, on_delete=models.CASCADE)
    rol = models.ForeignKey(Rol, on_delete=models.CASCADE)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'eco_auth_socket_available_role'
        verbose_name_plural = 'roles de sockets'
        constraints = [
            models.UniqueConstraint(fields=['socket', 'rol'], name='uniq_socket_available_rol'),
        ]

    def __str__(self):
        return str(self.id_socket_available_role)


class CommonPassword(models.Model):
    """
    Contraseñas comunes o filtradas que no se aceptan (ASVS V2.1.1 / V2.1.7).

    Se guarda el SHA-256 de la contraseña, nunca el valor en claro (ver
    custom_auth/common_passwords.py). La valida CommonPasswordDBValidator
    desde AUTH_PASSWORD_VALIDATORS y se carga con el comando
    cargar_contrasenas_comunes.
    """
    id_common_password = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    # unique crea el índice (B-tree) que usa is_common para buscar el hash
    password_sha256 = models.CharField(max_length=64, unique=True)
    source = models.CharField(max_length=50, default='manual')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eco_auth_common_password'
        verbose_name_plural = 'contraseñas comunes'

    @classmethod
    def is_common(cls, password: str) -> bool:
        from custom_auth.common_passwords import candidate_hashes
        return cls.objects.filter(password_sha256__in=candidate_hashes(password)).exists()

    def __str__(self):
        return self.password_sha256
    
  