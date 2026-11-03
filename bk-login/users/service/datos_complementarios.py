def construir_evento_complementarios_usuario(complementarios, origen):
    return {
        "clase": 1,
        "modelo": "DatosComplementariosUsuario",
        "origen": origen,
        "datos": {
            "id": str(complementarios.id_cusuario),
            "estadoCivil": complementarios.estado_civil.id_ecivil if complementarios.estado_civil else None,
            "fondoPensiones": complementarios.fondo_pensiones.id_fpensiones if complementarios.fondo_pensiones else None,
            "eps": complementarios.eps.id_eps if complementarios.eps else None,
            "tipoVinulacion": complementarios.tipo_vinculacion.id_tvinculacion if complementarios.tipo_vinculacion else None,
            "aceptaPoliticas": complementarios.acepto_politicas,
            "datosBasicos": str(complementarios.basicos_usuario.id_busuario) if complementarios.basicos_usuario and complementarios.basicos_usuario.id_busuario else None
        }
    }


def construir_evento_contratista_usuario(contrato, origen):
    return {
        "clase": 1,
        "modelo": "ContratoContratista",
        "origen": origen,
        "datos": {
            "id": str(contrato.id_contrato),
            "numero": contrato.numero_contrato,
            "fechaInicio": contrato.fecha_iniciocontrato,
            "fechaFin": contrato.fecha_fincontrato,
            "complementarios": str(contrato.complementario_usuario.id_cusuario)
        }
    }


def construir_evento_resolucion_usuario(resolucion, origen):
    return {
        "clase": 1,
        "modelo": "ResolucionFuncionario",
        "origen": origen,
        "datos": {
            "id": str(resolucion.id_resolucion),
            "numero": resolucion.numero_resolucion,
            "complementarios": str(resolucion.complementario_usuario.id_cusuario)
        }
    }


def construir_evento_user_usuario(User, origen):
    return {
        "clase": 1,
        "modelo": "User",
        "origen": origen,
        "datos": {
            "id": User.id,
            "password": User.password,
            "username": User.username,
            "email": User.email or '',
        }
    }


def construir_evento_perfil_usuario(perfil, origen):
    return {
        "clase": 1,
        "modelo": "PerfilUsuario",
        "origen": origen,
        "datos" : {
            "id" : str(perfil.id_pusuario),
            "dependencia" : perfil.dependencia.id_dependencia,
            "grupo" : perfil.grupo.id_grupo,
            "rol" : perfil.rol.id_rol,
            "datosBasicos": str(perfil.basicos_usuario.id_busuario) if perfil.basicos_usuario.id_busuario else None,
            "user" : perfil.user.id,
            "estaActivo" : perfil.activo,
            "fechaActualizacion" : perfil.fecha_actualizacion,
            "frecuenciaActualizacion" : perfil.frecuencia_actualizacion,
            # "asignador" : str(perfil.asignador.id_busuario) if perfil.asignador else None
        }
    }
