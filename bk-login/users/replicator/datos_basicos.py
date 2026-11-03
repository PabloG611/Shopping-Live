
from django.db import IntegrityError
from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from users.models.models_global import CorreoElectronicoContactoUsuario, DatosBasicosUsuario, DatosContactoUsuario, IdentificacionUsuario, NombrePersonaUsuario, TelefonoCelularContactoUsuario, UbicacionRural, UbicacionUrbana
from users.models.models_static import Departamento, GpRh, Municipio, Pais, TipoGenero, TipoIdentificacion, TipoOrientacionSexual, TipoSexo, ZonaUbicacion
from utils.base_replicator import get_bases_destino
from utils.logger_generico import _log_warn

BACKEND_MAP = [
    'sesp',
    'unp',
    'ser'
]


def _is_blank(value):
    return value in (None, "", "null", "None")


def _get_optional_fk(model, lookup_field, value, db_alias, field_name):
    """
    Resuelve FK opcional en réplica.
    Si el valor no llega o no existe en catálogo, retorna None y deja warning.
    """
    if _is_blank(value):
        return None

    lookup = {lookup_field: value}
    obj = model.objects.using(db_alias).filter(**lookup).first()
    if obj is None:
        _log_warn("Catálogo no encontrado en réplica", level="warning", extra={
                "db_alias": db_alias,
                "field_name": field_name,
                "lookup_field": lookup_field,
                "lookup_value": value,
                "model": model.__name__,
            })
    return obj


def replicar_datosbasicos_usuario(data):
    identificacion = data.get('identificacion', {})
    nombres = data.get('nombres', {})
    sexo = data.get('sexo')
    genero = data.get('genero')
    orientacion = data.get('orientacion')
    sanguineo = data.get('sanguineo')
    id_busuario = data.get('id_busuario')

    if not identificacion.get('id') or not nombres.get('id'):
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return
    for db_alias in BACKEND_MAP:
        try:
            identificacion_save = TipoIdentificacion.objects.using(db_alias).get(
                id_tidentificacion=identificacion.get('tipo')
            )
            nuip = identificacion.get('nuip')
            id_iusuario = identificacion.get('id')

            # Estrategia robusta: buscar por numero_identificacion (llave de negocio).
            # Si existe, actualizar solo campos no-PK con .update() para evitar
            # que Django haga INSERT al cambiar el PK.
            # Si no existe, crear con el id_iusuario del origen.
            existe = IdentificacionUsuario.objects.using(db_alias).filter(
                numero_identificacion=nuip
            ).exists()

            if existe:
                IdentificacionUsuario.objects.using(db_alias).filter(
                    numero_identificacion=nuip
                ).update(
                    fecha_expedicion=identificacion.get('expedicion'),
                    tipo_identificacion=identificacion_save,
                )
                datos_identificacion = IdentificacionUsuario.objects.using(db_alias).filter(
                    numero_identificacion=nuip
                ).first()
            else:
                datos_identificacion = IdentificacionUsuario.objects.using(db_alias).create(
                    id_iusuario=id_iusuario,
                    numero_identificacion=nuip,
                    fecha_expedicion=identificacion.get('expedicion'),
                    tipo_identificacion=identificacion_save,
                )
            datos_nombre, _ = NombrePersonaUsuario.objects.using(db_alias).update_or_create(
                id_npersona=nombres.get('id'),
                defaults={
                    'primer_nombre': nombres.get('primerNombre'),
                    'segundo_nombre': nombres.get('segundoNombre'),
                    'primer_apellido': nombres.get('primerApellido'),
                    'segundo_apellido': nombres.get('segundoApellido'),
                }
            )
            sexo_save = _get_optional_fk(
                TipoSexo, "id_tsexo", sexo, db_alias, "sexo_persona"
            )
            genero_save = _get_optional_fk(
                TipoGenero, "id_tgenero", genero, db_alias, "genero_persona"
            )
            orienatcion_save = _get_optional_fk(
                TipoOrientacionSexual,
                "id_torientacion",
                orientacion,
                db_alias,
                "orientacion_persona",
            )
            sanguineo_save = _get_optional_fk(
                GpRh, "id_grh", sanguineo, db_alias, "gp_rh"
            )

            DatosBasicosUsuario.objects.using(db_alias).update_or_create(
                id_busuario=id_busuario,
                defaults={
                    'identificacion_usuario': datos_identificacion,
                    'nombre_persona': datos_nombre,
                    'sexo_persona': sexo_save,
                    'genero_persona': genero_save,
                    'orientacion_persona': orienatcion_save,
                    'gp_rh': sanguineo_save,
                }
            )
            _log_warn(f"Replicado en {db_alias}: {id_busuario}", level="info")
        except Exception as e:
            _log_warn(f"Error replicando datos básicos en {db_alias}: {e}", level="error", exc_info=True)

