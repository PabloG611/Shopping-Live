from django.http import JsonResponse, HttpResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status

from api.decorators.jwt_decorator import jwt_required
from gateway.services.novasoft import novasoft_client
from utils.logger_generico import _log_warn

# @jwt_required
@csrf_exempt
def consulta_empleado(request):
    if request.method != 'GET':
        return JsonResponse({'error': 'Método no permitido'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

    numero_identificacion = request.GET.get('numero_identificacion')
    if not numero_identificacion:
        return JsonResponse({'error': 'numero_identificacion requerido'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        response = novasoft_client.request(
            'GET',
            f'/NOM/ConsultaDatos/{numero_identificacion}',
        )
    except Exception as exc:
        _log_warn(f'Error en consulta empleado Novasoft: {exc}', level="error")
        return JsonResponse({'error': 'Error al consultar el empleado en Novasoft'}, status=status.HTTP_502_BAD_GATEWAY)

    return HttpResponse(
        content=response.content,
        status=response.status_code,
        content_type=response.headers.get('Content-Type', 'application/json'),
    )
