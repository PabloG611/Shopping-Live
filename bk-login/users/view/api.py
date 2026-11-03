
from rest_framework import viewsets
from users.models.models_global import FuncionariosMigradosNovasoft, PerfilUsuario
from users.models.models_static import *
from users.serializer import serializer_get as usr_serializer
from django.contrib.auth.models import User


#  MSIS'numero' => (Modelos de la aplicación 'sistema')  + Número del modelo
#  SPSIS'numero' => (Serializador post de la aplicación 'sistema) + Número de la serialización
#  SGSIS'numero' => (Serializador get de la aplicación 'sistema) + Número de la serialización


#1 MSIS'1' SGSIS'6'
class PaisPermiso(viewsets.ModelViewSet):                                   
    queryset = Pais.objects.all().order_by('id_pais')            
    serializer_class = usr_serializer.ApiPais                                
    http_method_names = ['get']

#2 MSIS'2' SGSIS'7'
class DepartamentoPermiso(viewsets.ModelViewSet):
    serializer_class = usr_serializer.ApiDepartamento
    http_method_names = ['get']

    def get_queryset(self):
        queryset = Departamento.objects.all()
        pais = self.request.query_params.get('pais', None)

        if pais is not None:
            if pais == '1':
                pais = int(pais)
                queryset = queryset.filter(pais_id=pais)
            else:
                queryset = queryset.filter(pais=24)

        return queryset

#3 MSIS'3' SGSIS'8'    
class MunicipioPermiso(viewsets.ModelViewSet):
    serializer_class = usr_serializer.ApiMunicipio
    http_method_names = ['get']

    def get_queryset(self):
        queryset = Municipio.objects.all()
        departamento = self.request.query_params.get('departamento', None)
        if departamento is not None:
            queryset = queryset.filter(departamento=departamento)
        return queryset

#4 MSIS'4' SGSIS'9'   
class ZonaPermiso(viewsets.ModelViewSet):
    queryset = ZonaUbicacion.objects.all()
    serializer_class = usr_serializer.ApiZona
    http_method_names = ['get']

#5 MSIS'5' SGSIS'10'
class TipoIdentificacionPermiso(viewsets.ModelViewSet):
    queryset = TipoIdentificacion.objects.all()
    serializer_class = usr_serializer.ApiTipoIdentificacion
    http_method_names = ['get']

#6 MSIS'6' SGSIS'11'
class TipoGeneroPermiso(viewsets.ModelViewSet):
    queryset = TipoGenero.objects.all()
    serializer_class = usr_serializer.ApiTipoGenero
    http_method_names = ['get']

#7 MSIS'7' SGSIS'12'
class EstadoCivilPermiso(viewsets.ModelViewSet):
    queryset = EstadoCivil.objects.all()
    serializer_class = usr_serializer.ApiEstadoCivil
    http_method_names = ['get']

#8 MSIS'8' SGSIS'13'
class GpRhPermiso(viewsets.ModelViewSet):
    queryset = GpRh.objects.all()
    serializer_class = usr_serializer.ApiGpRh
    http_method_names = ['get']

#9 MSIS'9' SGSIS'14'
class FondoPensionesPermiso(viewsets.ModelViewSet):
    queryset = FondoPensiones.objects.all()
    serializer_class = usr_serializer.ApiFondoPensiones
    http_method_names = ['get']

#10 MSIS'10' SGSIS'15'
class EpsPermiso(viewsets.ModelViewSet):
    queryset = Eps.objects.all()
    serializer_class = usr_serializer.ApiEps
    http_method_names = ['get']

#11 MSIS'11' SGSIS'16'
class TipoSexoPermiso(viewsets.ModelViewSet):
    queryset = TipoSexo.objects.all()
    serializer_class = usr_serializer.apiTipoSexo
    http_method_names = ['get']

#12 MSIS'12' SGSIS'17'
class TipoOrientacionSexualPermiso(viewsets.ModelViewSet):
    queryset = TipoOrientacionSexual.objects.all()
    serializer_class = usr_serializer.apiTipoOrientacionSexual
    http_method_names = ['get']

#13
class TipoFactorDiferencialPermiso(viewsets.ModelViewSet):
    queryset = TipoFactorDiferencial.objects.all()
    serializer_class = usr_serializer.apiTipoFactorDiferencial
    http_method_names = ['get']

#14
class TipoVinculacionPermiso(viewsets.ModelViewSet):                                   
    queryset = TipoVinculacion.objects.all()            
    serializer_class = usr_serializer.apiTipoVinculacion                                
    http_method_names = ['get']

# 15
class DependenciaPermiso(viewsets.ModelViewSet):                                   
    queryset = Dependencia.objects.all()            
    serializer_class = usr_serializer.ApiDependencia                                
    http_method_names = ['get']

# 16
class GrupoPermiso(viewsets.ModelViewSet):       
    serializer_class = usr_serializer.ApiGrupo                                
    http_method_names = ['get']

    def get_queryset(self):
        queryset = Grupo.objects.all()
        dependencia = self.request.query_params.get('dependencia', None)
        if dependencia is not None:
            queryset = queryset.filter(dependencia=dependencia)
        return queryset

# 17
class RolPermiso(viewsets.ModelViewSet):      
    serializer_class = usr_serializer.ApiRol                                
    http_method_names = ['get']

    def get_queryset(self):
        queryset = Rol.objects.all()
        grupo = self.request.query_params.get('grupo', None)
        if grupo is not None:
            queryset = queryset.filter(Grupo=grupo)
        return queryset

# 18
class PerfilPermiso(viewsets.ModelViewSet):      
    serializer_class = usr_serializer.ApiPerfilUsuario
    http_method_names = ['get']

    def get_queryset(self):
        username = self.request.query_params.get('username', None)
        if username is not None:
            user = User.objects.filter(username__iexact=username).first()
            if user:
                return PerfilUsuario.objects.filter(user=user.id)
            
        return PerfilUsuario.objects.none()
    

class NovasoftFuncionariosPermiso(viewsets.ModelViewSet):
    serializer_class = usr_serializer.ApiFuncionarioNovasoft
    http_method_names = ['get']
    queryset = FuncionariosMigradosNovasoft.objects.all() 