import pandas as pd
import uuid
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import tempfile
import os
from datetime import datetime, timedelta
import time
from django.contrib.auth.hashers import make_password
from django.contrib.auth.models import User
from users.models.models_global import DatosBasicosUsuario, IdentificacionUsuario, NombrePersonaUsuario, PerfilUsuario
from users.models.models_static import Dependencia, Grupo, Rol, TipoGenero, TipoIdentificacion
from utils.validate import validate_password_for_import
from custom_auth.services.session_service import SessionService
from functools import wraps

def post_required(view_func):
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if request.method == 'POST':
            return view_func(request, *args, **kwargs)
        else:
            return JsonResponse({"error": "Method not Allowed"}, status=405)
    return _wrapped_view

def safe_strip(value):
    """Método seguro para hacer strip de valores potencialmente nulos"""
    if value is None or pd.isna(value):
        return None
    return str(value).strip()

def parse_date(date_value):
    """Convierte diferentes formatos de fecha a objeto date"""
    if pd.isna(date_value) or date_value is None:
        return None    

    if isinstance(date_value, (pd.Timestamp, datetime)):
        return date_value.date() if hasattr(date_value, 'date') else date_value
    
    if isinstance(date_value, str):
        date_value = date_value.strip()
        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%d-%m-%Y', '%Y/%m/%d'):
            try:
                return datetime.strptime(date_value, fmt).date()
            except ValueError:
                continue
    return None

def validate_row(row):
    """Valida los campos obligatorios"""
    required_fields = {
        'uuid_usuario': 'UUID de la persona de proteccion',
        'id_rol': 'rol',
        'id_grupo': 'Grupo',
        'id_dependencia': 'Dependencia',
        'id_tidentificacion': 'Tipo de identificación',
        'numero_identificacion': 'Número de identificación',
        'primer_nombre': 'Primer nombre',
        'primer_apellido': 'Primer apellido',
        'id_genero': 'Género',
    }

    errors = []
    for field, name in required_fields.items():
        value = row.get(field)
        if pd.isna(value) or (isinstance(value, str) and value.strip() == ''):
            errors.append(f"Campo obligatorio vacío: {name}")

    return errors

def generate_report(start_time, total_rows, solicitudes_fallidas):
    """Genera el reporte de ejecución"""
    execution_time = time.time() - start_time
    time_formatted = str(timedelta(seconds=int(execution_time)))
    total_migrados = total_rows - len(solicitudes_fallidas)
    promedio_minuto = total_migrados / (execution_time / 60) if execution_time > 0 else 0

    return {
        'status': 'success',
        'execution_time': time_formatted,
        'total_rows_processed': total_rows,
        'successful_migrations': total_migrados,
        'errors_count': len(solicitudes_fallidas),
        'rate_per_minute': round(promedio_minuto, 2),
        'errors': solicitudes_fallidas
    }

