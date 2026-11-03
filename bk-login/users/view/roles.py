import hashlib
import json
import threading
import time

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
from django.db.models import CharField, Count, OuterRef, Q, Subquery
from django.db.models.functions import Cast
from users.models.models_global import DatosBasicosUsuario, DatosContactoUsuario, PerfilUsuario
from users.models.models_static import Dependencia, Grupo, Rol
from django.contrib.auth.models import User
from utils.logger_generico import _log_warn
from utils.save_data import *
from rest_framework import viewsets
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from functools import wraps
from rest_framework.decorators import api_view
from rest_framework.renderers import JSONRenderer
from users.serializer.serializer_get import ApiConsultarRolesPerfil
from utils.logger_generico import _log_warn

@csrf_exempt
def get_role_range(request):
    if request.method == 'GET':
        try:
            id_grupo = request.GET.get('grupo')
            if id_grupo is None:
                return JsonResponse({'error': 'Falta el parámetro grupo'}, status=400)

            id_grupo = int(id_grupo)

            for start, end, nombre_grupo, grupo_id in ROLE_GROUP_RANGES:
                if grupo_id == id_grupo:
                    return JsonResponse({
                        'start': start,
                        'end': end,
                        'grupo': nombre_grupo,
                        'id_grupo': grupo_id,
                    })

            return JsonResponse({'error': 'No existe un rango para el id_grupo'}, status=404)
        except ValueError:
            return JsonResponse({'error': 'El parámetro grupo debe ser un número entero'}, status=400)
        except Exception as e:
            return JsonResponse({'error': f'Error al consultar el rango de roles: {str(e)}'}, status=400)

