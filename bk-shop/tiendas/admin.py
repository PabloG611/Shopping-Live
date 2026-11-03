from django.contrib import admin

from tiendas.models import PerfilTienda, Tienda


@admin.register(Tienda)
class TiendaAdmin(admin.ModelAdmin):
    list_display = ("nombre", "slug", "estado", "creada_en")
    list_filter = ("estado",)
    search_fields = ("nombre", "slug")
    prepopulated_fields = {"slug": ("nombre",)}


@admin.register(PerfilTienda)
class PerfilTiendaAdmin(admin.ModelAdmin):
    list_display = ("usuario", "tienda", "rol", "creado_en")
    list_filter = ("rol",)
    search_fields = ("usuario__username", "tienda__nombre")
