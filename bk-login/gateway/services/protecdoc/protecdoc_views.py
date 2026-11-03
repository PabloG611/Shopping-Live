import json
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from decouple import config

from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status

from api.decorators.jwt_decorator import jwt_required
from gateway.services.protecdoc import protecdoc_client
from utils.logger_generico import _log_warn

_MEDIO_RECEPCION = 'ME-RECEECO'

_TIPO_COMUNICACION = {
    'EXT': 'EE',
    'MEM': 'SI',
    'OFI': 'SE',
}

_DEPENDENCIA_MAP = {
    'GGD': {'requestSubsection': '1290', 'requestSection': '1200'},
    'DER':  {'requestSubsection': '1033', 'requestSection': '1030'},
    'SESP': {'requestSubsection': '1810', 'requestSection': '1800'},
    'GCDI': {'requestSubsection': '1260', 'requestSection': '1200'},
}


def _normalizar_nombre(nombre: str) -> str:
    partes = nombre.rsplit('.', 1)
    base = unicodedata.normalize('NFKD', partes[0])
    base = ''.join(c for c in base if not unicodedata.combining(c))
    base = re.sub(r'[^a-z0-9]+', '_', base.lower()).strip('_')
    return f'{base}.{partes[1].lower()}' if len(partes) > 1 else base


