import posixpath
import re
import time
import uuid

import jwt
from django.shortcuts import render

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError
from django.db.models import Prefetch

from api.decorators.jwt_decorator import autenticar_jwt, jwt_required

import requests
from django.http import JsonResponse, HttpResponse
from rest_framework import status

from decouple import config
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view
from api.decorators.rate_limit import rate_limit

from django.contrib.auth.models import User

from custom_auth.services.external_auth import ExternalAuthService
from users.models.models_global import PerfilUsuario, DatosBasicosUsuario
from users.models.models_static import Rol
from custom_auth.models.models_global import (
    Endpoint, EndpointsRole, ExternalOrganization, ExternalEndpoint,
    SocketAvailable, SocketAvailableRole,
)

import json
from django.http import JsonResponse

from gateway.services.access_tracker import record_access
from gateway.services.request_logger import registrar_evento_proxy
from gateway.services import identidad
from gateway.services.identidad import resolver_id_usuario, username_desde_payload

from urllib.parse import urljoin, urlsplit, urlencode
from typing import Optional, Dict

from utils.logger_generico import _log_warn
# Patrones para normalizar segmentos variables dentro de los endpoints.
PATRON_SEGMENTO_UUID = re.compile(
    r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$"
)
PATRON_CODIGO_NUMERICO = re.compile(r"^\d{4}-\d+$")

# Diccionario de endpoints a los diferentes bk's
BK_API = {
    # api servicios a la ciudadanía
    "api-svc": config('ENDPOINT_BK_SVC', default=''),
    "api-gsc": config('ENDPOINT_BK_UNP', default=''),
    "api-doc": config('ENDPOINT_BK_DOC', default=''),
    "api-ser": config('ENDPOINT_BK_SER', default=''),
    "api-sesp": config('ENDPOINT_BK_SESP', default=''),
    "api-data": config('ENDPOINT_BK_GEODATA', default=''),
    "api-pdf": config('ENDPOINT_BK_PDF', default=''),
    "api-auth": config('ENDPOINT_BK_AUTH', default=''),
    "api-noti": config('ENDPOINT_BK_NOTI', default=''),
    "api-sgai": config('ENDPOINT_BK_SGAI', default=''),
    "api-tools": config('ENDPOINT_BK_TOOLS', default=''),
    "api-noa": config('ENDPOINT_BK_NOA', default=''),
    # api histórico ecosistema de información - conexión a histórico SER y consultas a PowerApps DP
    "api-hei": 'https://ecosistemapruebas.unp.gov.co/hser/',
}

def parse_service_url(api_url: str, base: Optional[str] = None) -> Dict[str, Optional[str]]:
    if not api_url:
        return {
            "dominio": None,
            "dependencia": None,
            "grupo": None,
            "rol": None,
        }

    u = urlsplit(api_url)
    dominio = f"{u.scheme}://{u.netloc}" if u.scheme and u.netloc else None
    path = u.path  # ya viene sin query/fragment

    # Si hay base, recorta su path del path de api_url
    if base:
        b = urlsplit(base)
        base_path = (b.path or "").strip("/")
        if base_path:
            pref1 = "/" + base_path + "/"
            pref2 = "/" + base_path
            if path.startswith(pref1):
                path = path[len(pref1):]
            elif path.startswith(pref2 + "/"):
                path = path[len(pref2) + 1:]
            elif path == pref2:
                path = ""
        # si la base solo es dominio, no hay nada que recortar

    parts = [p for p in path.strip("/").split("/") if p]

    dependencia = parts[0] if len(parts) >= 1 else None
    grupo       = parts[1] if len(parts) >= 2 else None
    rol         = "/".join(parts[2:]) if len(parts) >= 3 else None

    return {
        "dominio": dominio,
        "dependencia": dependencia,
        "grupo": grupo,
        "rol": rol,
    }


def _sanitize_proxy_path(path: str) -> str:
    if not path:
        return path
    if "://" in path or path.startswith("//"):
        _log_warn(f"SSRF attempt blocked: '{path}'", level="warning")
        raise ValueError("Path no permitido")
    return path


def _normalizar_ruta_endpoint(endpoint_path: str) -> str:
    """Normaliza segmentos dinámicos para validar permisos por patrón de endpoint."""
    if not endpoint_path:
        return endpoint_path

    tiene_slash_final = endpoint_path.endswith("/")
    segmentos = [segmento for segmento in endpoint_path.strip("/").split("/") if segmento]
    segmentos_normalizados = []

    for segmento in segmentos:
        if PATRON_SEGMENTO_UUID.fullmatch(segmento):
            segmentos_normalizados.append("{{UUID}}")
        elif PATRON_CODIGO_NUMERICO.fullmatch(segmento):
            segmentos_normalizados.append("{{string}}")
        elif segmento.isdigit():
            segmentos_normalizados.append("{{integer}}")
        else:
            segmentos_normalizados.append(segmento)

    ruta_normalizada = "/".join(segmentos_normalizados)
    if tiene_slash_final and ruta_normalizada:
        ruta_normalizada += "/"

    return ruta_normalizada


def _proxy_rate_limit_ident(request):
    """Extrae el username del JWT payload para rate limiting."""
    user_info = request.user if isinstance(request.user, dict) else {}
    username = (
        user_info.get('username') or
        (user_info.get('preferred_username') or '').split('@')[0]
    )
    return ("user", username or "unknown")


