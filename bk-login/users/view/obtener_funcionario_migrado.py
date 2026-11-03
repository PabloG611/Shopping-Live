import json

from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404
from users.models.models_global import ActualizacionFuncionarioMigrado, DatosBasicosUsuario, FuncionariosMigradosNovasoft, IdentificacionUsuario, NombrePersonaUsuario
from users.serializer.common.funcionario_novasoft import ActualizacionFuncionarioMigradoSerializer, FuncionariosMigradosNovasoftSerializer

from utils.logger_generico import _log_warn
@api_view(['GET'])
def ObtenerFuncionarioMigradoIdentificacion(request, numero_identificacion):
    """
    Obtiene información completa de un funcionario migrado por número de identificación.
    Filtra por identificación y valida que tenga datos básicos.
    """
    try:
        identificacion = IdentificacionUsuario.objects.filter(numero_identificacion=numero_identificacion).first()
        if not identificacion:
            return Response(
                {"error": "Número de identificación no encontrado"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        basicos_usuario = DatosBasicosUsuario.objects.filter(identificacion_usuario=identificacion)
        if not basicos_usuario:
            return Response(
                {"error": "Datos básicos del usuario no encontrados"},
                status=status.HTTP_404_NOT_FOUND
            )
        funcionario = FuncionariosMigradosNovasoft.objects.filter(
            datos_basicos__in=basicos_usuario
        ).first()
        
        if not funcionario:
            return Response(
                {"error": "Funcionario no encontrado"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        actualizacion = ActualizacionFuncionarioMigrado.objects.filter(funcionario_migrado=funcionario).first()

        if actualizacion:
            serializer = ActualizacionFuncionarioMigradoSerializer(actualizacion)

        else:
            serializer = FuncionariosMigradosNovasoftSerializer(funcionario)

        return Response(serializer.data, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    

@api_view(['POST'])
def ObtenerFuncionarioMigradoNombre(request):
    """
    Obtiene información completa de un funcionario migrado por nombre.
    Filtra por nombre y valida que tenga datos básicos.
    """
    try:
        
        data = json.loads(request.body)
    
        primer_nombre = data.get('primer_nombre')
        segundo_nombre = data.get('segundo_nombre', None)
        primer_apellido = data.get('primer_apellido')
        segundo_apellido = data.get('segundo_apellido', None)

        _log_warn(f"Datos recibidos: {data}", level="info")

        _log_warn(f"Buscando funcionario con primer_nombre: {primer_nombre}, primer_apellido: {primer_apellido}", level="info")

        nombre_obj = NombrePersonaUsuario.objects.filter(
            primer_nombre__iexact=primer_nombre,
            primer_apellido__iexact=primer_apellido,
        )

        if not nombre_obj:
            return Response(
                {"error": "Nombre del funcionario no encontrado"},
                status=status.HTTP_404_NOT_FOUND
            )


        basicos_usuario = DatosBasicosUsuario.objects.filter(nombre_persona__in=nombre_obj)
        if not basicos_usuario:
            return Response(
                {"error": "Datos básicos del usuario no encontrados"},
                status=status.HTTP_404_NOT_FOUND
            )
        funcionario = FuncionariosMigradosNovasoft.objects.filter(
            datos_basicos__in=basicos_usuario
        ).first()
        
        if not funcionario:
            return Response(
                {"error": "Funcionario no encontrado"},
                status=status.HTTP_404_NOT_FOUND
            )
        
        actualizacion = ActualizacionFuncionarioMigrado.objects.filter(funcionario_migrado=funcionario).first()

        if actualizacion:
            serializer = ActualizacionFuncionarioMigradoSerializer(actualizacion)

        else:
            serializer = FuncionariosMigradosNovasoftSerializer(funcionario)

        return Response(serializer.data, status=status.HTTP_200_OK)
    
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )