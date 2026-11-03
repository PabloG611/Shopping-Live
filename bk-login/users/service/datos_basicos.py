def construir_evento_datosbasicos_usuario(basicos_usuario, origen):
    return {
        "clase": 1,
        "modelo": "DatosBasicosUsuario",
        "origen": origen,
        "datos": {
            "id_busuario": str(basicos_usuario.id_busuario),
            "sexo": basicos_usuario.sexo_persona.id_tsexo if basicos_usuario.sexo_persona else None,
            "genero": basicos_usuario.genero_persona.id_tgenero if basicos_usuario.genero_persona else None,
            "orientacion": basicos_usuario.orientacion_persona.id_torientacion if basicos_usuario.orientacion_persona else None,
            "sanguineo": basicos_usuario.gp_rh.id_grh if basicos_usuario.gp_rh else None,

            "identificacion" : {
                "id" : str(basicos_usuario.identificacion_usuario.id_iusuario),
                "nuip" : basicos_usuario.identificacion_usuario.numero_identificacion,
                "expedicion" : basicos_usuario.identificacion_usuario.fecha_expedicion,
                "tipo" : basicos_usuario.identificacion_usuario.tipo_identificacion.id_tidentificacion,
            },
            "nombres" : {
                "id" : str(basicos_usuario.nombre_persona.id_npersona),
                "primerNombre" : basicos_usuario.nombre_persona.primer_nombre,
                "segundoNombre" : basicos_usuario.nombre_persona.segundo_nombre,
                "primerApellido" : basicos_usuario.nombre_persona.primer_apellido,
                "segundoApellido" : basicos_usuario.nombre_persona.segundo_apellido,
            }
            
        }
    }

def construir_evento_contacto_usuario(contacto, origen):
    return {
        "clase": 1,
        "modelo": "DatosContactoUsuario",
        "origen": origen,
        "datos" : {
            "idContacto" : str(contacto.id_contacto),
            "objectId" : str(contacto.object_id),
            "celular" : {
                "id" : str(contacto.id_ctelefono.id_ctelefono),
                "celularUno" : contacto.id_ctelefono.celular_uno if contacto.id_ctelefono.celular_uno else None,
                "celularDos" : contacto.id_ctelefono.celular_dos if contacto.id_ctelefono.celular_dos else None,
                "celularEmergencia" : contacto.id_ctelefono.celular_emergencia if contacto.id_ctelefono.celular_emergencia else None,
            },
            "correo" : {
                "id" : str(contacto.id_ccelectronico.id_ccelectronico),
                "correo" : contacto.id_ccelectronico.correo_electronico if contacto.id_ccelectronico else None
            }
        }
    }
    
def construir_evento_ubicacionrural_usuario(urural, origen):
    return {
        "clase": 1,
        "modelo": "DatosContactoUsuario",
        "origen": origen,
        "datos" : {
            "id" : str(urural.id_ubicacion),
            "pais" : urural.pais.id_pais,
            "departamento" : urural.departamento.id_departamento,
            "municipio" : urural.municipio.id_municipio,
            "zona" : urural.zona.id_zubicacion,
            "direccion" : urural.direccion,
            "indicacion" : urural.indicacion if urural.indicacion else None,
            "obj" : str(urural.object_id),
            "corregimiento" : urural.corregimiento if urural.corregimiento else None,
            "centroPoblado" : urural.centro_poblado if urural.centro_poblado else None,
            "vereda" : urural.vereda if urural.vereda else None
        }
    }
    
def construir_evento_ubicacionurbana_usuario(uurbana, origen):
    return {
        "clase": 1,
        "modelo": "DatosContactoUsuario",
        "origen": origen,
        "datos" : {
            "id" : str(uurbana.id_ubicacion),
            "pais" : uurbana.pais.id_pais,
            "departamento" : uurbana.departamento.id_departamento,
            "municipio" : uurbana.municipio.id_municipio,
            "zona" : uurbana.zona.id_zubicacion,
            "direccion" : uurbana.direccion,
            "indicacion" : uurbana.indicacion if uurbana.indicacion else None,
            "obj" : str(uurbana.object_id),
            "nombreBarrio" : uurbana.nombre_barrio,
            "tipoViaPrincipal" : uurbana.tipo_viaprincipal,
            "numeroViaPrincipal" : uurbana.numero_viaprincipal,
            "letraPrincipal" : uurbana.letra_principal,
            "esBis" : uurbana.es_bis,
            "cuadrantePrincipal" : uurbana.cuadrante_principal,
            "numeroViaSecundaria" : uurbana.numero_viasecundaria,
            "letraSecundaria" : uurbana.letra_secundaria,
            "cuadranteSecundario" : uurbana.cuadrante_secundario,
            "numeroPlaca" : uurbana.numero_placa,
            "complemento" : uurbana.complemento,
            
        }
    }
    