def replicar_contacto_usuario(data):
    celular = data.get('celular', {})
    correo = data.get('correo', {})
    obj = data.get('objectId')
    id_contacto = data.get('idContacto')

    if not celular.get('id') or not correo.get('id') or not id_contacto:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return

    for db_alias in BACKEND_MAP:
        celular_save, _ = TelefonoCelularContactoUsuario.objects.using(db_alias).update_or_create(
            id_ctelefono=celular.get('id'),
            defaults={
                "celular_uno": celular.get('celularUno'),
                "celular_dos": celular.get('celularDos'),
                "celular_emergencia": celular.get('celularEmergencia')
            }
        )
        correo_save, _ = CorreoElectronicoContactoUsuario.objects.using(db_alias).update_or_create(
            id_ccelectronico=correo.get('id'),
            defaults={
                "correo_electronico": correo.get('correo')
            }
        )
        content_save = ContentType.objects.db_manager(db_alias).get_for_model(DatosBasicosUsuario)
        DatosContactoUsuario.objects.using(db_alias).update_or_create(
            id_contacto=id_contacto,
            defaults={
                "id_ctelefono": celular_save,
                "id_ccelectronico": correo_save,
                "content_type": content_save,
                "object_id": obj
            }
        )
        _log_warn(f"📡 Contacto replicado en {db_alias}: {id_contacto}", level="info")

def replicar_ubucacionrural_usuario(data):
    id = data.get('id')
    pais = data.get('pais')
    departamento = data.get('departamento')
    municipio = data.get('municipio')
    zona = data.get('zona')
    direccion = data.get('direccion')
    indicacion = data.get('indicacion')
    obj = data.get('obj')
    corregimiento = data.get('corregimiento')
    centroPoblado = data.get('centroPoblado')
    vereda = data.get('vereda')

    if not id:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return

    for db_alias in BACKEND_MAP:
        pais_save = Pais.objects.using(db_alias).get(id_pais=pais)
        departamento_save = Departamento.objects.using(db_alias).get(id_departamento=departamento)
        municipio_save = Municipio.objects.using(db_alias).get(id_municipio=municipio)
        zona_save = ZonaUbicacion.objects.using(db_alias).get(id_zubicacion=zona)
        content_save = ContentType.objects.db_manager(db_alias).get_for_model(DatosBasicosUsuario)

        UbicacionRural.objects.using(db_alias).update_or_create(
            id_ubicacion=id,
            defaults={
                "pais": pais_save,
                "departamento": departamento_save,
                "municipio": municipio_save,
                "zona": zona_save,
                "direccion": direccion,
                "indicacion": indicacion,
                "content_type": content_save,
                "object_id": obj,
                "corregimiento": corregimiento,
                "centro_poblado": centroPoblado,
                "vereda": vereda,
            }
        )
        _log_warn(f"📍 Ubicación replicada en {db_alias}: {id}", level="info")

def replicar_ubucacionurbana_usuario(data):
    id_ubicacion = data.get('id')
    if not id_ubicacion:
        _log_warn("❌ Evento incompleto. Faltan IDs esenciales.", level="warning")
        return

    pais = data.get('pais')
    departamento = data.get('departamento')
    municipio = data.get('municipio')
    zona = data.get('zona')
    direccion = data.get('direccion')
    indicacion = data.get('indicacion')
    obj = data.get('obj')
    nombre_barrio = data.get('nombreBarrio')
    tipo_viaprincipal = data.get('tipoViaPrincipal')
    numero_viaprincipal = data.get('numeroViaPrincipal')
    letra_principal = data.get('letraPrincipal')
    es_bis = data.get('esBis')
    cuadrante_principal = data.get('cuadrantePrincipal')
    numero_viasecundaria = data.get('numeroViaSecundaria')
    letra_secundaria = data.get('letraSecundaria')
    cuadrante_secundario = data.get('cuadranteSecundario')
    numero_placa = data.get('numeroPlaca')
    complemento = data.get('complemento')

    for db_alias in BACKEND_MAP:
        pais_save = Pais.objects.using(db_alias).get(id_pais=pais)
        departamento_save = Departamento.objects.using(db_alias).get(id_departamento=departamento)
        municipio_save = Municipio.objects.using(db_alias).get(id_municipio=municipio)
        zona_save = ZonaUbicacion.objects.using(db_alias).get(id_zubicacion=zona)
        content_save = ContentType.objects.db_manager(db_alias).get_for_model(DatosBasicosUsuario)
        UbicacionUrbana.objects.using(db_alias).update_or_create(
            id_ubicacion=id_ubicacion,
            defaults={
                "pais": pais_save,
                "departamento": departamento_save,
                "municipio": municipio_save,
                "zona": zona_save,
                "direccion": direccion,
                "indicacion": indicacion,
                "content_type": content_save,
                "object_id": obj,
                "nombre_barrio": nombre_barrio,
                "tipo_viaprincipal": tipo_viaprincipal,
                "numero_viaprincipal": numero_viaprincipal,
                "letra_principal": letra_principal,
                "es_bis": es_bis,
                "cuadrante_principal": cuadrante_principal,
                "numero_viasecundaria": numero_viasecundaria,
                "letra_secundaria": letra_secundaria,
                "cuadrante_secundario": cuadrante_secundario,
                "numero_placa": numero_placa,
                "complemento": complemento,
            }
        )
        _log_warn(f"🏙️ Ubicación urbana replicada en {db_alias}: {id_ubicacion}", level="info")
