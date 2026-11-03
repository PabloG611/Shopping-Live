from django.contrib import admin

from custom_auth.models.models_global import UsuarioExtendido


@admin.register(UsuarioExtendido)
class UsuarioExtendidoAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'desarrollador')
    list_filter = ('desarrollador',)
    search_fields = ('username', 'email')
    fields = ('username', 'desarrollador')
    readonly_fields = ('username',)