def _resolver_backend_y_ruta(request, path):
    """
    Identifica el backend destino (header BK-Service) y sanitiza el path recibido.

    Retorna la tupla (bk_service, safe_path) si todo es válido, o un
    JsonResponse de error en caso contrario.
    """
    # Busca en el header el back-end para realizar la petición correspondiente
    bk_service = request.headers.get("BK-Service")

    if bk_service not in BK_API:
        return JsonResponse({'error': 'API not found'}, status=status.HTTP_502_BAD_GATEWAY)

    # Sanitizar path para prevenir path traversal (../../, /absoluto, etc.)
    try:
        safe_path = _sanitize_proxy_path(path)
        _log_warn(f"Path sanitizado: '{safe_path}'", level="info")
    except ValueError as e:
        return JsonResponse({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)

    return bk_service, safe_path


def _construir_url_backend(bk_service, safe_path, query_params):
    """Construye la URL final hacia el backend, agregando los parámetros de query si existen."""
    url_con_params = urljoin(BK_API[bk_service], safe_path)
    return f"{url_con_params}?{query_params}" if query_params else url_con_params


# Cache del catálogo completo de la tabla Endpoint, para no consultar BD en
# cada petición del gateway (se usa tanto para el chequeo de endpoint público
# como para la validación de permisos). Se invalida automáticamente ante
# cualquier alta, edición o borrado de un Endpoint — ver señales en
# custom_auth/signal.py — por lo que el TTL es solo una red de seguridad.
ENDPOINTS_CACHE_KEY = "gateway:endpoints_catalog:v2"
ENDPOINTS_CACHE_TTL = 60 * 60 * 6  # 6 horas


def _obtener_catalogo_endpoints():
    """
    Devuelve el catálogo de la tabla Endpoint como dict
    {endpoint_normalizado: Endpoint}, leyendo de cache (Redis) y recargando
    desde BD solo si el cache expiró o fue invalidado.
    """
    catalogo = cache.get(ENDPOINTS_CACHE_KEY)
    if catalogo is None:
        catalogo = {e.endpoint: e for e in Endpoint.objects.all()}
        cache.set(ENDPOINTS_CACHE_KEY, catalogo, ENDPOINTS_CACHE_TTL)
    return catalogo


def _endpoint_es_publico(bk_service, safe_path):
    """
    Verifica en el catálogo (tabla Endpoint, cacheado) si la ruta solicitada
    existe y está marcada como pública (campo `public=True`).

    Los endpoints públicos se sirven sin exigir token de autorización ni
    validación de rol/permisos.
    """
    endpoint_normalizado = _normalizar_ruta_endpoint(f"{bk_service}/{safe_path}")
    endpoint_obj = _obtener_catalogo_endpoints().get(endpoint_normalizado)
    return bool(endpoint_obj and endpoint_obj.public)


def _autenticar_y_obtener_usuario(request):
    """
    Valida el JWT de la petición y resuelve el id_busuario del usuario autenticado.

    Se invoca `autenticar_jwt` manualmente (en lugar del decorador @jwt_required)
    porque el bypass de endpoints públicos debe evaluarse antes de exigir token.

    Retorna el id_usuario (str) si todo es correcto, o un JsonResponse de error.
    """
    payload, error_response = autenticar_jwt(request)
    if error_response:
        return error_response

    # Se deja disponible en request.user por compatibilidad con el resto del código
    request.user = payload

    id_usuario, motivo = resolver_id_usuario(payload)
    if motivo == identidad.SIN_USERNAME:
        _log_warn("No se pudo extraer username del token", level="error")
        return JsonResponse({"error": "Token inválido: no se encontró username"}, status=status.HTTP_401_UNAUTHORIZED)
    if motivo == identidad.USUARIO_NO_ENCONTRADO:
        _log_warn(f"Usuario no encontrado: {username_desde_payload(payload)}", level="error")
        return JsonResponse({"error": "Usuario no encontrado"}, status=status.HTTP_404_NOT_FOUND)
    if motivo == identidad.SIN_DATOS_BASICOS:
        _log_warn(f"Usuario sin perfil o datos básicos: {username_desde_payload(payload)}", level="error")
        return JsonResponse({"error": "Usuario sin datos básicos"}, status=status.HTTP_404_NOT_FOUND)

    return id_usuario


def _validar_permiso_endpoint(request, bk_service, safe_path, id_usuario):
    """
    Valida que el usuario autenticado tenga, entre TODOS sus roles activos
    (PerfilUsuario.rol, resueltos por id_usuario — nunca por un header del
    cliente como Referer), al menos uno con permiso explícito (EndpointsRole)
    sobre el endpoint solicitado.

    La única exención es `rolRequired=False` en el catálogo `Endpoint`, que
    depende de la ruta solicitada. No hay exenciones por cabeceras del
    cliente (`Referer`/`Origin`): se eliminaron (backlog 2.1). Un endpoint
    bloqueado o inactivo se rechaza siempre, incluso con `rolRequired=False`.

    Retorna la instancia de Rol que otorga el permiso (o None si el endpoint
    no requiere rol), o un JsonResponse de error si no tiene permisos.
    """
    origin = request.META.get("HTTP_REFERER")
    data_url = parse_service_url(origin)
    record_access(data_url, f"{bk_service}/{safe_path}")

    # Se normaliza el endpoint real para comparar patrones y no valores dinámicos.
    endpoint_solicitado = _normalizar_ruta_endpoint(f"{bk_service}/{safe_path}")

    # Se busca primero en el catálogo cacheado; si no está, se crea
    # automáticamente en BD (el guardado invalida el cache vía señal, ver
    # custom_auth/signal.py).
    endpoint_obj = _obtener_catalogo_endpoints().get(endpoint_solicitado)
    if endpoint_obj is None:
        endpoint_obj, endpoint_creado = Endpoint.objects.get_or_create(
            endpoint=endpoint_solicitado,
            defaults={"is_active": True, "locked": False}
        )
        if endpoint_creado:
            _log_warn(f"Endpoint creado automáticamente: {endpoint_solicitado}", level="info")

    # Endpoint inactivo o bloqueado: acceso denegado (antes de cualquier exención).
    if endpoint_obj.locked or not endpoint_obj.is_active:
        _log_warn(f"Endpoint bloqueado o inactivo: {endpoint_solicitado}", level="warning")
        return JsonResponse(
            {"error": "Endpoint bloqueado o inactivo"},
            status=status.HTTP_403_FORBIDDEN
        )

    # Mobile solo accede a endpoints tipificados (is_mobile=True); web a todos.
    # Se valida antes de la exención por rolRequired=False.
    if getattr(request, "is_mobile", False) and not endpoint_obj.is_mobile:
        if config('ENVIRONMENT') != 'prod':
            # Igual que la autoasignación de rol: fuera de prod se tipifica
            # el endpoint como mobile al primer uso. update() no dispara la
            # señal de post_save, por eso se invalida el catálogo a mano.
            Endpoint.objects.filter(id_endpoint=endpoint_obj.id_endpoint).update(is_mobile=True)
            cache.delete(ENDPOINTS_CACHE_KEY)
            _log_warn(f"Endpoint marcado como mobile automáticamente: {endpoint_solicitado}", level="info")
        else:
            _log_warn(f"Acceso mobile denegado: endpoint no habilitado para mobile: {endpoint_solicitado}", level="warning")
            return JsonResponse(
                {"error": "Endpoint no habilitado para mobile"},
                status=status.HTTP_403_FORBIDDEN
            )

    _log_warn(f"Datos de la URL: {data_url}, rolRequired={endpoint_obj.rolRequired}", level="info")

    if endpoint_obj.rolRequired is False:
        _log_warn("Se omite validación de rol: endpoint con rolRequired=False", level="info")
        return None

    roles_usuario = list(
        Rol.objects.filter(
            perfilusuario__basicos_usuario__id_busuario=id_usuario,
            perfilusuario__activo=True,
        ).distinct()
    )

    if not roles_usuario:
        _log_warn(f"Usuario sin roles activos: {id_usuario}", level="warning")
        return JsonResponse(
            {"error": "El usuario no tiene roles activos"},
            status=status.HTTP_403_FORBIDDEN
        )

    # Validación principal: alguno de los roles reales del usuario debe tener
    # acceso explícito al endpoint.
    permiso = EndpointsRole.objects.filter(
        endpoint=endpoint_obj, rol__in=roles_usuario, is_active=True
    ).select_related('rol').first()

    if permiso:
        return permiso.rol

    if config('ENVIRONMENT') != 'prod':
        # Se evita get_or_create: al no existir una restricción única en
        # (endpoint, rol), con varias réplicas concurrentes pueden quedar filas
        # duplicadas, y el .get() interno de get_or_create revienta con
        # MultipleObjectsReturned en la siguiente ejecución. filter().exists()
        # tolera duplicados existentes y no falla ante la carrera.
        rol_instance = roles_usuario[0]
        # El Endpoint puede venir de un catálogo cacheado con datos viejos (p. ej.
        # Redis compartido con otro entorno). La FK se valida recién en el commit
        # de AtomicMiddleware, así que el except de abajo no la atrapa: se
        # confirma en BD antes de insertar.
        if not Endpoint.objects.filter(id_endpoint=endpoint_obj.id_endpoint).exists():
            _log_warn(f"Endpoint del cache inexistente en BD, se invalida el catálogo: {endpoint_solicitado}", level="warning")
            cache.delete(ENDPOINTS_CACHE_KEY)
            endpoint_obj, _creado = Endpoint.objects.get_or_create(
                endpoint=endpoint_solicitado,
                defaults={"is_active": True, "locked": False}
            )
        if not EndpointsRole.objects.filter(endpoint=endpoint_obj, rol=rol_instance).exists():
            try:
                EndpointsRole.objects.create(endpoint=endpoint_obj, rol=rol_instance, is_active=True)
            except IntegrityError:
                _log_warn("IntegrityError al crear EndpointsRole, probablemente por concurrencia. Se ignora.", level="warning")
        return rol_instance

    _log_warn(f"Acceso denegado: ninguno de los roles del usuario "
        f"({[r.id_rol for r in roles_usuario]}) tiene permiso sobre {endpoint_solicitado}", level="warning")
    return JsonResponse(
        {"error": "No tiene permisos para acceder a este endpoint"},
        status=status.HTTP_403_FORBIDDEN
    )


# Prefijo bajo el que se catalogan (en Endpoint/EndpointsRole) las rutas de
# administración propias del gateway: CRUD del catálogo de endpoints, de sus
# roles y de organizaciones externas. No corresponden a ningún backend real
# de BK_API — es namespace interno para reutilizar la misma tabla de permisos.
GATEWAY_ADMIN_BK_SERVICE = "gateway-admin"


def _autorizar_gestion_gateway(request, id_usuario, ruta_admin):
    """
    Exige que alguno de los roles reales del usuario (ver `_validar_permiso_endpoint`)
    tenga permiso explícito sobre esta ruta de administración del gateway.

    Solo existe un rol de administración que da acceso a estas rutas, y ese
    acceso implica permiso para las cuatro acciones (crear/editar/eliminar
    endpoint, rol de endpoint u organización externa) — no hay una distinción
    más fina que la de `EndpointsRole` por ruta.
    """
    return _validar_permiso_endpoint(request, GATEWAY_ADMIN_BK_SERVICE, ruta_admin, id_usuario)


# Headers de identidad que el cliente no puede enviar al backend.
_HEADERS_IDENTIDAD_CLIENTE = ("pato-id", "rol-id", "x-internal-token")

# Headers de la conexión cliente→gateway que no se reenvían al backend; requests
# los recalcula. Con el Host del cliente, el nginx del backend enruta al
# virtual host equivocado y responde 405.
_HEADERS_CONEXION_CLIENTE = (
    "host", "content-length", "connection", "keep-alive", "transfer-encoding",
    "te", "trailer", "upgrade", "proxy-authorization", "proxy-connection",
)

# Backends a los que no se les reenvían los headers de conexión del cliente.
_BK_SIN_HEADERS_CONEXION = ("api-hei",)


def _construir_headers_backend(request, id_usuario, rol_instance, bk_service):
    """Construye los headers a enviar al backend, incluyendo identidad del usuario e info interna."""
    # Las cabeceras de identidad solo las pone el gateway: las que envía el
    # cliente se descartan siempre (ASVS V4.1.2), también en endpoints públicos.
    excluidos = _HEADERS_IDENTIDAD_CLIENTE
    if bk_service in _BK_SIN_HEADERS_CONEXION:
        excluidos += _HEADERS_CONEXION_CLIENTE
    headers = {
        clave: valor for clave, valor in request.headers.items()
        if clave.lower() not in excluidos
    }

    # Se agrega el header Pato-ID solo si hay un usuario autenticado
    # (en el bypass de endpoints públicos no existe id_usuario)
    if id_usuario is not None:
        headers["Pato-ID"] = id_usuario
    headers["Rol-ID"] = str(rol_instance.id_rol) if rol_instance is not None else "9999"
    headers["X-Internal-Token"] = settings.INTERNAL_SERVICE_TOKEN
    # header para rastrear solicitudes a través del gateway
    headers["X-Request-ID"] = request.headers.get("X-Request-ID", str(uuid.uuid4()))

    # Si NO existe Content-Type, agregamos application/json
    if not request.headers.get("Content-Type"):
        headers["Content-Type"] = "application/json"

    return headers


# Headers que nunca deben quedar en texto plano en los logs: el JWT del
# usuario y el secreto compartido de servicio.
_HEADERS_SENSIBLES_LOG = ("authorization", "x-internal-token", "x-fingerprint", "cookie")


def _redactar_headers_para_log(headers: dict) -> dict:
    """Copia de `headers` apta para logging, con los valores sensibles ocultos."""
    return {
        clave: ("***REDACTED***" if clave.lower() in _HEADERS_SENSIBLES_LOG else valor)
        for clave, valor in headers.items()
    }


def _reenviar_a_backend(request, api_url, id_usuario, rol_instance, bk_service, safe_path):
    """
    Reenvía la petición al backend correspondiente usando el mismo método HTTP
    recibido, y traduce la respuesta en un HttpResponse para el cliente.
    """
    method = request.method.lower()
    headers = _construir_headers_backend(request, id_usuario, rol_instance, bk_service)
    headers_redactados = _redactar_headers_para_log(headers)

    _log_warn(f"URL: {api_url}, headers: {headers_redactados}", level="info")

    inicio = time.monotonic()

    def _registrar(status_code):
        duracion_ms = int((time.monotonic() - inicio) * 1000)
        registrar_evento_proxy(
            request, bk_service, safe_path, headers_redactados,
            id_usuario, rol_instance, status_code, duracion_ms,
        )

    # Sin timeout a propósito (nosec B113): el gateway es un redireccionador y no
    # limita peticiones. El tiempo máximo lo definen cada backend y nginx.
    try:
        if method == "get":
            # Se quita el parametro params ya que estos se incluyen en la URL previamente.
            # Si se pasan en params el back final responde con un 404
            response = requests.get(api_url, headers=headers)  # nosec B113

            _log_warn(f"Response: {response}", level="info")
        elif method == "post":
            response = requests.post(api_url, headers=headers, data=request.body)  # nosec B113
        elif method == "put":
            response = requests.put(api_url, headers=headers, data=request.body)  # nosec B113
        elif method == "patch":
            response = requests.patch(api_url, headers=headers, data=request.body)  # nosec B113
        elif method == "delete":
            response = requests.delete(api_url, headers=headers, data=request.body)  # nosec B113
        else:
            _registrar(status.HTTP_405_METHOD_NOT_ALLOWED)
            return JsonResponse({"message": "Method not allowed"}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

        http_response = HttpResponse(
            content=response.content,
            status=response.status_code
        )

        # Solo headers seguros
        safe_headers = ['Content-Type', 'X-Suggested-Filename']

        for header in safe_headers:
            if header in response.headers:
                http_response[header] = response.headers[header]

        _registrar(response.status_code)
        return http_response

    except requests.RequestException as e:
        _log_warn(f"Error de red en proxy: {type(e).__name__}", level="error")
        _registrar(status.HTTP_500_INTERNAL_SERVER_ERROR)
        return JsonResponse({"error": "Error de conexión al servicio"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _serializar_endpoint(endpoint_obj):
    return {
        'id_endpoint': str(endpoint_obj.id_endpoint),
        'endpoint': endpoint_obj.endpoint,
        'is_active': endpoint_obj.is_active,
        'rolRequired': endpoint_obj.rolRequired,
        'locked': endpoint_obj.locked,
        'public': endpoint_obj.public,
        'is_mobile': endpoint_obj.is_mobile,
    }


def _serializar_endpoint_rol(endpoints_role_obj):
    return {
        'id_endpoints_role': str(endpoints_role_obj.id_endpoints_role),
        'id_endpoint': str(endpoints_role_obj.endpoint_id),
        'endpoint': endpoints_role_obj.endpoint.endpoint,
        'id_rol': endpoints_role_obj.rol_id,
        'nombre_rol': endpoints_role_obj.rol.nombre_rol,
        'is_active': endpoints_role_obj.is_active,
    }


def _serializar_rol_sin_endpoint(rol_obj):
    return {
        'id_endpoints_role': None,
        'id_endpoint': None,
        'endpoint': None,
        'id_rol': rol_obj.id_rol,
        'nombre_rol': rol_obj.nombre_rol,
        'is_active': None,
    }


def _bool_param(request, nombre):
    """Lee un query param booleano ('true'/'false'); None si no viene."""
    valor = request.GET.get(nombre)
    return None if valor is None else valor.strip().lower() == 'true'


@csrf_exempt
@api_view(['GET'])
def listar_endpoints(request):
    """
    Lista el catálogo de endpoints del gateway (tabla Endpoint), con filtros opcionales.

    `filtro` busca por coincidencia en la ruta; `id_rol` filtra en cambio a
    los endpoints a los que ese rol tiene acceso vigente (EndpointsRole
    activo) — ambos se pueden usar por separado o combinados.
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "endpoints")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        queryset = Endpoint.objects.all()

        is_active = _bool_param(request, 'is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        locked = _bool_param(request, 'locked')
        if locked is not None:
            queryset = queryset.filter(locked=locked)

        public = _bool_param(request, 'public')
        if public is not None:
            queryset = queryset.filter(public=public)

        rol_required = _bool_param(request, 'rolRequired')
        if rol_required is not None:
            queryset = queryset.filter(rolRequired=rol_required)

        is_mobile = _bool_param(request, 'is_mobile')
        if is_mobile is not None:
            queryset = queryset.filter(is_mobile=is_mobile)

        filtro = (request.GET.get('filtro') or '').strip()
        if filtro:
            queryset = queryset.filter(endpoint__icontains=filtro)

        id_rol = request.GET.get('id_rol')
        if id_rol:
            # Endpoints a los que el rol tiene acceso vigente (EndpointsRole activo).
            queryset = queryset.filter(
                endpointsrole__rol__id_rol=id_rol,
                endpointsrole__is_active=True,
            ).distinct()

        data = [_serializar_endpoint(e) for e in queryset.order_by('endpoint')]
        return JsonResponse({'endpoints': data}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al listar endpoints: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al listar endpoints'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def guardar_endpoint(request):
    """Crea un endpoint nuevo, o lo actualiza si se envía 'id_endpoint'."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "endpoints/guardar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        data = request.data
        id_endpoint = data.get('id_endpoint')
        endpoint_valor = (data.get('endpoint') or '').strip()

        if not endpoint_valor:
            return JsonResponse({'error': "El campo 'endpoint' es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        defaults = {
            'endpoint': endpoint_valor,
            'is_active': bool(data.get('is_active', True)),
            'rolRequired': bool(data.get('rolRequired', True)),
            'locked': bool(data.get('locked', False)),
            'public': bool(data.get('public', False)),
            'is_mobile': bool(data.get('is_mobile', False)),
        }

        if id_endpoint:
            endpoint_obj = Endpoint.objects.filter(id_endpoint=id_endpoint).first()
            if not endpoint_obj:
                return JsonResponse({'error': 'Endpoint no encontrado'}, status=status.HTTP_404_NOT_FOUND)
            for campo, valor in defaults.items():
                setattr(endpoint_obj, campo, valor)
            endpoint_obj.save()
        else:
            endpoint_obj, _creado = Endpoint.objects.update_or_create(
                endpoint=endpoint_valor,
                defaults=defaults,
            )

        return JsonResponse({
            'mensaje': 'Endpoint guardado correctamente',
            'endpoint': _serializar_endpoint(endpoint_obj),
        }, status=status.HTTP_200_OK)

    except IntegrityError:
        return JsonResponse({'error': 'Ya existe un endpoint con ese valor'}, status=status.HTTP_409_CONFLICT)
    except Exception as e:
        _log_warn(f"Error al guardar endpoint: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al guardar el endpoint'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST', 'DELETE'])
def eliminar_endpoint(request):
    """Elimina un endpoint del catálogo (en cascada elimina sus roles asociados)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "endpoints/eliminar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        id_endpoint = request.data.get('id_endpoint') or request.GET.get('id_endpoint')
        if not id_endpoint:
            return JsonResponse({'error': "El campo 'id_endpoint' es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        borrados, _detalle = Endpoint.objects.filter(id_endpoint=id_endpoint).delete()
        if not borrados:
            return JsonResponse({'error': 'Endpoint no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return JsonResponse({'mensaje': 'Endpoint eliminado correctamente'}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al eliminar endpoint: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al eliminar el endpoint'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['GET'])
def listar_endpoints_roles(request):
    """
    Lista las asignaciones endpoint-rol (tabla EndpointsRole), con filtros opcionales.

    Parte del catálogo de roles (Rol) en vez de la tabla EndpointsRole, de modo
    que los roles sin ningún endpoint asociado (o sin coincidencias tras los
    filtros) también se incluyan en la respuesta, con los campos de endpoint
    en null.
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "endpoints/roles")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        endpoints_role_queryset = EndpointsRole.objects.select_related('endpoint')

        id_endpoint = request.GET.get('id_endpoint')
        if id_endpoint:
            endpoints_role_queryset = endpoints_role_queryset.filter(endpoint__id_endpoint=id_endpoint)

        is_active = _bool_param(request, 'is_active')
        if is_active is not None:
            endpoints_role_queryset = endpoints_role_queryset.filter(is_active=is_active)

        endpoints_role_queryset = endpoints_role_queryset.order_by('endpoint__endpoint')

        roles_queryset = Rol.objects.prefetch_related(
            Prefetch('endpointsrole_set', queryset=endpoints_role_queryset, to_attr='endpoints_filtrados')
        )

        id_rol = request.GET.get('id_rol')
        if id_rol:
            roles_queryset = roles_queryset.filter(id_rol=id_rol)

        data = []
        for rol in roles_queryset.order_by('id_rol'):
            if rol.endpoints_filtrados:
                data.extend(_serializar_endpoint_rol(er) for er in rol.endpoints_filtrados)
            else:
                data.append(_serializar_rol_sin_endpoint(rol))

        return JsonResponse({'endpoints_roles': data}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al listar endpoints_roles: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al listar los roles de endpoints'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def guardar_endpoint_rol(request):
    """
    Asigna un rol a un endpoint. Si se envía 'id_endpoints_role' se actualiza ese
    registro; si no, se crea (o reutiliza) la asignación para el par endpoint/rol.
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "endpoints/roles/guardar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        data = request.data
        id_endpoints_role = data.get('id_endpoints_role')
        id_endpoint = data.get('id_endpoint')
        id_rol = data.get('id_rol')
        is_active = bool(data.get('is_active', True))

        if id_endpoints_role:
            endpoints_role_obj = EndpointsRole.objects.filter(id_endpoints_role=id_endpoints_role).first()
            if not endpoints_role_obj:
                return JsonResponse({'error': 'Registro no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            if id_endpoint:
                endpoint_obj = Endpoint.objects.filter(id_endpoint=id_endpoint).first()
                if not endpoint_obj:
                    return JsonResponse({'error': 'Endpoint no encontrado'}, status=status.HTTP_404_NOT_FOUND)
                endpoints_role_obj.endpoint = endpoint_obj

            if id_rol:
                rol_obj = Rol.objects.filter(id_rol=id_rol).first()
                if not rol_obj:
                    return JsonResponse({'error': 'Rol no encontrado'}, status=status.HTTP_404_NOT_FOUND)
                endpoints_role_obj.rol = rol_obj

            endpoints_role_obj.is_active = is_active
            endpoints_role_obj.save()
        else:
            if not id_endpoint or not id_rol:
                return JsonResponse(
                    {'error': "Los campos 'id_endpoint' e 'id_rol' son requeridos"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            endpoint_obj = Endpoint.objects.filter(id_endpoint=id_endpoint).first()
            if not endpoint_obj:
                return JsonResponse({'error': 'Endpoint no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            rol_obj = Rol.objects.filter(id_rol=id_rol).first()
            if not rol_obj:
                return JsonResponse({'error': 'Rol no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            endpoints_role_obj, _creado = EndpointsRole.objects.update_or_create(
                endpoint=endpoint_obj,
                rol=rol_obj,
                defaults={'is_active': is_active},
            )

        return JsonResponse({
            'mensaje': 'Rol de endpoint guardado correctamente',
            'endpoints_role': _serializar_endpoint_rol(endpoints_role_obj),
        }, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al guardar endpoints_role: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al guardar el rol del endpoint'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST', 'DELETE'])
def eliminar_endpoint_rol(request):
    """Elimina una asignación de rol a un endpoint (tabla EndpointsRole)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "endpoints/roles/eliminar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        id_endpoints_role = request.data.get('id_endpoints_role') or request.GET.get('id_endpoints_role')
        if not id_endpoints_role:
            return JsonResponse(
                {'error': "El campo 'id_endpoints_role' es requerido"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        borrados, _detalle = EndpointsRole.objects.filter(id_endpoints_role=id_endpoints_role).delete()
        if not borrados:
            return JsonResponse({'error': 'Registro no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return JsonResponse({'mensaje': 'Rol de endpoint eliminado correctamente'}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al eliminar endpoints_role: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al eliminar el rol del endpoint'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _serializar_socket(socket_obj):
    return {
        'id_socket_available': str(socket_obj.id_socket_available),
        'socket': socket_obj.socket,
        'descripcion': socket_obj.descripcion,
        'is_active': socket_obj.is_active,
    }


def _serializar_socket_rol(socket_rol_obj):
    return {
        'id_socket_available_role': str(socket_rol_obj.id_socket_available_role),
        'id_socket_available': str(socket_rol_obj.socket_id),
        'socket': socket_rol_obj.socket.socket,
        'id_rol': socket_rol_obj.rol_id,
        'nombre_rol': socket_rol_obj.rol.nombre_rol,
        'is_active': socket_rol_obj.is_active,
    }


def _serializar_rol_sin_socket(rol_obj):
    return {
        'id_socket_available_role': None,
        'id_socket_available': None,
        'socket': None,
        'id_rol': rol_obj.id_rol,
        'nombre_rol': rol_obj.nombre_rol,
        'is_active': None,
    }


@csrf_exempt
@api_view(['GET'])
def listar_sockets(request):
    """
    Lista el catálogo de sockets (tabla SocketAvailable), con filtros opcionales.

    `filtro` busca por coincidencia en el nombre; `id_rol` filtra a los sockets
    a los que ese rol tiene acceso vigente (SocketAvailableRole activo).
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "sockets")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        queryset = SocketAvailable.objects.all()

        is_active = _bool_param(request, 'is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active)

        filtro = (request.GET.get('filtro') or '').strip()
        if filtro:
            queryset = queryset.filter(socket__icontains=filtro)

        id_rol = request.GET.get('id_rol')
        if id_rol:
            queryset = queryset.filter(
                socketavailablerole__rol__id_rol=id_rol,
                socketavailablerole__is_active=True,
            ).distinct()

        data = [_serializar_socket(s) for s in queryset.order_by('socket')]
        return JsonResponse({'sockets': data}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al listar sockets: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al listar sockets'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def guardar_socket(request):
    """Crea un socket nuevo, o lo actualiza si se envía 'id_socket_available'."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "sockets/guardar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        data = request.data
        id_socket_available = data.get('id_socket_available')
        socket_valor = (data.get('socket') or '').strip()

        if not socket_valor:
            return JsonResponse({'error': "El campo 'socket' es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        defaults = {
            'socket': socket_valor,
            'descripcion': (data.get('descripcion') or '').strip(),
            'is_active': bool(data.get('is_active', True)),
        }

        if id_socket_available:
            socket_obj = SocketAvailable.objects.filter(id_socket_available=id_socket_available).first()
            if not socket_obj:
                return JsonResponse({'error': 'Socket no encontrado'}, status=status.HTTP_404_NOT_FOUND)
            for campo, valor in defaults.items():
                setattr(socket_obj, campo, valor)
            socket_obj.save()
        else:
            socket_obj, _creado = SocketAvailable.objects.update_or_create(
                socket=socket_valor,
                defaults=defaults,
            )

        return JsonResponse({
            'mensaje': 'Socket guardado correctamente',
            'socket': _serializar_socket(socket_obj),
        }, status=status.HTTP_200_OK)

    except IntegrityError:
        return JsonResponse({'error': 'Ya existe un socket con ese valor'}, status=status.HTTP_409_CONFLICT)
    except Exception as e:
        _log_warn(f"Error al guardar socket: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al guardar el socket'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST', 'DELETE'])
def eliminar_socket(request):
    """Elimina un socket del catálogo (en cascada elimina sus roles asociados)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "sockets/eliminar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        id_socket_available = request.data.get('id_socket_available') or request.GET.get('id_socket_available')
        if not id_socket_available:
            return JsonResponse(
                {'error': "El campo 'id_socket_available' es requerido"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        borrados, _detalle = SocketAvailable.objects.filter(id_socket_available=id_socket_available).delete()
        if not borrados:
            return JsonResponse({'error': 'Socket no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return JsonResponse({'mensaje': 'Socket eliminado correctamente'}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al eliminar socket: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al eliminar el socket'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['GET'])
def listar_sockets_roles(request):
    """
    Lista las asignaciones socket-rol (tabla SocketAvailableRole), con filtros
    opcionales. Igual que en endpoints, parte del catálogo de roles para que
    los roles sin sockets también aparezcan, con los campos de socket en null.
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "sockets/roles")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        sockets_rol_queryset = SocketAvailableRole.objects.select_related('socket')

        id_socket_available = request.GET.get('id_socket_available')
        if id_socket_available:
            sockets_rol_queryset = sockets_rol_queryset.filter(socket__id_socket_available=id_socket_available)

        is_active = _bool_param(request, 'is_active')
        if is_active is not None:
            sockets_rol_queryset = sockets_rol_queryset.filter(is_active=is_active)

        sockets_rol_queryset = sockets_rol_queryset.order_by('socket__socket')

        roles_queryset = Rol.objects.prefetch_related(
            Prefetch('socketavailablerole_set', queryset=sockets_rol_queryset, to_attr='sockets_filtrados')
        )

        id_rol = request.GET.get('id_rol')
        if id_rol:
            roles_queryset = roles_queryset.filter(id_rol=id_rol)

        data = []
        for rol in roles_queryset.order_by('id_rol'):
            if rol.sockets_filtrados:
                data.extend(_serializar_socket_rol(sr) for sr in rol.sockets_filtrados)
            else:
                data.append(_serializar_rol_sin_socket(rol))

        return JsonResponse({'sockets_roles': data}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al listar sockets_roles: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al listar los roles de sockets'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def guardar_socket_rol(request):
    """
    Asigna un rol a un socket. Si se envía 'id_socket_available_role' se
    actualiza ese registro; si no, se crea (o reutiliza) la asignación para el
    par socket/rol.
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "sockets/roles/guardar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        data = request.data
        id_socket_available_role = data.get('id_socket_available_role')
        id_socket_available = data.get('id_socket_available')
        id_rol = data.get('id_rol')
        is_active = bool(data.get('is_active', True))

        if id_socket_available_role:
            socket_rol_obj = SocketAvailableRole.objects.filter(
                id_socket_available_role=id_socket_available_role
            ).first()
            if not socket_rol_obj:
                return JsonResponse({'error': 'Registro no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            if id_socket_available:
                socket_obj = SocketAvailable.objects.filter(id_socket_available=id_socket_available).first()
                if not socket_obj:
                    return JsonResponse({'error': 'Socket no encontrado'}, status=status.HTTP_404_NOT_FOUND)
                socket_rol_obj.socket = socket_obj

            if id_rol:
                rol_obj = Rol.objects.filter(id_rol=id_rol).first()
                if not rol_obj:
                    return JsonResponse({'error': 'Rol no encontrado'}, status=status.HTTP_404_NOT_FOUND)
                socket_rol_obj.rol = rol_obj

            socket_rol_obj.is_active = is_active
            socket_rol_obj.save()
        else:
            if not id_socket_available or not id_rol:
                return JsonResponse(
                    {'error': "Los campos 'id_socket_available' e 'id_rol' son requeridos"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            socket_obj = SocketAvailable.objects.filter(id_socket_available=id_socket_available).first()
            if not socket_obj:
                return JsonResponse({'error': 'Socket no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            rol_obj = Rol.objects.filter(id_rol=id_rol).first()
            if not rol_obj:
                return JsonResponse({'error': 'Rol no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            socket_rol_obj, _creado = SocketAvailableRole.objects.update_or_create(
                socket=socket_obj,
                rol=rol_obj,
                defaults={'is_active': is_active},
            )

        return JsonResponse({
            'mensaje': 'Rol de socket guardado correctamente',
            'socket_role': _serializar_socket_rol(socket_rol_obj),
        }, status=status.HTTP_200_OK)

    except IntegrityError:
        return JsonResponse({'error': 'Ese rol ya está asignado al socket'}, status=status.HTTP_409_CONFLICT)
    except Exception as e:
        _log_warn(f"Error al guardar socket_role: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al guardar el rol del socket'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST', 'DELETE'])
def eliminar_socket_rol(request):
    """Elimina una asignación de rol a un socket (tabla SocketAvailableRole)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "sockets/roles/eliminar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        id_socket_available_role = (
            request.data.get('id_socket_available_role') or request.GET.get('id_socket_available_role')
        )
        if not id_socket_available_role:
            return JsonResponse(
                {'error': "El campo 'id_socket_available_role' es requerido"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        borrados, _detalle = SocketAvailableRole.objects.filter(
            id_socket_available_role=id_socket_available_role
        ).delete()
        if not borrados:
            return JsonResponse({'error': 'Registro no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return JsonResponse({'mensaje': 'Rol de socket eliminado correctamente'}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al eliminar socket_role: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al eliminar el rol del socket'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


def _serializar_organizacion(organizacion_obj):
    return {
        'id_external_organization': str(organizacion_obj.id_external_organization),
        'name': organizacion_obj.name,
    }


def _serializar_endpoint_externo(external_endpoint_obj):
    return {
        'id_external_endpoint': str(external_endpoint_obj.id_external_endpoint),
        'id_endpoint': str(external_endpoint_obj.endpoint_id),
        'endpoint': external_endpoint_obj.endpoint.endpoint,
        'id_external_organization': str(external_endpoint_obj.organizacion_id),
        'organizacion': external_endpoint_obj.organizacion.name,
    }


@csrf_exempt
@api_view(['GET'])
def listar_organizaciones(request):
    """Lista las organizaciones externas (tabla ExternalOrganization)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "organizaciones-externas")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        queryset = ExternalOrganization.objects.all()

        filtro = (request.GET.get('filtro') or '').strip()
        if filtro:
            queryset = queryset.filter(name__icontains=filtro)

        data = [_serializar_organizacion(o) for o in queryset.order_by('name')]
        return JsonResponse({'organizaciones': data}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al listar organizaciones externas: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al listar las organizaciones externas'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def guardar_organizacion(request):
    """Crea una organización externa nueva, o la renombra si se envía 'id_external_organization'."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "organizaciones-externas/guardar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        data = request.data
        id_external_organization = data.get('id_external_organization')
        nombre = (data.get('name') or '').strip()

        if not nombre:
            return JsonResponse({'error': "El campo 'name' es requerido"}, status=status.HTTP_400_BAD_REQUEST)

        if id_external_organization:
            organizacion_obj = ExternalOrganization.objects.filter(
                id_external_organization=id_external_organization
            ).first()
            if not organizacion_obj:
                return JsonResponse({'error': 'Organización no encontrada'}, status=status.HTTP_404_NOT_FOUND)
            organizacion_obj.name = nombre
            organizacion_obj.save()
        else:
            organizacion_obj, _creada = ExternalOrganization.objects.update_or_create(
                name=nombre,
                defaults={},
            )

        return JsonResponse({
            'mensaje': 'Organización guardada correctamente',
            'organizacion': _serializar_organizacion(organizacion_obj),
        }, status=status.HTTP_200_OK)

    except IntegrityError:
        return JsonResponse({'error': 'Ya existe una organización con ese nombre'}, status=status.HTTP_409_CONFLICT)
    except Exception as e:
        _log_warn(f"Error al guardar organización externa: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al guardar la organización'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST', 'DELETE'])
def eliminar_organizacion(request):
    """Elimina una organización externa (en cascada elimina sus autorizaciones de endpoint)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "organizaciones-externas/eliminar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        id_external_organization = request.data.get('id_external_organization') or request.GET.get('id_external_organization')
        if not id_external_organization:
            return JsonResponse(
                {'error': "El campo 'id_external_organization' es requerido"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        borrados, _detalle = ExternalOrganization.objects.filter(
            id_external_organization=id_external_organization
        ).delete()
        if not borrados:
            return JsonResponse({'error': 'Organización no encontrada'}, status=status.HTTP_404_NOT_FOUND)

        return JsonResponse({'mensaje': 'Organización eliminada correctamente'}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al eliminar organización externa: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al eliminar la organización'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['GET'])
def listar_endpoints_externos(request):
    """Lista las autorizaciones endpoint-organización (tabla ExternalEndpoint)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "organizaciones-externas/endpoints")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        queryset = ExternalEndpoint.objects.select_related('endpoint', 'organizacion')

        id_endpoint = request.GET.get('id_endpoint')
        if id_endpoint:
            queryset = queryset.filter(endpoint__id_endpoint=id_endpoint)

        id_external_organization = request.GET.get('id_external_organization')
        if id_external_organization:
            queryset = queryset.filter(organizacion__id_external_organization=id_external_organization)

        data = [
            _serializar_endpoint_externo(ee)
            for ee in queryset.order_by('organizacion__name', 'endpoint__endpoint')
        ]
        return JsonResponse({'endpoints_externos': data}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al listar endpoints externos: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al listar los endpoints externos'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST'])
def guardar_endpoint_externo(request):
    """
    Autoriza un endpoint para una organización externa. Sin 'id_external_endpoint'
    crea (o reutiliza) la autorización para el par endpoint/organización; con
    'id_external_endpoint' reasigna ese registro puntual.
    """
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "organizaciones-externas/endpoints/guardar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        data = request.data
        id_external_endpoint = data.get('id_external_endpoint')
        id_endpoint = data.get('id_endpoint')
        id_external_organization = data.get('id_external_organization')

        if id_external_endpoint:
            external_endpoint_obj = ExternalEndpoint.objects.filter(
                id_external_endpoint=id_external_endpoint
            ).first()
            if not external_endpoint_obj:
                return JsonResponse({'error': 'Registro no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            if id_endpoint:
                endpoint_obj = Endpoint.objects.filter(id_endpoint=id_endpoint).first()
                if not endpoint_obj:
                    return JsonResponse({'error': 'Endpoint no encontrado'}, status=status.HTTP_404_NOT_FOUND)
                external_endpoint_obj.endpoint = endpoint_obj

            if id_external_organization:
                organizacion_obj = ExternalOrganization.objects.filter(
                    id_external_organization=id_external_organization
                ).first()
                if not organizacion_obj:
                    return JsonResponse({'error': 'Organización no encontrada'}, status=status.HTTP_404_NOT_FOUND)
                external_endpoint_obj.organizacion = organizacion_obj

            external_endpoint_obj.save()
        else:
            if not id_endpoint or not id_external_organization:
                return JsonResponse(
                    {'error': "Los campos 'id_endpoint' e 'id_external_organization' son requeridos"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            endpoint_obj = Endpoint.objects.filter(id_endpoint=id_endpoint).first()
            if not endpoint_obj:
                return JsonResponse({'error': 'Endpoint no encontrado'}, status=status.HTTP_404_NOT_FOUND)

            organizacion_obj = ExternalOrganization.objects.filter(
                id_external_organization=id_external_organization
            ).first()
            if not organizacion_obj:
                return JsonResponse({'error': 'Organización no encontrada'}, status=status.HTTP_404_NOT_FOUND)

            external_endpoint_obj, _creado = ExternalEndpoint.objects.get_or_create(
                endpoint=endpoint_obj,
                organizacion=organizacion_obj,
            )

        return JsonResponse({
            'mensaje': 'Endpoint externo guardado correctamente',
            'endpoint_externo': _serializar_endpoint_externo(external_endpoint_obj),
        }, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al guardar endpoint externo: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al guardar el endpoint externo'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@csrf_exempt
@api_view(['POST', 'DELETE'])
def eliminar_endpoint_externo(request):
    """Revoca la autorización de una organización sobre un endpoint (tabla ExternalEndpoint)."""
    resultado_auth = _autenticar_y_obtener_usuario(request)
    if isinstance(resultado_auth, JsonResponse):
        return resultado_auth
    resultado_rol = _autorizar_gestion_gateway(request, resultado_auth, "organizaciones-externas/endpoints/eliminar")
    if isinstance(resultado_rol, JsonResponse):
        return resultado_rol

    try:
        id_external_endpoint = request.data.get('id_external_endpoint') or request.GET.get('id_external_endpoint')
        if not id_external_endpoint:
            return JsonResponse(
                {'error': "El campo 'id_external_endpoint' es requerido"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        borrados, _detalle = ExternalEndpoint.objects.filter(id_external_endpoint=id_external_endpoint).delete()
        if not borrados:
            return JsonResponse({'error': 'Registro no encontrado'}, status=status.HTTP_404_NOT_FOUND)

        return JsonResponse({'mensaje': 'Endpoint externo eliminado correctamente'}, status=status.HTTP_200_OK)

    except Exception as e:
        _log_warn(f"Error al eliminar endpoint externo: {str(e)}", level="error", exc_info=True)
        return JsonResponse({'error': 'Error al eliminar el endpoint externo'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


#@rate_limit(
#    scope="gateway-proxy",
#    max_attempts=120,
#    window_seconds=60,
#    lock_seconds=300,
#    identify=_proxy_rate_limit_ident,
#    json_identity_fields=(),
#    error_message="Demasiadas peticiones al gateway. Intenta más tarde.",
#)
@csrf_exempt
def proxy(request, path):
    """
    Punto de entrada único del gateway hacia los distintos backends (BK_API).

    Flujo:
        1. Resuelve el backend (header BK-Service) y sanitiza el path recibido.
        2. Verifica si el endpoint está marcado como público en el catálogo
           (tabla Endpoint, campo `public`). Si existe y es público, se
           bypassea por completo la autenticación JWT y la validación de rol.
        3. Si no es público, autentica al usuario vía JWT y valida que su rol
           tenga permiso explícito sobre el endpoint solicitado.
        4. Reenvía la petición al backend y devuelve la respuesta al cliente.
    """
    _log_warn("Entra al gateway", level="info")
    try:
        resultado_backend = _resolver_backend_y_ruta(request, path)
        if isinstance(resultado_backend, JsonResponse):
            return resultado_backend
        bk_service, safe_path = resultado_backend

        api_url = _construir_url_backend(bk_service, safe_path, request.GET.urlencode())
        _log_warn(f"Llamando a backend: {api_url}", level="info")

        id_usuario = None
        rol_instance = None

        # Bypass: si el endpoint existe en el catálogo de interoperbilidad
        # o está marcado como público, (es decir no exige autenticación()
        # no se exige token de autorización ni validación de rol.
        # Se normaliza igual que en `_validar_permiso_endpoint` (prefijo
        # bk_service + segmentos dinámicos reemplazados) porque así es como
        # queda guardado `Endpoint.endpoint` en el catálogo; comparar contra
        # el safe_path crudo nunca matchea.
        endpoint_normalizado = _normalizar_ruta_endpoint(f"{bk_service}/{safe_path}")

        if ExternalAuthService.validate_external_endpoint(request, endpoint_normalizado):
            _log_warn(f"Endpoint externo permitido, se omite autenticación y validación de rol: {bk_service}/{safe_path}", level="info")
        elif _endpoint_es_publico(bk_service, safe_path):
            _log_warn(f"Endpoint público, se omite autenticación y validación de rol: {bk_service}/{safe_path}", level="info")
        else:
            resultado_auth = _autenticar_y_obtener_usuario(request)
            if isinstance(resultado_auth, JsonResponse):
                return resultado_auth
            id_usuario = resultado_auth
            # Lo lee LoggerMiddlewareDatabase; nunca se toma del header del cliente
            request.pato_id = id_usuario

            resultado_rol = _validar_permiso_endpoint(request, bk_service, safe_path, id_usuario)
            if isinstance(resultado_rol, JsonResponse):
                return resultado_rol
            rol_instance = resultado_rol
            

        return _reenviar_a_backend(request, api_url, id_usuario, rol_instance, bk_service, safe_path)

    except Exception as e:
        _log_warn(f"Error inesperado en proxy: {type(e).__name__}", level="error", exc_info=True)
        return JsonResponse({"error": "Error interno del servidor"}, status=status.HTTP_400_BAD_REQUEST)

@csrf_exempt
@api_view(['POST'])
@jwt_required
def historico_ser(request):
    # x_internal_token = request.headers.get("X-Internal-Token")
    # if config("INTERNAL_SERVICE_TOKEN") != x_internal_token and config("ENVIRONMENT") == "prod":
    #     return JsonResponse({"error": "No autorizado"}, status=status.HTTP_401_UNAUTHORIZED)

    try:
        # Obtener los datos de la solicitud POST (JSON)
        data = json.loads(request.body)
        identificacion = data.get('identificacion')
        tipo = data.get('tipo')
        
        # Validar que ambos parámetros fueron enviados
        if not identificacion or not tipo:
            return JsonResponse({"error": "Faltan los parámetros identificacion o tipo."}, status=status.HTTP_400_BAD_REQUEST)
        
        # Construir la URL en función del valor de tipo
        if tipo == 'nuip':
            url = 'https://ecosistemapruebas.unp.gov.co/hser/consulta-hser/'
            payload = {"cedula": identificacion}

        elif tipo == 'ot':
            url = 'https://ecosistemapruebas.unp.gov.co/hser/consulta-hser-ot/'
            payload = {"ot": identificacion}

        else:
            return JsonResponse({"error": "Tipo inválido. Debe ser 'nuip' o 'ot'."}, status=status.HTTP_400_BAD_REQUEST)

        response = requests.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        # Si la API externa responde con éxito, devolver la respuesta
        if response.status_code == 200:
            return JsonResponse(response.json(), safe=False, status=status.HTTP_200_OK)
        else:
            return JsonResponse({"error": "Error al consultar la API externa."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
