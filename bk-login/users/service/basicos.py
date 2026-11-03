def construir_evento_rol_usuario(rol, origen):
    return {
        "clase": 1,
        "modelo": "RolUsuario",
        "origen": origen,
        "datos": {
            'id_rol' : rol.id_rol,
            'nombre_rol' : rol.nombre_rol,
            'Grupo' : rol.Grupo.id_grupo,
            'url' : rol.url
        }
    }   