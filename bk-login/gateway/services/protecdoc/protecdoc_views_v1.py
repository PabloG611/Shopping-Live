from datetime import date, datetime, timedelta
from urllib.parse import quote

from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status

from api.decorators.jwt_decorator import jwt_required
from gateway.services.protecdoc import protecdoc_client
from utils.logger_generico import _log_warn

_TIPO_COMUNICACION = {
    'EXT': 'EE',
    'MEM': 'SI',
    'OFI': 'SE',
}


@jwt_required
@csrf_exempt
def documentos_v1(request):
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
        paso1 = protecdoc_client.request(
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
        _log_warn(f'Error en consultar-documentos ProtecDoc v1: {exc}', level="error")
        return JsonResponse({'error': 'Error al consultar documentos en ProtecDoc'}, status=status.HTTP_502_BAD_GATEWAY)

    if paso1.status_code != 200:
        return HttpResponse(
            content=paso1.content,
            status=paso1.status_code,
            content_type=paso1.headers.get('Content-Type', 'application/json'),
        )

    docs_list = (paso1.json().get('response') or {}).get('consultar-documentos') or []
    if not docs_list:
        return JsonResponse({'documentos': []}, status=status.HTTP_200_OK)

    resultado = []
    for doc in docs_list:
        nro_rad_interno = doc.get('nroRadicado')
        id_documento = doc.get('idDocumento')

        if not nro_rad_interno or not id_documento:
            continue

        nro_rad_encoded = quote(nro_rad_interno, safe='-')
        try:
            paso2 = protecdoc_client.request(
                'GET',
                f'/soaint-sgd-web-api-gateway/apis/digitalizar-documento-gateway-api/obtener-documentos-asociados-radicado/{nro_rad_encoded}',
                params={'allDocuments': 'false', 'idDocumento': id_documento, 'allAnnexes': 'true'},
            )
        except Exception as exc:
            _log_warn(f'Error en obtener-documentos-asociados ProtecDoc v1: {exc}', level="error")
            continue

        if paso2.status_code == 200:
            for d in paso2.json().get('documentoDTOList') or []:
                resultado.append({
                    'id_documento': d.get('idDocumento'),
                    'nombreDocumento': d.get('nombreDocumento'),
                    'tipoDocumento': d.get('tipoDocumento'),
                })

    meta = docs_list[0]
    fecha_ts = meta.get('fechaRadicacion')
    fecha_radicacion = (
        datetime.utcfromtimestamp(fecha_ts / 1000).strftime('%Y-%m-%dT%H:%M:%S')
        if fecha_ts else None
    )

    return JsonResponse({
        'nro_radicado': nro_radicado,
        'fecha_radicacion': fecha_radicacion,
        'destinatario': meta.get('destinatario'),
        'nombre_remitente': meta.get('nombreRemitente'),
        'asunto': meta.get('asunto'),
        'documentos': resultado,
    }, status=status.HTTP_200_OK)


@jwt_required
@csrf_exempt
def descargar_documento_v1(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    id_documento = request.GET.get('id_documento')
    if not id_documento:
        return JsonResponse({'error': 'id_documento requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        response = protecdoc_client.request(
            'GET',
            '/ecm-integration-services/apis/ecm/descargarDocumentoVersionECM/',
            params={'identificadorDoc': id_documento, 'version': '1.0'},
        )
    except Exception as exc:
        _log_warn(f'Error descargando documento ProtecDoc v1: {exc}', level="error")
        return JsonResponse({'error': 'Error al descargar documento de ProtecDoc'}, status=status.HTTP_502_BAD_GATEWAY)

    return HttpResponse(
        content=response.content,
        status=response.status_code,
        content_type=response.headers.get('Content-Type', 'application/pdf'),
    )
