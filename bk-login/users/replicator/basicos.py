from users.models.models_static import Grupo, Rol
from utils.logger_generico import _log_warn


BACKEND_MAP = [
    'sesp',
    'unp',
    'ser',
]

def replicar_evento_rol_usuario(data):
    id_rol = data.get('id_rol')
    nombre_rol = data.get('nombre_rol')
    Grupo_id = data.get('Grupo')
    url = data.get('url')

    if not id_rol:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return

    for db_alias in BACKEND_MAP:
        try:
            grupo_obj = Grupo.objects.using(db_alias).get(id_grupo=Grupo_id)
            Rol.objects.using(db_alias).update_or_create(
                id_rol=id_rol,
                    defaults={
                        'nombre_rol':nombre_rol,
                        'url':url,
                        'Grupo':grupo_obj,
                    }
            )
            _log_warn(f"📑 Rrol replicada en {db_alias}: {id_rol}", level="info")
        except Rol.DoesNotExist:
            _log_warn(f"⚠️ Complementario {id_rol} no encontrado en {db_alias}. Rrol omitida.", level="warning")