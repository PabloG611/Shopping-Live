from rest_framework.decorators import api_view, renderer_classes
from rest_framework.renderers import JSONRenderer
from rest_framework.response import Response
from rest_framework import status

from users.models.models_consecutivo import CrearConsecutivo


@api_view(['GET'])
@renderer_classes([JSONRenderer])
def ConsultaConsecutivo(request, origen):
    try:
        consecutivo = CrearConsecutivo(origen)
        return Response({"consecutivo": consecutivo}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