@csrf_exempt
def radicado(request):
    if request.method != 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)
    
    x_internal_token = request.headers.get("X-Internal-Token")

    if config("INTERNAL_SERVICE_TOKEN") != x_internal_token and config("ENVIRONMENT") == "prod":
        return JsonResponse({'error': 'No autorizado'}, status=status.HTTP_401_UNAUTHORIZED)

    dependencia = request.POST.get('dependencia', '').upper()
    if dependencia not in _DEPENDENCIA_MAP:
        return JsonResponse(
            {'error': f'dependencia inválida: "{dependencia}". Valores válidos: GGD, DER, SESP, GCDI'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    person_type = request.POST.get('personType', 'natural').lower()

    base_required = ['asunto']
    if person_type == 'anonima':
        required_fields = base_required + ['email']
    elif person_type == 'juridica':
        required_fields = base_required + [
            'numero_identificacion', 'nombres',
            'direccion', 'celular', 'email', 'departamento', 'municipio',
            'nit', 'razon_social',
        ]
    else:  # natural
        required_fields = base_required + [
            'numero_identificacion', 'nombres',
            'direccion', 'celular', 'email', 'departamento', 'municipio',
        ]

    missing = [f for f in required_fields if not request.POST.get(f)]
    if missing:
        return JsonResponse(
            {'error': f'Campos requeridos faltantes: {", ".join(missing)}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    uploaded_files = request.FILES.getlist('files')
    if not uploaded_files:
        return JsonResponse({'error': 'Se requiere al menos un archivo en files'}, status=status.HTTP_400_BAD_REQUEST)

    now = datetime.now(tz=timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    dep = _DEPENDENCIA_MAP[dependencia]

    if person_type == 'anonima':
        agent = {
            'agentType': 'TP-AGER',
            'personType': 'TP-PERA',
            'person': {
                'contactList': [
                    {'email': request.POST['email'], 'principal': True},
                ],
            },
        }
    elif person_type == 'juridica':
        agent = {
            'agentType': 'TP-AGER',
            'identificationNumber': request.POST['numero_identificacion'],
            'name': request.POST['nombres'],
            'personType': 'TP-PERPJ',
            'person': {
                'identificationType': 'TP-DOCN',
                'nit': request.POST['nit'],
                'razonSocial': request.POST['razon_social'],
                'conEnCalidad': 'TP-ACCR',
                'contactList': [
                    {
                        'address': request.POST['direccion'],
                        'cellphone': request.POST['celular'],
                        'email': request.POST['email'],
                        'country': 'COL',
                        'department': request.POST['departamento'],
                        'municipality': request.POST['municipio'],
                        'codTipoContacto': 'TP-CONO',
                        'principal': True,
                    }
                ],
            },
        }
    else:  # natural
        agent = {
            'agentType': 'TP-AGER',
            'identificationNumber': request.POST['numero_identificacion'],
            'name': request.POST['nombres'],
            'personType': 'TP-PERPN',
            'person': {
                'identificationType': request.POST.get('tipo_identificacion', 'TP-DOCCC'),
                'contactList': [
                    {
                        'address': request.POST['direccion'],
                        'cellphone': request.POST['celular'],
                        'email': request.POST['email'],
                        'country': 'COL',
                        'department': request.POST['departamento'],
                        'municipality': request.POST['municipio'],
                        'codTipoContacto': 'TP-CONC',
                        'principal': True,
                    }
                ],
            },
        }

    metadata = {
        'correspondence': {
            'electronicDistribution': True,
            'dateRequest': now,
            'dateDocument': now,
            'physicDistribution': True,
            'requestSubsection': '1290',    # Por default el grupo de gestión documental
            'receptionChannel': _MEDIO_RECEPCION,
            'documentType': 'TL-DOCCOM',
            'requestSection': '1200',    # Por default el grupo de gestión documental
            'radicationUser': 'radicacion.eco',
            'comunicationType': 'EE',
            'description': request.POST['asunto'],
        },
        'listAgents': [
            agent,
            {
                'agentType': 'TP-AGED',
                'identificationNumber': dep['requestSubsection'],
            },
        ],
        'documentList': [
            {
                'foliosNumber': 1,
                'supportTypeCode': 'TP-SOPE',
                'attachmentCode': 'ANE-OT',
                'fileName': _normalizar_nombre(f.name),
                'principal': i == 0,
            }
            for i, f in enumerate(uploaded_files)
        ],
    }

    files_payload = [('metadata', (None, json.dumps(metadata), 'application/json'))]
    for f in uploaded_files:
        files_payload.append(('files', (_normalizar_nombre(f.name), f.read(), f.content_type or 'application/octet-stream')))

    try:
        _log_warn(f'Enviando radicado a ProtecDoc, archivos: {[f.name for f in uploaded_files]}', level="info")

        response = protecdoc_client.request(
            'POST',
            '/soaint-sgd-web-api-gateway/apis/integration-gateway-api/radicado',
            files=files_payload,
        )
    except Exception as exc:
        _log_warn(f'Error en radicado ProtecDoc: {exc}', level="error")
        return JsonResponse({'error': 'Error al procesar el radicado en ProtecDoc'}, status=status.HTTP_502_BAD_GATEWAY)

    if response.status_code == 200:
        data = response.json()
        return JsonResponse({
            'nro_radicado': data.get('nroRadicado'),
            'fecha_radicado': data.get('fechaRadicacion'),
        }, status=status.HTTP_200_OK)
    
    _log_warn(f'Error en radicado ProtecDoc, status {response.status_code}: {response.content}', level="error")

    return HttpResponse(
        content=response.content,
        status=response.status_code,
        content_type=response.headers.get('Content-Type', 'application/json'),
    )


@jwt_required
@csrf_exempt
def trazabilidad(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    nro_radicado = request.GET.get('nro_radicado')
    if not nro_radicado:
        return JsonResponse({'error': 'nro_radicado requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        response = protecdoc_client.request(
            'GET',
            '/soaint-sgd-web-api-gateway/apis/tracking-gateway-api/filter',
            params={'objectId': nro_radicado, 'referred': 'true', 'status': 'true'},
        )
    except Exception as exc:
        _log_warn(f'Error en trazabilidad ProtecDoc: {exc}', level="error")
        return JsonResponse({'error': 'Error al consultar trazabilidad en ProtecDoc'}, status=status.HTTP_502_BAD_GATEWAY)

    return HttpResponse(
        content=response.content,
        status=response.status_code,
        content_type=response.headers.get('Content-Type', 'application/json'),
    )


@jwt_required
@csrf_exempt
def metadata_radicado(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    nro_radicado = request.GET.get('nro_radicado')
    if not nro_radicado:
        return JsonResponse({'error': 'nro_radicado requerido'}, status=status.HTTP_400_BAD_REQUEST)

    prefix = nro_radicado.split('-')[0].upper()
    tipo_comunicacion = _TIPO_COMUNICACION.get(prefix)
    if not tipo_comunicacion:
        return JsonResponse(
            {'error': f'Prefijo de radicado no reconocido: {prefix}. Valores válidos: EXT, MEM, OFI'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    fecha_ini = '2020-01-01'
    fecha_fin = (date.today() + timedelta(days=30)).strftime('%Y-%m-%d')

    try:
        response = protecdoc_client.request(
            'GET',
            '/soaint-sgd-web-api-gateway/apis/consulta-documentos-gateway-api/consultar-documentos',
            params={
                'fecha_ini': fecha_ini,
                'fecha_fin': fecha_fin,
                'tipo_comunicacion': tipo_comunicacion,
                'nro_radicado': nro_radicado,
            },
        )
    except Exception as exc:
        _log_warn(f'Error en metadata radicado ProtecDoc: {exc}', level="error")
        return JsonResponse({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    if response.status_code != 200:
        return HttpResponse(
            content=response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json'),
        )

    docs_list = (response.json().get('response') or {}).get('consultar-documentos') or []
    if not docs_list:
        return JsonResponse({'error': 'Radicado no encontrado'}, status=status.HTTP_404_NOT_FOUND)

    doc = docs_list[0]
    fecha_ts = doc.get('fechaRadicacion')
    fecha_radicacion = (
        datetime.utcfromtimestamp(fecha_ts / 1000).strftime('%Y-%m-%dT%H:%M:%S')
        if fecha_ts else None
    )

    return JsonResponse({
        'nro_radicado': nro_radicado,
        'fecha_radicacion': fecha_radicacion,
        'destinatario': doc.get('destinatario'),
        'nombre_remitente': doc.get('nombreRemitente'),
        'asunto': doc.get('asunto'),
    }, status=status.HTTP_200_OK)


@jwt_required
@csrf_exempt
def detalle_radicado(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    nro_radicado = request.GET.get('nro_radicado')
    if not nro_radicado:
        return JsonResponse({'error': 'nro_radicado requerido'}, status=status.HTTP_400_BAD_REQUEST)

    # Paso 1: info del radicado
    try:
        resp_radicado = protecdoc_client.request(
            'GET',
            '/soaint-sgd-web-api-gateway/apis/integration-gateway-api/radicado',
            params={'recordNumber': nro_radicado},
        )
    except Exception as exc:
        _log_warn(f'Error en detalle radicado ProtecDoc: {exc}', level="error")
        return JsonResponse({'error': str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    if resp_radicado.status_code != 200:
        return HttpResponse(
            content=resp_radicado.content,
            status=resp_radicado.status_code,
            content_type=resp_radicado.headers.get('Content-Type', 'application/json'),
        )

    data = resp_radicado.json()

    agents = data.get('listAgents') or []
    destinatario = next((a.get('name') for a in agents if a.get('agentType') == 'TP-AGED'), None)
    nombre_remitente = next((a.get('name') for a in agents if a.get('agentType') == 'TP-AGER'), None)

    radicados_asociados = [
        {
            'nro_radicado': r.get('recordNumber', '').split('--')[-1],
            'fecha_radicacion': r.get('recordDate'),
        }
        for r in (data.get('relatedRecords') or [])
    ]

    # Paso 2: documentos del radicado principal
    try:
        resp_docs = protecdoc_client.request(
            'GET',
            '/soaint-sgd-web-api-gateway/apis/consulta-documentos-gateway-api/consultar-archivos',
            params={'nroRadicado': nro_radicado},
        )
        docs_list = resp_docs.json() if resp_docs.status_code == 200 else []
    except Exception as exc:
        _log_warn(f'Error consultando documentos en detalle radicado ProtecDoc: {exc}', level="error")
        docs_list = []

    documentos = [
        {
            'id_documento': d.get('id'),
            'nombreDocumento': d.get('nombreDocumento'),
            'tipoDocumento': None,
        }
        for d in (docs_list or [])
    ]

    return JsonResponse({
        'nro_radicado': nro_radicado,
        'fecha_radicacion': data.get('recordDate'),
        'destinatario': destinatario,
        'nombre_remitente': nombre_remitente,
        'asunto': data.get('description'),
        'documentos': documentos,
        'radicados_asociados': radicados_asociados,
    }, status=status.HTTP_200_OK)