@api_view(['POST'])
@csrf_exempt 
def get_role_by_user_id(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            id_usuario = data.get('id_usuario')
            _log_warn(id_usuario, level="debug")

            basicos_usuario = DatosBasicosUsuario.objects.filter(id_busuario = id_usuario).first()
            if not basicos_usuario:
                return JsonResponse({'error': 'Usuario no encontrado'}, status=404)

            perfiles = PerfilUsuario.objects.filter(basicos_usuario = basicos_usuario.id_busuario, activo = True)

            resultado = []
            for perfil in perfiles:
                if perfil.rol:
                    resultado.append({
                        'id_rol': perfil.rol.id_rol,
                        'grupo_id': perfil.rol.Grupo.id_grupo
                    })

            if not resultado:
                return JsonResponse({'error': 'No se encontraron roles para este usuario'}, status=404)

            return JsonResponse({
                # 'nombre_usuario': basicos_usuario.nombre_persona.primer_nombre + ' ' + ((basicos_usuario.nombre_persona.segundo_nombre + ' ') or '') + basicos_usuario.nombre_persona.segundo_apellido + ((' ' + basicos_usuario.nombre_persona.segundo_apellido) or ''),
                'roles': resultado
            })
        
        except ValueError:
            return JsonResponse({'error': 'El parámetro grupo debe ser un número entero'}, status=400)
        except Exception as e:
            return JsonResponse({'error': f'Error al consultar el rango de roles: {str(e)}'}, status=400)

@api_view(['GET'])
@csrf_exempt 
def get_users_by_rol(request, id_rol=None):
    if request.method == 'GET':
        try:
            # Prefer URL parameter when provided; keep query param support for backward compatibility.
            id_rol = id_rol if id_rol is not None else request.GET.get('id_rol')
            if id_rol is None:
                return JsonResponse({'error': 'Falta el parámetro id_rol'}, status=400)

            id_rol = int(id_rol)

            perfiles = PerfilUsuario.objects.filter(rol = id_rol, activo = True)

            resultado = []
            for perfil in perfiles:
                if perfil.rol:
                    resultado.append(str(perfil.basicos_usuario.id_busuario))

            if not resultado:
                return JsonResponse({'error': 'No se encontraron usuarios para este rol'}, status=404)

            return JsonResponse({
                'usuarios': resultado
            })
        
        except ValueError:
            return JsonResponse({'error': 'El parámetro rol debe ser un número entero'}, status=400)
        except Exception as e:
            return JsonResponse({'error': f'Error al consultar usuarios: {str(e)}'}, status=400)

ROLE_GROUP_RANGES = [
    (1000, 1099, 'Subdirección', 1000),
    (1100, 1199, 'GRAERR', 1001),
    (1200, 1299, 'GISFM', 1002),
    (1300, 1399, 'GA', 1003),
    (1400, 1499, 'GCSP', 1004),
    (1500, 1599, 'GGVT', 1005),
    (1600, 1699, 'GETH', 1006),
    (1700, 1799, 'GPS', 1007),

    (2000, 2099, 'Subdirección', 2000),
    (2100, 2199, 'GAEP', 2001),
    (2200, 2299, 'CTAR', 2002),
    (2300, 2399, 'CERREM', 2003),
    (2400, 2499, 'CTARC', 2004),
    (2500, 2599, 'CERREMC', 2005),

    (3000, 3099, 'Subdirección', 3000),
    (3100, 3199, 'GI', 3001),
    (3200, 3299, 'GHP', 3002),
    (3300, 3399, 'GSE', 3003),
    (3400, 3499, 'GARO', 3004),
    (3500, 3599, 'GCTV', 3005),
    (3600, 3699, 'GDMP', 3006),
    (3700, 3799, 'GRVP', 3007),
    (3800, 3899, 'GCDEP', 3008),
    (3900, 3999, 'GURP', 3009),

    (4000, 4099, 'Subdirección', 4000),
    (4100, 4199, 'GES', 4001),
    (4200, 4299, 'GNPS', 4002),
    (4300, 4399, 'GRC', 4003),
    (4400, 4499, 'GC', 4004),
    (4500, 4599, 'GSSTBI', 4005),

    (5000, 5089, 'Subdirección', 5000),
    (5910, 5954, 'GCA', 5001),
    (5090, 5179, 'GP', 5002),
    (5180, 5269, 'GT', 5003),
    (5270, 5359, 'GC', 5004),
    (5360, 5459, 'GCB', 5005),
    (5550, 5639, 'GCDI', 5006),
    (5460, 5549, 'GAG', 5007),
    (5640, 5729, 'GCV', 5008),
    (5730, 5819, 'GGD', 5009),
    (5820, 5909, 'GAR', 5010),
    (5955, 5999, 'GCSAV', 5011),

    (6000, 6099, 'Oficina', 6000),

    (7000, 7099, 'Oficina', 7000),

    (8000, 8099, 'Oficina', 8000),
    (8100, 8199, 'GSC', 8001),
    (8200, 8299, 'GGIM', 8002),
    (8300, 8399, 'GPIGI', 8003),
    (8400, 8499, 'GGT', 8004),

    (9000, 9099, 'Dirección', 9000),
]


def post_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if request.method == 'POST':
            return view_func(request, *args, **kwargs)
        else:
            return JsonResponse({"error": "Method no Allowed"}, status=405)
    return _wrapped_view


@csrf_exempt
def GuardarRoles(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            _log_warn(data, level="debug")

            with transaction.atomic():
                id_rol = data.get('id_rol')
                nombre_rol = data.get('nombre_rol')
                url = data.get('url')
                grupo = data.get('grupo')

                grupo_obj = Grupo.objects.filter(id_grupo=grupo).last()

                rol_obj, _ = Rol.objects.update_or_create(
                    id_rol=id_rol,
                    defaults={
                        'nombre_rol': nombre_rol,
                        'url': url,
                        'Grupo': grupo_obj,
                    }
                )

                return JsonResponse({
                    'mensaje': 'Rol guardado correctamente',
                    'id': rol_obj.id_rol
                }, status=200)


        except Exception as e:
            _log_warn(f"Error al guardar los datos documental: {e}", level="error")
            return JsonResponse({'error': f'Error interno: {str(e)}'}, status=500)

    return JsonResponse({"error": "Method not allowed"}, status=405)


CONSULTAR_ROLES_PAGE_SIZE = 30
CONSULTAR_ROLES_CACHE_TTL = 60 * 60 * 2  # 2 horas
CONSULTAR_ROLES_CACHE_PREFIX = 'consultarrol:v2'
CONSULTAR_ROLES_ERROR_CACHE_TTL = 30  # errores no se cachean tanto como los resultados válidos
CONSULTAR_ROLES_LOCK_TTL = 60 * 5  # tope de seguridad si el hilo muere sin liberar el lock
CONSULTAR_ROLES_WAIT_TIMEOUT = 8  # segundos que el request espera antes de responder "processing"
CONSULTAR_ROLES_POLL_INTERVAL = 0.5


class ConsultarRolesViewSet(viewsets.ModelViewSet):
    """
    Bandeja de usuarios pendientes de rol (rol__id_rol = 9999).

    Filtros soportados por querystring:
      - dependencia: id_dependencia
      - grupo: id_grupo
      - filtro: texto libre buscado (OR) sobre Usuario, Id, Correo
        institucional, F. de ingreso, Nombre completo, Tipo de
        identificación y Número de identificación.
      - page: número de página (30 registros por página).

    La respuesta de cada combinación de filtros se cachea 2 horas.

    La consulta (potencialmente lenta) se ejecuta en un hilo en segundo
    plano, desacoplada del request HTTP que la disparó: si el cliente
    se desconecta o el proxy/gateway agota su timeout antes de que
    termine, el hilo sigue corriendo dentro del worker y de todas
    formas cachea el resultado para que la siguiente consulta con los
    mismos filtros sea inmediata. Un lock en Redis evita que dos
    requests concurrentes con los mismos filtros disparen la misma
    consulta dos veces.
    """
    http_method_names = ['get']
    renderer_classes = [JSONRenderer]
    lookup_value_regex = '[0-9a-f-]{36}'

    def retrieve(self, request, *args, **kwargs):
        # Solo se expone la acción de listado (filtrado/paginado/cacheado).
        return Response({
            'status': 'Error',
            'message': 'Acción no soportada, use el listado con filtros.'
        }, status=405)

    def get_queryset(self):
        dependencia = self.request.query_params.get('dependencia')
        grupo = self.request.query_params.get('grupo')
        filtro = (self.request.query_params.get('filtro') or '').strip()
        return self._get_queryset_filtrado(dependencia, grupo, filtro)

    def _get_queryset_filtrado(self, dependencia, grupo, filtro):
        # No depende de self.request: se puede invocar desde el hilo en
        # segundo plano una vez terminó el ciclo del request original.
        queryset = PerfilUsuario.objects.filter(rol__id_rol=9999).select_related(
            'user',
            'dependencia',
            'grupo',
            'basicos_usuario',
            'basicos_usuario__nombre_persona',
            'basicos_usuario__identificacion_usuario',
            'basicos_usuario__identificacion_usuario__tipo_identificacion',
        )

        if dependencia:
            queryset = queryset.filter(dependencia__id_dependencia=dependencia)
        if grupo:
            queryset = queryset.filter(grupo__id_grupo=grupo)

        # Un usuario con más de un perfil se excluye (mismo criterio que la
        # versión anterior), pero resuelto en BD con una subconsulta en vez
        # de una consulta extra por cada fila de la página.
        # conteo_perfiles = PerfilUsuario.objects.filter(
        #     basicos_usuario=OuterRef('basicos_usuario')
        # ).values('basicos_usuario').annotate(total=Count('id_pusuario')).values('total')
        # queryset = queryset.annotate(
        #     total_perfiles_usuario=Subquery(conteo_perfiles)
        # ).filter(total_perfiles_usuario=1)

        if filtro:
            queryset = self._filtrar_por_texto_libre(queryset, filtro)

        return queryset.order_by('id_pusuario')

    def _filtrar_por_texto_libre(self, queryset, filtro):
        # object_id en DatosContactoUsuario guarda str(id_busuario); se
        # resuelve en una consulta aparte para evitar mezclar tipos
        # (uuid vs texto) en un único JOIN/subquery.
        correo_object_ids = list(
            DatosContactoUsuario.objects.filter(
                id_ccelectronico__correo_electronico__icontains=filtro
            ).values_list('object_id', flat=True)
        )

        queryset = queryset.annotate(
            id_pusuario_texto=Cast('id_pusuario', CharField()),
            fecha_actualizacion_texto=Cast('fecha_actualizacion', CharField()),
        )

        return queryset.filter(
            Q(user__username__icontains=filtro)
            | Q(id_pusuario_texto__icontains=filtro)
            | Q(fecha_actualizacion_texto__icontains=filtro)
            | Q(basicos_usuario__nombre_persona__primer_nombre__icontains=filtro)
            | Q(basicos_usuario__nombre_persona__segundo_nombre__icontains=filtro)
            | Q(basicos_usuario__nombre_persona__primer_apellido__icontains=filtro)
            | Q(basicos_usuario__nombre_persona__segundo_apellido__icontains=filtro)
            | Q(basicos_usuario__identificacion_usuario__tipo_identificacion__nombre_tidentificacion__icontains=filtro)
            | Q(basicos_usuario__identificacion_usuario__numero_identificacion__icontains=filtro)
            | Q(basicos_usuario_id__in=correo_object_ids)
        )

    @staticmethod
    def _build_correo_map(perfiles):
        basicos_ids = [str(p.basicos_usuario_id) for p in perfiles if p.basicos_usuario_id]
        if not basicos_ids:
            return {}

        correo_map = {}
        contactos = DatosContactoUsuario.objects.filter(
            object_id__in=basicos_ids
        ).select_related('id_ccelectronico')
        for contacto in contactos:
            if contacto.id_ccelectronico:
                correo_map[contacto.object_id] = contacto.id_ccelectronico.correo_electronico
        return correo_map

    @staticmethod
    def _build_cache_key(dependencia, grupo, filtro, page):
        raw_key = json.dumps({
            'dependencia': dependencia,
            'grupo': grupo,
            'filtro': filtro.lower(),
            'page': str(page),
        }, sort_keys=True)
        digest = hashlib.md5(raw_key.encode('utf-8')).hexdigest()
        return f'{CONSULTAR_ROLES_CACHE_PREFIX}:{digest}'

    def _calcular_y_cachear(self, cache_key, lock_key, dependencia, grupo, filtro, page):
        _log_warn(f"Esto es un hilo separado correspondiente a: {cache_key} y lock_key: {lock_key}")
        """
        Ejecuta la consulta pesada y guarda el resultado (o el error) en
        caché. Corre en un hilo aparte, así que sigue vivo aunque el
        worker ya haya respondido al request que lo disparó o el
        cliente se haya desconectado.
        """
        try:
            queryset = self._get_queryset_filtrado(dependencia, grupo, filtro)
            paginator = Paginator(queryset, CONSULTAR_ROLES_PAGE_SIZE)

            try:
                perfiles_pagina = paginator.page(page)
            except (PageNotAnInteger, EmptyPage):
                cache.set(cache_key, {
                    'status': 'Error',
                    'message': 'El parámetro page debe ser un número de página válido'
                }, CONSULTAR_ROLES_ERROR_CACHE_TTL)
                return

            perfiles = list(perfiles_pagina.object_list)
            correo_map = self._build_correo_map(perfiles)

            data = [
                ApiConsultarRolesPerfil(perfil, context={'correo_map': correo_map}).data
                for perfil in perfiles
            ]

            response_data = {
                'perfiles': data,
                'pagination': {
                    'page': perfiles_pagina.number,
                    'per_page': CONSULTAR_ROLES_PAGE_SIZE,
                    'total_pages': paginator.num_pages,
                    'total_records': paginator.count,
                    'has_next': perfiles_pagina.has_next(),
                    'has_previous': perfiles_pagina.has_previous(),
                }
            }

            cache.set(cache_key, response_data, CONSULTAR_ROLES_CACHE_TTL)
            _log_warn(f"Se logro cachear con la key: {cache_key}")

        except Exception as e:
            _log_warn(f'Error calculando consultarrol en background (cache_key={cache_key})', level="error", exc_info=True)
            cache.set(cache_key, {
                'status': 'Error',
                'message': f'Error en la consulta: {str(e)}'
            }, CONSULTAR_ROLES_ERROR_CACHE_TTL)
        finally:
            cache.delete(lock_key)
            connection.close()

    def list(self, request, *args, **kwargs):
        dependencia = (request.query_params.get('dependencia') or '').strip()
        grupo = (request.query_params.get('grupo') or '').strip()
        filtro = (request.query_params.get('filtro') or '').strip()
        page = request.query_params.get('page', 1)

        cache_key = self._build_cache_key(dependencia, grupo, filtro, page)
        _log_warn(f"Consultando roles con cache_key: {cache_key}")
        
        cached_response = cache.get(cache_key)
        _log_warn(f"cached_response: {cached_response} para cache_key: {cache_key} del tipo {type(cached_response)}")
        
        if isinstance(cached_response, str):
            cached_response = json.loads(cached_response)
        
        
        
        if cached_response is not None:
            return self._response_desde_cache(cached_response)

        # cache.add es atómico en Redis: solo un request gana el lock y
        # dispara el cálculo; el resto solo espera/consulta el caché.
        lock_key = f'{cache_key}:lock'
        adquirido = cache.add(lock_key, 1, CONSULTAR_ROLES_LOCK_TTL)
        if adquirido:
            threading.Thread(
                target=self._calcular_y_cachear,
                args=(cache_key, lock_key, dependencia, grupo, filtro, page),
                daemon=True,
            ).start()

        waited = 0.0
        while waited < CONSULTAR_ROLES_WAIT_TIMEOUT:
            time.sleep(CONSULTAR_ROLES_POLL_INTERVAL)
            waited += CONSULTAR_ROLES_POLL_INTERVAL
            cached_response = cache.get(cache_key)
            if cached_response is not None:
                return self._response_desde_cache(cached_response)

        return Response({
            'status': 'processing',
            'message': 'La consulta se está procesando, reintente en unos segundos.'
        }, status=202)

    @staticmethod
    def _response_desde_cache(cached_response):
        return JsonResponse(cached_response)
