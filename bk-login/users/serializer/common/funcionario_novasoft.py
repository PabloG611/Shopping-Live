from rest_framework import serializers

from users.models.models_global import (
    ActualizacionFuncionarioMigrado,
    DatosBasicosUsuario,
    FuncionariosMigradosNovasoft,
)
from users.serializer.serializer_get import ApiDatosBasicosUsuario, UUIDStringField


class FuncionariosMigradosNovasoftSerializer(serializers.ModelSerializer):
    id_migrado = UUIDStringField()
    datos_basicos = ApiDatosBasicosUsuario(read_only=True)

    class Meta:
        model = FuncionariosMigradosNovasoft
        fields = ['id_migrado', 'datos_basicos', 'fecha_migracion']


class ActualizacionFuncionarioMigradoSerializer(serializers.ModelSerializer):
    id_actualizacion = UUIDStringField()
    funcionario_migrado = FuncionariosMigradosNovasoftSerializer(read_only=True)

    class Meta:
        model = ActualizacionFuncionarioMigrado
        fields = ['id_actualizacion', 'funcionario_migrado', 'fecha_actualizacion']
