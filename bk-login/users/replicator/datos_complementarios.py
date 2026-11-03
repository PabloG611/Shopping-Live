from users.models.models_global import ContratoContratista, DatosBasicosUsuario, DatosComplementariosUsuario, PerfilUsuario, ResolucionFuncionario
from users.models.models_static import Dependencia, Eps, EstadoCivil, FondoPensiones, Grupo, Rol, TipoVinculacion
from django.contrib.auth.models import User
from utils.logger_generico import _log_warn

BACKEND_MAP = [
    'sesp',
    'unp',
    'ser'
]


def _is_blank(value):
    return value in (None, "", "null", "None")


def _get_optional_fk(model, lookup_field, value, db_alias, field_name):
    if _is_blank(value):
        return None
    obj = model.objects.using(db_alias).filter(**{lookup_field: value}).first()
    if obj is None:
        _log_warn("Catálogo no encontrado en réplica", level="warning", extra={
                "db_alias": db_alias,
                "field_name": field_name,
                "lookup_field": lookup_field,
                "lookup_value": value,
                "model": model.__name__,
            })
    return obj


def replicar_complementarios_usuario(data):
    id_complementario = data.get('id')
    estado_civil = data.get('estadoCivil')
    fondo_pensiones = data.get('fondoPensiones')
    eps = data.get('eps')
    tipo_vinculacion = data.get('tipoVinulacion')
    acepta_politicas = data.get('aceptaPoliticas')
    id_datos_basicos = data.get('datosBasicos')
    if not id_complementario or not id_datos_basicos:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return
    for db_alias in BACKEND_MAP:
        try:
            basicos_usuario = DatosBasicosUsuario.objects.using(
                db_alias
            ).get(id_busuario=id_datos_basicos)
            fondo_save = _get_optional_fk(
                FondoPensiones, "id_fpensiones", fondo_pensiones, db_alias, "fondo_pensiones"
            )
            eps_save = _get_optional_fk(Eps, "id_eps", eps, db_alias, "eps")
            civil_save = _get_optional_fk(
                EstadoCivil, "id_ecivil", estado_civil, db_alias, "estado_civil"
            )
            vinculacion_save = _get_optional_fk(
                TipoVinculacion,
                "id_tvinculacion",
                tipo_vinculacion,
                db_alias,
                "tipo_vinculacion",
            )
            DatosComplementariosUsuario.objects.using(db_alias).update_or_create(
                id_cusuario=id_complementario,
                defaults={
                    "estado_civil": civil_save,
                    "fondo_pensiones": fondo_save,
                    "eps": eps_save,
                    "tipo_vinculacion": vinculacion_save,
                    "acepto_politicas": acepta_politicas,
                    "basicos_usuario": basicos_usuario,
                }
            )
            _log_warn(f"Complementarios replicados en {db_alias}: {id_complementario}", level="info")
        except DatosBasicosUsuario.DoesNotExist:
            _log_warn(f"No se encontró DatosBasicosUsuario {id_datos_basicos} en {db_alias}. Se omite la réplica.", level="warning")
        except Exception as e:
            _log_warn(f"Error replicando complementarios en {db_alias}: {e}", level="error", exc_info=True)


def replicar_contrato_usuario(data):
    id_contrato = data.get('id')
    numero_contrato = data.get('numero')
    fecha_inicio = data.get('fechaInicio')
    fecha_fin = data.get('fechaFin')
    id_complementarios = data.get('complementarios')
    if not id_contrato or not id_complementarios:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return
    for db_alias in BACKEND_MAP:
        try:
            complementario = DatosComplementariosUsuario.objects.using(
                db_alias).get(id_cusuario=id_complementarios)
            ContratoContratista.objects.using(db_alias).update_or_create(
                id_contrato=id_contrato,
                defaults={
                    "numero_contrato": numero_contrato,
                    "fecha_iniciocontrato": fecha_inicio,
                    "fecha_fincontrato": fecha_fin,
                    "complementario_usuario": complementario,
                }
            )
            _log_warn(f"Contrato replicado en {db_alias}: {id_contrato}", level="info")
        except DatosComplementariosUsuario.DoesNotExist:
            _log_warn(f"No se encontró ComplementariosUsuario {id_complementarios} en {db_alias}. Se omite réplica.", level="warning")
        except Exception as e:
            _log_warn(f"Error replicando contrato en {db_alias}: {e}", level="error", exc_info=True)


