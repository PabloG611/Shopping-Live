import json

from django.http import JsonResponse
from django.db import transaction
from users.models.models_global import DatosBasicosUsuario, PerfilUsuario
from users.models.models_static import Dependencia, Grupo, Rol
from django.contrib.auth.models import User
from utils.save_data import *
from rest_framework.decorators import api_view
from django.views.decorators.csrf import csrf_exempt
from custom_auth.services.session_service import SessionService

from utils.logger_generico import _log_warn
 
@api_view(['POST'])
def create_update_profiles(request):
    if not request.method == 'POST':
        return JsonResponse({'error': 'Método no permitido'}, status=405)
    
    try:
        data = json.loads(request.body)
        username = data.get('username')
        perfiles_actualizar = data.get('perfiles_actualizar', [])
        id_rol = data.get('id_rol')

        # Validar datos requeridos
        if not username:
            return JsonResponse({'error': 'Username es requerido'}, status=400)

        # Buscar usuario
        user = User.objects.filter(username__iexact=username).first()
        if not user:
            _log_warn(f"Usuario no encontrado: {username}", level="warning")
            return JsonResponse({'error': 'Usuario no encontrado'}, status=404)

        # Usar transacción para asegurar atomicidad
        with transaction.atomic():
            # Al cambiar los roles se invalida la sesión del usuario (tras el commit)
            # para que el siguiente token se emita con los roles vigentes
            SessionService.revoke_user_access_on_commit(user, motivo="actualización de roles")

            # Actualiza el estado de los perfiles que se vayan a actualizar
            for perfil_actualizar in perfiles_actualizar:
                id_perfil = perfil_actualizar.get('id_perfil')
                estado = perfil_actualizar.get('estado')

                if not id_perfil or estado is None:
                    _log_warn(f"Perfil con datos incompletos: {perfil_actualizar}", level="warning")
                    continue

                perfil = PerfilUsuario.objects.filter(id_pusuario=id_perfil).first()
                if perfil:
                    perfil.activo = estado
                    perfil.save()
                    _log_warn(f"Perfil {id_perfil} actualizado a estado {estado}", level="info")
                else:
                    _log_warn(f"Perfil {id_perfil} no encontrado", level="warning")

            # Creación del nuevo perfil si se proporciona id_rol
            if not id_rol:
                return JsonResponse({'success': 'Perfiles actualizados correctamente'}, status=200)

            # Obtener datos básicos del usuario
            perfil_usuario = PerfilUsuario.objects.filter(user=user).first()
            if not perfil_usuario:
                _log_warn(f"Usuario {username} no tiene perfiles existentes", level="error")
                return JsonResponse({'error': 'El usuario no tiene perfiles existentes'}, status=400)
            
            if not perfil_usuario.basicos_usuario:
                _log_warn(f"Usuario {username} no tiene datos básicos configurados", level="error")
                return JsonResponse({'error': 'El usuario no tiene datos básicos configurados'}, status=400)
            
            id_busuario = perfil_usuario.basicos_usuario.id_busuario
            
            # Buscar si ya existe un perfil con ese rol
            perfil_existente = PerfilUsuario.objects.filter(
                basicos_usuario=id_busuario,
                rol=id_rol
            ).first()

            # Si no hay perfil lo crea
            if not perfil_existente:
                # Obtener el rol
                rol = Rol.objects.filter(id_rol=id_rol).first()
                if not rol:
                    _log_warn(f"Rol {id_rol} no encontrado", level="error")
                    return JsonResponse({'error': f'Rol {id_rol} no encontrado'}, status=404)
                
                # Obtener grupo y dependencia desde el rol
                if not hasattr(rol, 'Grupo') or not rol.Grupo:
                    _log_warn(f"Rol {id_rol} no tiene grupo asociado", level="error")
                    return JsonResponse({'error': 'El rol no tiene grupo asociado'}, status=400)
                
                grupo = Grupo.objects.filter(id_grupo=rol.Grupo.id_grupo).first()
                if not grupo:
                    _log_warn(f"Grupo {rol.Grupo.id_grupo} no encontrado", level="error")
                    return JsonResponse({'error': 'Grupo no encontrado'}, status=404)
                
                if not hasattr(grupo, 'dependencia') or not grupo.dependencia:
                    _log_warn(f"Grupo {grupo.id_grupo} no tiene dependencia asociada", level="error")
                    return JsonResponse({'error': 'El grupo no tiene dependencia asociada'}, status=400)
                
                dependencia = Dependencia.objects.filter(
                    id_dependencia=grupo.dependencia.id_dependencia).first()
                if not dependencia:
                    _log_warn(f"Dependencia {grupo.dependencia.id_dependencia} no encontrada", level="error")
                    return JsonResponse({'error': 'Dependencia no encontrada'}, status=404)

                datos_perfil = {
                    "dependencia": dependencia.id_dependencia,
                    "grupo": grupo.id_grupo,
                    "rol": rol.id_rol,
                    "basicos_usuario": str(id_busuario),
                    "user": user.id,
                    "activo": True,
                    "asignador": None
                }

                save_data(datos_perfil, PerfilUsuario)
                _log_warn(f"Nuevo perfil creado para usuario {username} con rol {id_rol}", level="info")
            else:
                # Si el perfil existe, solo activarlo
                perfil_existente.activo = True
                perfil_existente.save()
                _log_warn(f"Perfil {perfil_existente.id_pusuario} reactivado para usuario {username}", level="info")

            return JsonResponse({'success': 'Permisos actualizados correctamente'}, status=200)
            
    except json.JSONDecodeError as e:
        _log_warn(f"Error al decodificar JSON: {e}", level="error", exc_info=True)
        return JsonResponse({'error': 'Formato JSON inválido'}, status=400)
    except KeyError as e:
        _log_warn(f"Campo requerido faltante: {e}", level="error", exc_info=True)
        return JsonResponse({'error': f'Campo requerido faltante: {str(e)}'}, status=400)
    except Exception as e:
        _log_warn(f"Error inesperado al guardar el perfil: {e}", level="error", exc_info=True)
        return JsonResponse({'error': f'Error al guardar el perfil: {str(e)}'}, status=500)

