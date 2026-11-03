import json
import random
import requests
from django.utils import timezone
from datetime import timedelta
from decouple import config
from rest_framework import status
from rest_framework.decorators import api_view
from django.http import JsonResponse
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from api.decorators.jwt_decorator import jwt_required
from api.settings import URL_UNP, decrypt_message
from users.models.models_global import *
from users.serializer.serializer_get import ApiGetPKUser
from custom_auth.models.models_global import *
from users.serializer.serializer_get import *
from utils.save_data import *
from utils.generate import *
from utils.tools import *
from api.decorators.rate_limit import rate_limit
from uuid import UUID

# from eco_back.utils import (_log_warn)

# Importar servicios
from users.services import (
    RegistrationService,
    RecoveryService,
    UserDataService,
    UpdateUserDataService,
    UpdateColectivoDataService,
    GetUserAllDataService
)
from custom_auth.services import ValidationService
from builders import ResponseBuilder
from custom_auth.exceptions import (
    AuthenticationError,
    ValidationError,
    UserNotFoundError,
    ProfileNotFoundError
)
from custom_auth.services import (
    ProfileService,
    TokenService,
    UserService,
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


@api_view(['POST'])
@rate_limit(
    scope="register",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.correo", "correo"),
    allow_referer=True,
    referer_include_path=True
)
def register(request):
    """
    Endpoint de registro de usuarios externos
    Crea un nuevo usuario y envía email con credenciales
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = request.data
        form_data = ValidationService.validate_request_data(data)

        # 2. Validar datos de registro
        validated_data = RegistrationService.validate_registration_data(
            form_data)

        # 3. Registrar usuario o colectivo (verifica existencia, crea usuario, envía email)
        user_info = RegistrationService.register_user(
            first_name=validated_data['firstName'],
            last_name=validated_data['lastName'],
            password=validated_data['password'],
            email=validated_data['email'],
            is_colectivo=validated_data.get('isColectivo', False),
            acronimo=validated_data.get('acronimo')
        )

        # 4. Construir respuesta
        mensaje = "Colectivo creado exitosamente" if user_info.get('is_colectivo') else "Usuario creado exitosamente"
        response = ResponseBuilder.success(
            message=mensaje,
            data={
                'username': user_info['username'],
                'isColectivo': user_info.get('is_colectivo', False)
            },
            status_code=status.HTTP_201_CREATED
        )

        _log_warn(f"Usuario registrado exitosamente: {user_info['username']}", level="info")

        return response

    except AuthenticationError as e:
        # Errores controlados (usuario ya existe, datos inválidos, etc.)
        _log_warn(f"Error en registro: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST
        )

    except Exception as e:
        # Errores no controlados - no exponer detalles al cliente
        _log_warn(f"Error inesperado en register: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@rate_limit(
    scope="register-beneficiario",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.correo", "correo"),
    allow_referer=True,
    referer_include_path=True
)
def register_beneficiario(request):
    """
    Endpoint de registro de usuarios beneficiarios (ASP)

    Crea el usuario y, en la misma operación, guarda sus datos básicos y lo
    registra como beneficiario en ASP (rol 3099). Estos usuarios quedan
    sujetos a 2FA en el login, como todo usuario externo.
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = request.data
        form_data = ValidationService.validate_request_data(data)
        is_mobile = getattr(request, 'is_mobile', False)

        # 2. Validar datos de registro (nombre, contraseña, correo)
        validated_data = RegistrationService.validate_registration_data(form_data)

        with transaction.atomic():
            # 3. Verificar existencia y crear usuario
            if RegistrationService.check_user_exists(validated_data['email']):
                raise ValidationError(
                    message="El usuario ya existe",
                    code="USER_ALREADY_EXISTS",
                    status_code=409
                )

            username = RegistrationService.generate_unique_username(
                validated_data['firstName'])
            user = RegistrationService.create_user(
                username=username,
                email=validated_data['email'],
                password=validated_data['password']
            )

            # 4. Completar datos básicos y registro como beneficiario en ASP
            update_form_data = dict(form_data)
            update_form_data['username'] = user.username
            update_form_data['beneficiario'] = True

            UpdateUserDataService.update_user_data(update_form_data, is_mobile)

        # 5. Enviar email de bienvenida (fuera de la transacción, no bloqueante)
        RegistrationService.send_welcome_email(user.email, user.username)

        # 6. Construir respuesta con el perfil ya creado
        user_instance = UserService.get_user_by_username(username)
        profile_data = {'username': user_instance.username}
        profiles = ProfileService.get_user_profiles(user_instance)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data['username'] = user_instance.username

        _log_warn(f"Beneficiario registrado exitosamente: {username}")

        return ResponseBuilder.success(
            message="Beneficiario creado exitosamente",
            data=profile_data,
            status_code=status.HTTP_201_CREATED
        )

    except (AuthenticationError, ValidationError, UserNotFoundError) as e:
        _log_warn(f"Error en registro de beneficiario: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST
        )

    except Exception as e:
        _log_warn(f"Error inesperado en register_beneficiario: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@rate_limit(
    scope="register-proteccion",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.correo", "correo"),
    allow_referer=True,
    referer_include_path=True
)
def register_proteccion(request):
    """
    Endpoint de registro de personas de protección / escoltas (ASP)

    Crea el usuario y, en la misma operación, guarda sus datos básicos y lo
    registra como persona de protección en ASP (rol 3098). Estos usuarios
    quedan sujetos a 2FA en el login, como todo usuario externo.
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear y validar datos del request
        data = request.data
        form_data = ValidationService.validate_request_data(data)
        is_mobile = getattr(request, 'is_mobile', False)

        # 2. Validar datos de registro (nombre, contraseña, correo)
        validated_data = RegistrationService.validate_registration_data(form_data)

        with transaction.atomic():
            # 3. Verificar existencia y crear usuario
            if RegistrationService.check_user_exists(validated_data['email']):
                raise ValidationError(
                    message="El usuario ya existe",
                    code="USER_ALREADY_EXISTS",
                    status_code=409
                )

            username = RegistrationService.generate_unique_username(
                validated_data['firstName'])
            user = RegistrationService.create_user(
                username=username,
                email=validated_data['email'],
                password=validated_data['password']
            )

            # 4. Completar datos básicos y registro como protección en ASP
            update_form_data = dict(form_data)
            update_form_data['username'] = user.username
            update_form_data['tipo_vinculacion'] = 4

            UpdateUserDataService.update_user_data(update_form_data, is_mobile)

        # 5. Enviar email de bienvenida (fuera de la transacción, no bloqueante)
        RegistrationService.send_welcome_email(user.email, user.username)

        # 6. Construir respuesta con el perfil ya creado
        user_instance = UserService.get_user_by_username(username)
        profile_data = {'username': user_instance.username}
        profiles = ProfileService.get_user_profiles(user_instance)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data['username'] = user_instance.username

        _log_warn(f"Persona de protección registrada exitosamente: {username}")

        return ResponseBuilder.success(
            message="Persona de protección creada exitosamente",
            data=profile_data,
            status_code=status.HTTP_201_CREATED
        )

    except (AuthenticationError, ValidationError, UserNotFoundError) as e:
        _log_warn(f"Error en registro de protección: {e.code} - {e.message}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST
        )

    except Exception as e:
        _log_warn(f"Error inesperado en register_proteccion: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error interno del servidor",
            code="INTERNAL_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@rate_limit(
    scope="recovery",
    max_attempts=5,
    window_seconds=60,
    lock_seconds=300,
    json_identity_fields=("datosFormulario.username", "username"),
    allow_referer=True,
    referer_include_path=True
)
def recovery(request):
    """
    Endpoint de recuperación de contraseña
    Solo usuarios externos. Los usuarios internos (Microsoft) cambian su
    contraseña en Microsoft; "interno" responde 400
    INTERNAL_USER_RECOVERY_NOT_ALLOWED (backlog 1.1).

    Nota de seguridad: Siempre retorna la misma respuesta exitosa
    sin revelar si el usuario existe o no

    Request body:
        {
            "datosFormulario": {
                "username": str,
                "userType": "externo"
            }
        }
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos
        data = json.loads(request.body)
        form_data = data.get('datosFormulario', data)

        # 2. Validar datos
        username, user_type = RecoveryService.validate_recovery_data(form_data)

        # 3. Procesar recuperación
        # Nota: Este método nunca lanza excepciones y siempre completa exitosamente
        # para no revelar si el usuario existe o no
        RecoveryService.process_password_recovery(username, user_type)

        # 4. Retornar respuesta exitosa (siempre la misma)
        return ResponseBuilder.recovery_success()

    except ValidationError as e:
        _log_warn(f"Error de validación en recovery: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except Exception as e:
        _log_warn(f"Error inesperado en recovery: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error procesando la solicitud",
            code="RECOVERY_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@rate_limit(
    scope="validate-recovery",
    max_attempts=5,
    window_seconds=600,
    lock_seconds=86400,
    json_identity_fields=(),
    allow_referer=True,
    referer_include_path=True,
)
def validate_recovery(request):
    """
    Paso 2 de la recuperación (solo usuarios externos, backlog 1.1).
    El código se busca cruzado con el usuario: un código vigente no sirve
    para otra cuenta. Usuario inexistente y código inválido responden igual
    (404) para no revelar qué usuarios existen.

    Request body:
        {"datosFormulario": {"username": str, "code": str, "password": str, "userType": "externo"}}
    """
    if request.method == 'POST':
        data = json.loads(request.body)
        form_data = data.get('datosFormulario', data)

        user_type = (form_data.get("userType") or "").strip().lower()
        username = (form_data.get("username") or "").strip()
        recovery_code = str(form_data.get('code') or "").strip()
        password = form_data.get('password')

        # * Valid data exists
        if not username or not recovery_code or not password:
            return JsonResponse({'error': 'All data are required'}, status=status.HTTP_400_BAD_REQUEST)

        # * Solo usuarios externos: la contraseña de Microsoft no se cambia desde el aplicativo
        if user_type != "externo":
            return JsonResponse(
                {'error': 'La contraseña de los usuarios de Microsoft se cambia en Microsoft, no desde el aplicativo'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # * Valid code exists for this user
        not_valid = JsonResponse({'error': 'Code not found or not valid'}, status=status.HTTP_404_NOT_FOUND)
        user_instance = User.objects.filter(username__iexact=username).first()
        if not user_instance or not user_instance.email:
            return not_valid
        code = (
            RecoveryCode.objects
            .filter(code=recovery_code, email__iexact=user_instance.email, is_active=True)
            .order_by('-created_at')
            .first()
        )
        if not code or not code.is_valid():
            return not_valid

        # * Password policy (AUTH_PASSWORD_VALIDATORS)
        try:
            validate_password(password, user=user_instance)
        except DjangoValidationError as e:
            return JsonResponse({'error': ' '.join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_instance.set_password(password)
            user_instance.save()

            code.desactivate()

            return JsonResponse({'message': 'Password updated successfully'}, status=201)

        except Exception as e:
            return JsonResponse({'error': 'No se pudo actualizar la contraseña'}, status=500)

    return JsonResponse({'message': 'Method not allowed'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)


@api_view(['POST'])
def save_data_basic(request):
    """
    Endpoint para actualización completa de datos de usuario
    Maneja múltiples entidades relacionadas: identificación, nombre, contacto,
    ubicación, datos complementarios, contratos/resoluciones y perfiles

    Soporta creación y actualización (usa PKs existentes si están presentes)
    Soporta peticiones desde web y móvil

    Request body:
        {
            "datosFormulario": {
                "username": str,  # o "estado": {"username": str} en móvil
                "basicos_usuario": str (opcional, para actualización),
                ... (múltiples campos de datos personales)
            }
        }
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos
        data = json.loads(request.body)
        form_data = data.get('datosFormulario', data)

        # 2. Detectar si es móvil
        is_mobile = getattr(request, 'is_mobile', False)

        # 3. Procesar actualización de datos
        UpdateUserDataService.update_user_data(form_data, is_mobile)

        # 4. Obtener usuario
        user_instance = UserService.get_user_by_username(form_data['username'])
        if not user_instance:
            raise UserNotFoundError(
                message=f"Usuario {form_data['username']} no encontrado",
                code="USER_NOT_FOUND"
            )

        # 5. Obtener perfiles
        profile_data = None
        profiles = ProfileService.get_user_profiles(user_instance)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data['username'] = user_instance.username
        else:
            # Si no hay perfil, crear uno básico con username
            profile_data = {'username': user_instance.username}

        # 6. Retornar respuesta exitosa
        return ResponseBuilder.user_data_update_success(profile_data)

    except (UserNotFoundError, ValidationError) as e:
        _log_warn(f"Error en save_data_basic: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except Exception as e:
        _log_warn(f"Error inesperado en save_data_basic: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error guardando datos del usuario",
            code="SAVE_DATA_ERROR",
            status_code=status.HTTP_400_BAD_REQUEST
        )



@api_view(['POST'])
def save_data_basic_invitado_cerrem(request):
    """
    Endpoint para actualización completa de datos de usuario
    Maneja múltiples entidades relacionadas: identificación, nombre, contacto,
    ubicación, datos complementarios, contratos/resoluciones y perfiles

    Para los usuarios de cerrem maneja una validacion hacia el back de la ser
    y se agrega el rol de invitado segun la respuesta

    Soporta creación y actualización (usa PKs existentes si están presentes)
    Soporta peticiones desde web y móvil

    Request body:
        {
            "datosFormulario": {
                "username": str,  # o "estado": {"username": str} en móvil
                "basicos_usuario": str (opcional, para actualización),
                ... (múltiples campos de datos personales)
            }
        }
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos
        data = json.loads(request.body)
        form_data = data.get('datosFormulario', data)

        # 2. Detectar si es móvil
        is_mobile = getattr(request, 'is_mobile', False)

        # 3. Procesar actualización de datos
        UpdateUserDataService.update_user_data(form_data, is_mobile)

        # 4. Obtener usuario
        user_instance = UserService.get_user_by_username(form_data['username'])
        if not user_instance:
            raise UserNotFoundError(
                message=f"Usuario {form_data['username']} no encontrado",
                code="USER_NOT_FOUND"
            )

        # 5. Obtener perfiles
        profile_data = None
        profiles = ProfileService.get_user_profiles(user_instance)
        
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data['username'] = user_instance.username
        else:
            # Si no hay perfil, no se puede continuar con la validación de cerrem
            _log_warn("Usuario sin perfiles existentes, no se puede validar cerrem", level="error")
            return ResponseBuilder.error(
                message="El usuario no tiene perfiles configurados",
                code="NO_PROFILE_ERROR",
                status_code=status.HTTP_400_BAD_REQUEST
            )

        # 6. Validar correo en sesion cerrem para añadir rol
        perfil = profiles.last()
        _log_warn(f"Último perfil: {perfil.basicos_usuario.id_busuario}", level="info")
        
        # Validar que el perfil tenga basicos_usuario
        if not perfil or not hasattr(perfil, 'basicos_usuario') or not perfil.basicos_usuario:
            _log_warn("Perfil sin datos básicos de usuario", level="error")
            return ResponseBuilder.error(
                message="El perfil del usuario no tiene datos básicos configurados",
                code="INCOMPLETE_PROFILE_ERROR",
                status_code=status.HTTP_400_BAD_REQUEST
            )
                

        # 6. Retornar respuesta exitosa
        return ResponseBuilder.user_data_update_success(profile_data)

    except (UserNotFoundError, ValidationError) as e:
        _log_warn(f"Error en save_data_basic: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except Exception as e:
        _log_warn(f"Error inesperado en save_data_basic: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error guardando datos del usuario",
            code="SAVE_DATA_ERROR",
            status_code=status.HTTP_400_BAD_REQUEST
        )



@api_view(['POST'])
def save_data_colectivo(request):
    """
    Endpoint para actualización completa de datos de colectivos y representantes
    Maneja múltiples entidades relacionadas: identificación, nombre, contacto,
    ubicación del representante y datos del colectivo

    Soporta creación y actualización (usa PKs existentes si están presentes)
    Soporta peticiones desde web y móvil

    Request body:
        {
            "datosFormulario": {
                "username": str,  # o "estado": {"username": str} en móvil
                "id_representante": str (opcional, para actualización),
                "id_colectivo": str (opcional, para actualización),
                # Datos del representante
                "numero_identificacion_representante": str,
                "fecha_expedicion_representante": date,
                "tipo_identificacion_representante": int,
                "primer_nombre_representante": str,
                "segundo_nombre_representante": str,
                "primer_apellido_representante": str,
                "segundo_apellido_representante": str,
                "celular_uno_representante": str,
                "correo_electronico_representante": str,
                "pais_representante": int (opcional, solo si se envía ubicación),
                "departamento_representante": int,
                "municipio_representante": int,
                "zona_representante": str,
                ... (campos de ubicación del representante, todos opcionales como bloque)
                # Datos del colectivo
                "nombre_colectivo": str,
                "resolucion_colectivo": str,
                "fecha_resolucion_colectivo": date
            }
        }
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos
        data = json.loads(request.body)
        form_data = data.get('datosFormulario', data)

        # 2. Detectar si es móvil
        is_mobile = getattr(request, 'is_mobile', False)

        # 3. Procesar actualización de datos del colectivo y representante
        result = UpdateColectivoDataService.update_colectivo_data(
            form_data, is_mobile)

        # 4. Obtener usuario
        user_instance = UserService.get_user_by_username(form_data['username'])

        # 5. Obtener perfiles
        profile_data = {'username': user_instance.username}
        profiles = ProfileService.get_user_profiles(user_instance)
        if profiles:
            profile_data = ProfileService.build_profile_data(profiles)
            profile_data['username'] = user_instance.username

        # 6. Retornar respuesta exitosa
        return ResponseBuilder.success(
            data=result,
            message="Datos del colectivo y representante guardados exitosamente"
        )

    except (UserNotFoundError, ValidationError) as e:
        _log_warn(f"Error en save_data_colectivo: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except Exception as e:
        _log_warn(f"Error inesperado en save_data_colectivo: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error guardando datos del colectivo",
            code="SAVE_COLECTIVO_ERROR",
            status_code=status.HTTP_400_BAD_REQUEST
        )


@api_view(['POST'])
@jwt_required
def get_data(request):
    """
    Endpoint para obtener datos completos del usuario autenticado
    Retorna información del perfil, servicios y datos básicos en formato JSON

    Requiere autenticación JWT previa
    Soporta usuarios internos (Microsoft) y externos

    Returns:
        JSON con datos completos del usuario
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Obtener información del usuario desde el token JWT
        user_info = request.user

        # 2. Obtener dirección IP del cliente
        remote_addr = request.META.get('REMOTE_ADDR')

        # 3. Procesar y obtener todos los datos del usuario
        user_data = UserDataService.get_user_data(user_info, remote_addr)
        username = user_data.get("datos_basicos", {}).get("username")
        servicios = user_data.get("datos_basicos", {}).get("servicios", [])
        user_instance = User.objects.filter(username__iexact=username).first()
        token_sp = TokenService.generate_sp_token(
            user=user_instance,
            servicios=servicios,
            exp_minutes=480,
        )

        # 4. Retornar respuesta exitosa con los datos
        return ResponseBuilder.user_data_success(user_data, token_sp=token_sp)

    except (UserNotFoundError, ProfileNotFoundError) as e:
        _log_warn(f"Error en get_data: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except ValidationError as e:
        _log_warn(f"Error de validación en get_data: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except Exception as e:
        _log_warn(f"Error inesperado en get_data: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error obteniendo datos del usuario",
            code="GET_DATA_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )



@api_view(['GET'])
@jwt_required
def ConsultarPersonas(request):
    if request.method != 'GET':
        return JsonResponse({"error": "Method not allowed"}, status=405)

    # busqueda por username
    username = request.GET.get('username')
    if not username:
        return JsonResponse({
            "status": "Error",
            "message": "Debe enviar el parámetro 'username'"
        }, status=400)

    try:
        # Busca coincidencias
        posibles = (
            PerfilUsuario.objects
            .select_related(
                'user',
                'basicos_usuario__nombre_persona',
                'basicos_usuario__identificacion_usuario__tipo_identificacion'
            )
            .filter(user__username__startswith=username)
        )

        # No hay coincidencias
        if not posibles.exists():
            return JsonResponse({
                "status": "Success",
                "results": [],
                "count": 0,
                "message": "No se encontró información para el username"
            }, status=200)

        # Quitar duplicados
        perfiles_unicos = {}
        for p in posibles:
            perfiles_unicos[p.user.username] = p

        posibles = list(perfiles_unicos.values())

        # Varias coincidencias
        if len(posibles) > 1:
            resultados = []

            for perfil in posibles:
                datos_basicos = perfil.basicos_usuario

                # Nombre completo
                nombre = None
                if datos_basicos and datos_basicos.nombre_persona:
                    np = datos_basicos.nombre_persona
                    parts = [
                        np.primer_nombre or '',
                        np.segundo_nombre or '',
                        np.primer_apellido or '',
                        np.segundo_apellido or '',
                    ]
                    nombre = " ".join(p.strip() for p in parts if p.strip())

                # Identificación
                numero_identificacion = None
                tipo_identificacion = None
                if datos_basicos and datos_basicos.identificacion_usuario:
                    ident = datos_basicos.identificacion_usuario
                    numero_identificacion = ident.numero_identificacion
                    if ident.tipo_identificacion:
                        tipo_identificacion = ident.tipo_identificacion.nombre_tidentificacion

                # Contacto
                datos_contacto = DatosContactoUsuario.objects.filter(
                    object_id=datos_basicos.id_busuario
                ).select_related('id_ccelectronico', 'id_ctelefono').first()

                correo = getattr(datos_contacto.id_ccelectronico,
                                 'correo_electronico', None) if datos_contacto else None
                celular = getattr(datos_contacto.id_ctelefono,
                                  'celular_uno', None) if datos_contacto else None

                resultados.append({
                    "username": perfil.user.username,
                    "nombre": nombre,
                    "tipo_identificacion": tipo_identificacion,
                    "numero_identificacion": numero_identificacion,
                    "correo": correo,
                    "celular": celular
                })

            return JsonResponse({
                "status": "Success",
                "type": "possible_matches",
                "results": resultados,
                "count": len(resultados)
            }, status=200)

        # Coincidencia única
        perfil = posibles[0]
        datos_basicos = perfil.basicos_usuario

        # Nombre
        nombre = None
        if datos_basicos and datos_basicos.nombre_persona:
            np = datos_basicos.nombre_persona
            parts = [
                np.primer_nombre or '',
                np.segundo_nombre or '',
                np.primer_apellido or '',
                np.segundo_apellido or '',
            ]
            nombre = " ".join(p.strip() for p in parts if p.strip())

        # Identificación
        numero_identificacion = None
        tipo_identificacion = None
        if datos_basicos and datos_basicos.identificacion_usuario:
            ident = datos_basicos.identificacion_usuario
            numero_identificacion = ident.numero_identificacion
            if ident.tipo_identificacion:
                tipo_identificacion = ident.tipo_identificacion.nombre_tidentificacion

        # Contacto
        datos_contacto = DatosContactoUsuario.objects.filter(
            object_id=datos_basicos.id_busuario
        ).select_related('id_ccelectronico', 'id_ctelefono').first()

        correo = getattr(datos_contacto.id_ccelectronico,
                         'correo_electronico', None) if datos_contacto else None
        celular = getattr(datos_contacto.id_ctelefono,
                          'celular_uno', None) if datos_contacto else None

        return JsonResponse({
            "status": "Success",
            "type": "exact_match",
            "username": perfil.user.username,
            "nombre": nombre,
            "tipo_identificacion": tipo_identificacion,
            "numero_identificacion": numero_identificacion,
            "correo": correo,
            "celular": celular,
            "count": 1
        }, status=200)

    except Exception as e:
        _log_warn(f"ConsultarPersonas (username) - error: {e}", level="error", exc_info=True)
        return JsonResponse({"status": "Error", "message": "Error interno del servidor"}, status=500)


@api_view(['POST'])
def get_all_data(request):
    """
    Endpoint para obtener todos los datos de un usuario por username.
    Soporta usuarios regulares y colectivos (representantes).

    Request body:
        {
            "datosFormulario": {
                "username": str,
                "is_colectivo": bool (opcional, default False),
                "numero_identificacion_representante": str (requerido si is_colectivo)
            }
        }
    """
    if request.method != 'POST':
        return ResponseBuilder.method_not_allowed()

    try:
        # 1. Parsear datos
        data = json.loads(request.body)
        form_data = data.get('datosFormulario', data)

        # 2. Soporte mobile
        is_mobile = getattr(request, 'is_mobile', False)
        if is_mobile:
            estado = form_data.get("estado", {})
            username = estado.get("username")
        else:
            username = form_data.get("username")

        if not username:
            raise ValidationError(
                message="Username es requerido",
                code="VALIDATION"
            )

        is_colectivo = form_data.get("is_colectivo", False)
        numero_id_representante = form_data.get(
            "numero_identificacion_representante"
        )

        # 3. Obtener datos
        result = GetUserAllDataService.get_all_data(
            username=username,
            is_colectivo=is_colectivo,
            numero_id_representante=numero_id_representante
        )

        # 4. Respuesta exitosa
        return ResponseBuilder.success(
            message="Datos del usuario obtenidos exitosamente",
            data={"data": result}
        )

    except (UserNotFoundError, ValidationError) as e:
        _log_warn(f"Error en get_all_data: {e.code}", level="warning")
        return ResponseBuilder.from_exception(e)

    except json.JSONDecodeError:
        _log_warn("Request body inválido (no es JSON)", level="warning")
        return ResponseBuilder.error(
            message="Formato de solicitud inválido",
            code="INVALID_JSON",
            status_code=status.HTTP_400_BAD_REQUEST
        )

    except Exception as e:
        _log_warn(f"Error inesperado en get_all_data: {str(e)}", level="error", exc_info=True)
        return ResponseBuilder.error(
            message="Error obteniendo datos del usuario",
            code="GET_ALL_DATA_ERROR",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
