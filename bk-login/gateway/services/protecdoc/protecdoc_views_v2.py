import base64
from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status

from gateway.services.protecdoc import protecdoc_client
from gateway.services.protecdoc.internal_auth_decorator import jwt_or_internal_token_required
from utils.logger_generico import _log_warn

_PATH_CONSULTAR_ARCHIVOS = '/soaint-sgd-web-api-gateway/apis/consulta-documentos-gateway-api/consultar-archivos'


@jwt_or_internal_token_required
@csrf_exempt
def documentos_v2(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    nro_radicado = request.GET.get('nro_radicado')
    if not nro_radicado:
        return JsonResponse({'error': 'nro_radicado requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        response = protecdoc_client.request(
            'GET',
            _PATH_CONSULTAR_ARCHIVOS,
            params={'nroRadicado': nro_radicado},
        )
    except Exception as exc:
        _log_warn(f'Error en consultar-archivos ProtecDoc v2: {exc}', level="error")
        return JsonResponse({'error': 'Error al consultar documentos en ProtecDoc'}, status=status.HTTP_502_BAD_GATEWAY)

    if response.status_code != 200:
        return HttpResponse(
            content=response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json'),
        )

    docs_list = response.json() or []
    meta = docs_list[0] if docs_list else {}

    resultado = [
        {
            'id_documento': d.get('id'),
            'nombreDocumento': d.get('nombreDocumento'),
            'tipoDocumento': None,
        }
        for d in docs_list
    ]

    destinatario = None
    nombre_remitente = None
    try:
        resp_radicado = protecdoc_client.request(
            'GET',
            '/soaint-sgd-web-api-gateway/apis/integration-gateway-api/radicado',
            params={'recordNumber': nro_radicado},
        )
        if resp_radicado.status_code == 200:
            agents = resp_radicado.json().get('listAgents') or []
            destinatario = next((a.get('name') for a in agents if a.get('agentType') == 'TP-AGED'), None)
            nombre_remitente = next((a.get('name') for a in agents if a.get('agentType') == 'TP-AGER'), None)
    except Exception as exc:
        _log_warn(f'No se pudo obtener agentes del radicado en v2/documentos: {exc}', level="warning")

    return JsonResponse({
        'nro_radicado': nro_radicado,
        'fecha_radicacion': meta.get('fechaRadicacion'),
        'destinatario': destinatario,
        'nombre_remitente': nombre_remitente,
        'asunto': meta.get('asunto'),
        'documentos': resultado,
    }, status=status.HTTP_200_OK)


@jwt_or_internal_token_required
@csrf_exempt
def descargar_documento_v2(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    id_documento = request.GET.get('id_documento')
    if not id_documento:
        return JsonResponse({'error': 'id_documento requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        response = protecdoc_client.request(
            'GET',
            _PATH_CONSULTAR_ARCHIVOS,
            params={'idEcm': id_documento, 'contenido': 'true'},
        )
    except Exception as exc:
        _log_warn(f'Error descargando documento ProtecDoc v2: {exc}', level="error")
        return JsonResponse({'error': 'Error al descargar documento de ProtecDoc'}, status=status.HTTP_502_BAD_GATEWAY)

    if response.status_code != 200:
        return HttpResponse(
            content=response.content,
            status=response.status_code,
            content_type=response.headers.get('Content-Type', 'application/json'),
        )

    items = response.json() or []
    if not items:
        return JsonResponse({'error': 'Documento no encontrado'}, status=status.HTTP_404_NOT_FOUND)

    contenido = items[0].get('contenido', '')
    if not contenido:
        return JsonResponse({'error': 'El documento no tiene contenido'}, status=status.HTTP_404_NOT_FOUND)

    # Formato: "application/pdf;charset=UTF-8;base64,<datos>"
    meta, _, b64_data = contenido.partition(',')
    content_type = meta.split(';')[0]
    file_bytes = base64.b64decode(b64_data)

    return HttpResponse(
        content=file_bytes,
        content_type=content_type,
        status=status.HTTP_200_OK,
    )
