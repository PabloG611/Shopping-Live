from rest_framework import serializers

from tiendas.models import PerfilTienda, Tienda


class TiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tienda
        fields = [
            "id",
            "nombre",
            "slug",
            "descripcion",
            "estado",
            "tema",
            "creada_en",
            "actualizada_en",
        ]
        read_only_fields = ["id", "creada_en", "actualizada_en"]


class PerfilTiendaSerializer(serializers.ModelSerializer):
    class Meta:
        model = PerfilTienda
        fields = ["id", "usuario", "tienda", "rol", "creado_en"]
        read_only_fields = ["id", "creado_en"]