def replicar_resolucion_usuario(data):
    id_resolucion = data.get('id')
    numero_resolucion = data.get('numero')
    id_complementario = data.get('complementarios')

    if not id_resolucion or not id_complementario:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return

    for db_alias in BACKEND_MAP:
        try:
            complemento = DatosComplementariosUsuario.objects.using(
                db_alias).get(id_cusuario=id_complementario)
            ResolucionFuncionario.objects.using(db_alias).update_or_create(
                id_resolucion=id_resolucion,
                defaults={
                    "numero_resolucion": numero_resolucion,
                    "complementario_usuario": complemento,
                }
            )
            _log_warn(f"Resolución replicada en {db_alias}: {id_resolucion}", level="info")
        except DatosComplementariosUsuario.DoesNotExist:
            _log_warn(f"Complementario {id_complementario} no encontrado en {db_alias}. Resolución omitida.", level="warning")
        except Exception as e:
            _log_warn(f"Error replicando resolución en {db_alias}: {e}", level="error", exc_info=True)


def replicar_user_usuario(data):
    id = data.get('id')
    password = data.get('password')
    username = data.get('username')
    email = data.get('email') or ''

    if not id or not username:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales (id, username).", level="warning")
        return

    for db_alias in BACKEND_MAP:
        try:
            # Estrategia segura: buscar primero por username (campo único)
            # para evitar crear duplicados. Si existe con distinto id,
            # se actualiza el registro existente respetando su id local
            # (evita DELETE que podría causar cascada en PerfilUsuario/Session).
            existing = User.objects.using(db_alias).filter(
                username__iexact=username
            ).first()

            if existing:
                # Actualizar el existente usando su propio id
                existing.password = password
                existing.email = email
                existing.username = username
                existing.save()
                _log_warn(f"Usuario actualizado en {db_alias}: {existing.id} "
                    f"(username: {username})", level="info")
            else:
                # No existe conflicto, crear con el id de origen
                User.objects.using(db_alias).update_or_create(
                    id=id,
                    defaults={
                        "password": password,
                        "username": username,
                        "email": email
                    }
                )
                _log_warn(f"Usuario creado en {db_alias}: {id}", level="info")
        except Exception as e:
            _log_warn(f"Error replicando usuario en {db_alias}: {e}", level="error", exc_info=True)


def replicar_perfil_usuario(data):
    id_pusuario = data.get('id')
    dependencia = data.get('dependencia')
    grupo = data.get('grupo')
    rol = data.get('rol')
    id_basicos = data.get('datosBasicos')
    user = data.get('user')
    activo = data.get('estaActivo')
    fecha_actualizacion = data.get('fechaActualizacion')
    frecuencia_actualizacion = data.get('frecuenciaActualizacion')

    if not id_pusuario or not id_basicos:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return

    for db_alias in BACKEND_MAP:
        try:
            dependencia_save = _get_optional_fk(
                Dependencia, "id_dependencia", dependencia, db_alias, "dependencia"
            )
            grupo_save = _get_optional_fk(Grupo, "id_grupo", grupo, db_alias, "grupo")
            rol_save = _get_optional_fk(Rol, "id_rol", rol, db_alias, "rol")
            basicos = DatosBasicosUsuario.objects.using(
                db_alias).get(id_busuario=id_basicos)
            user_save = User.objects.using(db_alias).get(id=user)
            # asignador_save = DatosBasicosUsuario.objects.using(db_alias).get(id_busuario=data.get('asignador')) if data.get('asignador') else None
            PerfilUsuario.objects.using(db_alias).update_or_create(
                id_pusuario=id_pusuario,
                defaults={
                    "dependencia": dependencia_save,
                    "grupo": grupo_save,
                    "rol": rol_save,
                    "basicos_usuario": basicos,
                    "user": user_save,
                    "activo": activo,
                    "fecha_actualizacion" : fecha_actualizacion,
                    "frecuencia_actualizacion" : frecuencia_actualizacion,
                    # "asignador" : asignador_save
                }
            )
            _log_warn(f"Perfil replicado en {db_alias}: {id_pusuario}", level="info")

        except DatosBasicosUsuario.DoesNotExist:
            _log_warn(f"No se encontró DatosBasicosUsuario {id_basicos} en {db_alias}. Perfil omitido.", level="warning")
        except User.DoesNotExist:
            _log_warn(f"No se encontró User {user} en {db_alias}. Perfil omitido.", level="warning")
        except Exception as e:
            _log_warn(f"Error replicando perfil en {db_alias}: {e}", level="error", exc_info=True)
