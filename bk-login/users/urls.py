from django.urls import path, include
from rest_framework import routers
from users.view.migrar_usuario import ImportarUsuario
from users.view.obtener_funcionario_migrado import ObtenerFuncionarioMigradoIdentificacion, ObtenerFuncionarioMigradoNombre
from users.view.perfiles import create_update_profiles
from users.view.obtener_consecutivo import ConsultaConsecutivo
from users.view.roles import ConsultarRolesViewSet, GuardarRoles, get_role_by_user_id, get_role_range, get_users_by_rol
from users.views import *

from users.view import api as usr_api
# from utils.obtener_consecutivo import ConsultaConsecutivo

app_name = 'usuario'
routers = routers.DefaultRouter()

# RUTAS DE LAS TABLAS ESTÁTICAS
routers.register('pais', usr_api.PaisPermiso, 'pais'),  # '1'
routers.register('departamento', usr_api.DepartamentoPermiso,
                 'departamento'),  # '2'
routers.register('municipio', usr_api.MunicipioPermiso, 'municipio'),  # '3'
routers.register('zona', usr_api.ZonaPermiso, 'zona'),  # '4'
routers.register('tipoidentificacion',
                 usr_api.TipoIdentificacionPermiso, 'tipoidentificacion'),  # '5'
routers.register('tipogenero', usr_api.TipoGeneroPermiso, 'tipogenero'),  # '6'
routers.register('tipoestadocivil', usr_api.EstadoCivilPermiso,
                 'tipoestadocivil'),  # '7'
routers.register('tipogprh', usr_api.GpRhPermiso, 'gprhl'),  # '8'
routers.register('tipofondopensiones',
                 usr_api.FondoPensionesPermiso, 'fondopensiones'),  # '9'
routers.register('tipoeps', usr_api.EpsPermiso, 'eps'),  # '10'
routers.register('tiposexo', usr_api.TipoSexoPermiso, 'tiposexo'),  # '11'
routers.register(
    'tiposexual', usr_api.TipoOrientacionSexualPermiso, 'tiposexual'),  # '12'
routers.register('tipodiferencial',
                 usr_api.TipoFactorDiferencialPermiso, 'tipodiferencial'),  # '13'
routers.register('tipovinculacion',
                 usr_api.TipoVinculacionPermiso, 'tipovinculacion'),  # '14'

routers.register('dependencia', usr_api.DependenciaPermiso,
                 'dependencia'),  # '15'
routers.register('grupo', usr_api.GrupoPermiso, 'grupo'),  # '16'
routers.register('rol', usr_api.RolPermiso, 'rol'),  # '17'
routers.register('perfil', usr_api.PerfilPermiso, 'perfil'),  # '17'
routers.register('novasoft-funcionarios', usr_api.NovasoftFuncionariosPermiso, 'novasoft-funcionarios'),
routers.register('consultarrol', ConsultarRolesViewSet, 'consultarrol'),

urlpatterns = [
    path('', include(routers.urls)),
    path('register/', register),
    path('register_beneficiario/', register_beneficiario),
    path('register_proteccion/', register_proteccion),
    path('recovery/', recovery),
    path('validate_recovery/', validate_recovery),
    path('update_data/', save_data_basic),
    path('update_data_colectivo/', save_data_colectivo),
    path('update_data_cerrem/', save_data_basic_invitado_cerrem),
    path('data/', get_data),

    path('consecutivos/<int:origen>/', ConsultaConsecutivo),
    path('importarusuario/', ImportarUsuario, name='excel_import'),
    path('update_profile/', create_update_profiles),
    path('role_range/', get_role_range),
    path('crearrol', GuardarRoles),
    path('role_by_user', get_role_by_user_id),
    path('users_by_rol/<int:id_rol>/', get_users_by_rol),
    path('consultarpersona/', ConsultarPersonas),
    path('consultar_funcionario_identificacion/<str:numero_identificacion>/', ObtenerFuncionarioMigradoIdentificacion),
    path('consultar_funcionario_nombre/', ObtenerFuncionarioMigradoNombre),
    path('get_all_data/', get_all_data),
]