@csrf_exempt
@post_required
def ImportarUsuario(request):
    start_time = time.time()
    solicitudes_fallidas = []
    
    # Verificar si se envió un archivo
    if 'excel_file' not in request.FILES:
        return JsonResponse({
            'status': 'error',
            'message': 'No se proporcionó archivo Excel'
        }, status=400)
    
    excel_file = request.FILES['excel_file']
    
    # Obtener parámetros opcionales de la solicitud
    sheet_name = request.POST.get('hoja', 0)
    try:
        skip_rows = int(request.POST.get('skiprows', 0))
    except ValueError:
        skip_rows = 0
    
    # Guardar archivo temporalmente
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
        for chunk in excel_file.chunks():
            tmp_file.write(chunk)
        tmp_file_path = tmp_file.name
    
    try:
        # Leer archivo Excel con configuración optimizada
        data = pd.read_excel(
            tmp_file_path,
            sheet_name=sheet_name,
            skiprows=skip_rows,
            dtype={
                'uuid_usuario': str,
                'id_rol': int,
                'id_grupo': int,
                'id_dependencia': int,
                'id_tidentificacion': int,
                'numero_identificacion': str,
                'primer_nombre': str,
                'primer_apellido': str,
                'id_genero': int,
            },
            parse_dates=['fecha_expedicion']
        )

        # Limpieza inicial de datos
        data = data.where(pd.notnull(data), None)
        data = data.dropna(how='all')
        total_rows = data.shape[0]

        for index, row in data.iterrows():
            line_number = index + 2 + skip_rows
            try:
                # Validación de campos
                validation_errors = validate_row(row)
                if validation_errors:
                    raise ValueError(" | ".join(validation_errors))
                
                # ===== EXTRACCIÓN DE DATOS =====
                uuidUsuario = safe_strip(row['uuid_usuario'])
                idRol = row['id_rol']
                idGrupo = row['id_grupo']
                idDependencia = row['id_dependencia']
                idTIdentificacion = row['id_tidentificacion']
                numeroIdentificacion = safe_strip(row['numero_identificacion'])
                fechaExpedicion = parse_date(row['fecha_expedicion'])
                primerNombre = safe_strip(row['primer_nombre'])
                segundoNombre = safe_strip(row.get('segundo_nombre', None))
                primerApellido = safe_strip(row['primer_apellido'])
                segundoApellido = safe_strip(row.get('segundo_apellido', None))
                idGenero = row['id_genero']
                username = row['user_name']
                password = row['password']
                validate_password_for_import(password, username, primerNombre, primerApellido)

                # ===== PROCESAMIENTO DE DATOS =====
                # 1. Verificar identificación existente
                identificacion_existe = IdentificacionUsuario.objects.filter(
                    numero_identificacion=numeroIdentificacion
                ).first()
                tipo_identificacion = TipoIdentificacion.objects.get(id_tidentificacion=idTIdentificacion)

                if identificacion_existe is None:
                    identificacion_save = IdentificacionUsuario.objects.create(
                        numero_identificacion=numeroIdentificacion,
                        fecha_expedicion=fechaExpedicion,
                        tipo_identificacion=tipo_identificacion
                    )
                    genero_save = TipoGenero.objects.get(id_tgenero=idGenero)
                    nombre_save = NombrePersonaUsuario.objects.create(
                        primer_nombre=primerNombre,
                        segundo_nombre=segundoNombre,
                        primer_apellido=primerApellido,
                        segundo_apellido=segundoApellido
                    )
                    datos_basicos = DatosBasicosUsuario.objects.create(
                        id_busuario=uuid.UUID(uuidUsuario),
                        identificacion_usuario=identificacion_save,
                        nombre_persona=nombre_save,
                        sexo_persona=None,
                        genero_persona=genero_save,
                        orientacion_persona=None,
                        gp_rh=None,
                    )
                else:
                    identificacion_save = identificacion_existe
                    datos_basicos = DatosBasicosUsuario.objects.filter(
                        identificacion_usuario=identificacion_existe
                    ).last()
                    
                    if datos_basicos:
                        nombre_save = datos_basicos.nombre_persona
                        genero_save = datos_basicos.genero_persona if datos_basicos.genero_persona else None
                    else:
                        genero_save = TipoGenero.objects.get(id_tgenero=idGenero)
                        nombre_save = NombrePersonaUsuario.objects.create(
                            primer_nombre=primerNombre,
                            segundo_nombre=segundoNombre,
                            primer_apellido=primerApellido,
                            segundo_apellido=segundoApellido
                        )
                        datos_basicos = DatosBasicosUsuario.objects.create(
                            id_busuario=uuid.UUID(uuidUsuario),
                            identificacion_usuario=identificacion_save,
                            nombre_persona=nombre_save,
                            sexo_persona=None,
                            genero_persona=genero_save,
                            orientacion_persona=None,
                            gp_rh=None,
                        )

                # Crear o actualizar usuario
                user, created = User.objects.update_or_create(
                    username=username,
                    defaults={
                        "password": make_password(password)
                    }
                )

                # Obtener las relaciones
                dependencia_save = Dependencia.objects.get(id_dependencia=idDependencia)
                grupo_save = Grupo.objects.get(id_grupo=idGrupo)
                rol_save = Rol.objects.get(id_rol=idRol)

                # Si el usuario ya tenía perfil y cambia su rol, se invalida su sesión
                perfil_previo = PerfilUsuario.objects.filter(basicos_usuario=datos_basicos).first()
                cambia_rol = bool(perfil_previo) and (
                    perfil_previo.rol_id != rol_save.id_rol or not perfil_previo.activo
                )

                # Crear el perfil de usuario
                PerfilUsuario.objects.update_or_create(
                    basicos_usuario=datos_basicos,
                    defaults={
                        'dependencia': dependencia_save,
                        'grupo': grupo_save,
                        'rol': rol_save,
                        'user': user,
                        'activo': True
                    }
                )

                if cambia_rol:
                    SessionService.revoke_user_access_on_commit(user, motivo="cambio de rol por importación")
            except Exception as e:
                solicitudes_fallidas.append({
                    'line_number': line_number,
                    'error': str(e)
                })
                continue

        # Generar reporte
        report_data = generate_report(start_time, total_rows, solicitudes_fallidas)
        
        # Limpiar archivo temporal
        os.unlink(tmp_file_path)

        return JsonResponse(report_data)
        
    except Exception as e:
        # Limpiar archivo temporal en caso de error
        if os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        
        return JsonResponse({
            'status': 'error',
            'message': f'Error al procesar el archivo: {str(e)}'
        }, status=500)