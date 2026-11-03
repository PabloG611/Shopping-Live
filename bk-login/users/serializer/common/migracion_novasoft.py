import re
import unicodedata

from rest_framework import serializers
from users.models.models_static import (
    TipoGenero,
    TipoIdentificacion,
    TipoSexo,
    Municipio,
    EstadoCivil,
    FondoPensiones,
    Eps,
)
from users.models.models_static import Grupo, Rol


    

def extraer_partes_nombre(nombre_completo: str) -> dict:
    """
    Divide un nombre completo en sus partes individuales.

    Reglas (misma lógica que consulta_nombres):
      1 token  → primer_nombre
      2 tokens → primer_nombre + primer_apellido
      3 tokens → primer_nombre + primer_apellido + segundo_apellido
      4+ tokens→ primer_nombre + segundo_nombre + primer_apellido + segundo_apellido
    """
    texto = str(nombre_completo or '').strip().upper()
    texto = unicodedata.normalize('NFD', texto)
    texto = ''.join(ch for ch in texto if unicodedata.category(ch) != 'Mn')
    texto = re.sub(r'\s+', ' ', texto).strip()

    tokens = [t for t in texto.split() if t]

    partes = {
        'primer_nombre': '',
        'segundo_nombre': '',
        'primer_apellido': '',
        'segundo_apellido': '',
    }


    if not tokens:
        return partes

    # 1 token → primer_nombre
    if len(tokens) == 1:
        partes['primer_nombre'] = tokens[0]

    # 2 tokens → primer_apellido + primer_nombre
    elif len(tokens) == 2:
        partes['primer_apellido'] = tokens[0]
        partes['primer_nombre'] = tokens[1]

    # 3 tokens → primer_apellido + segundo_apellido + primer_nombre
    elif len(tokens) == 3:
        partes['primer_apellido'] = tokens[0]
        partes['segundo_apellido'] = tokens[1]
        partes['primer_nombre'] = tokens[2]

    # 4+ tokens → primer_apellido + segundo_apellido + primer_nombre + segundo_nombre
    else:
        partes['primer_apellido'] = tokens[0]
        partes['segundo_apellido'] = tokens[1]
        partes['primer_nombre'] = tokens[2]
        partes['segundo_nombre'] = tokens[3]

    return partes


class DataSerializer(serializers.Serializer):
    username = serializers.CharField()
    primer_nombre = serializers.CharField()
    segundo_nombre = serializers.CharField(allow_blank=True, required=False)
    primer_apellido = serializers.CharField(allow_blank=True, required=False)
    segundo_apellido = serializers.CharField(allow_blank=True, required=False)
    numero_documento = serializers.CharField()
    tipo_documento = serializers.CharField()
    sexo = serializers.CharField(allow_blank=True, required=False)
    genero = serializers.CharField(allow_blank=True, required=False)
    ciudad_residencia = serializers.CharField(allow_blank=True, required=False)
    direccion_residencia = serializers.CharField(allow_blank=True, required=False)
    email = serializers.EmailField(allow_blank=True, required=False)
    telefono_residencia = serializers.CharField(allow_blank=True, required=False)
    telefono_celular = serializers.CharField(allow_blank=True, required=False)
    estado_civil = serializers.CharField(allow_blank=True, required=False)
    estado = serializers.CharField(allow_blank=True, required=False)
    fondo_pensional = serializers.CharField(allow_blank=True, required=False)
    eps = serializers.CharField(allow_blank=True, required=False)
    grupo=serializers.CharField(allow_blank=True, required=False)


    @staticmethod
    def _normalizar_texto(valor):
        texto = str(valor or '').strip()
        texto = unicodedata.normalize('NFD', texto)
        texto = ''.join(ch for ch in texto if unicodedata.category(ch) != 'Mn')
        texto = re.sub(r'[^a-zA-Z0-9\s]', ' ', texto)
        texto = re.sub(r'\s+', ' ', texto).strip()
        return texto

    @staticmethod
    def _formatear_nombre_bonito(valor):
        texto = str(valor or '').strip()
        if not texto:
            return ''
        return ' '.join(palabra[:1].upper() + palabra[1:].lower() for palabra in texto.split())

    @staticmethod
    def _buscar_grupo_por_sigla(sigla):
        sigla = str(sigla or '').strip().upper()
        if not sigla:
            return None

        # Caso especial solicitado: si las 4 primeras letras son GURP
        if sigla[:4] == 'GURP':
            return Grupo.objects.filter(siglas__istartswith='GURP').first()
        
        if sigla == 'GPP':
            return Grupo.objects.filter(siglas__istartswith='GHP').first()

        return Grupo.objects.filter(siglas__iexact=sigla).first()

    def _obtener_grupo_desde_texto(self, valor):
        texto_original = str(valor or '').strip()
        texto_normalizado = self._normalizar_texto(texto_original)
        texto_normalizado_mayus = texto_normalizado.upper()

        # Regla especial: si el texto contiene "Director General",
        # el grupo debe ser 9000 (Dirección General).
        if 'DIRECTOR GENERAL' in texto_normalizado_mayus:
            grupo_direccion_general = Grupo.objects.filter(id_grupo=9000).first()
            if not grupo_direccion_general:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 9000 (Dirección General).'
                })
            return grupo_direccion_general

        # Regla especial: si el texto contiene "Despacho Subdirección de Protección",
        # el grupo debe ser 3000 (Subdirección de Protección).
        if 'DESPACHO SUBDIRECCION DE PROTECCION' in texto_normalizado_mayus:
            grupo_subdireccion_proteccion = Grupo.objects.filter(id_grupo=3000).first()
            if not grupo_subdireccion_proteccion:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 3000 (Subdirección de Protección).'
                })
            return grupo_subdireccion_proteccion

        # Regla especial: si el texto contiene "Despacho Secretaría General",
        # el grupo debe ser 5000 (Secretaría General).
        if 'DESPACHO SECRETARIA GENERAL' in texto_normalizado_mayus:
            grupo_secretaria_general = Grupo.objects.filter(id_grupo=5000).first()
            if not grupo_secretaria_general:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 5000 (Secretaría General).'
                })
            return grupo_secretaria_general
        
        # Regla especial: si el texto contiene "Grupo de Planeación Institucional",
        # el grupo debe ser 8003 (Grupo de Planeación Institucional).
        if 'GRUPO DE PLANEACION INSTITUCIONAL' in texto_normalizado_mayus:
            grupo_planeacion_institucional = Grupo.objects.filter(id_grupo=8003).first()
            if not grupo_planeacion_institucional:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 8003 (Grupo de Planeación Institucional).'
                })
            return grupo_planeacion_institucional
        
        # Regla especial: si el texto contiene "Grupo Cuerpo Técnico de Verificación",
        # el grupo debe ser 3005 (Grupo Cuerpo Técnico de Verificación).
        if 'GRUPO CUERPO TECNICO DE VERIFICACION' in texto_normalizado_mayus:
            grupo_cuerpo_tecnico_verificacion = Grupo.objects.filter(id_grupo=3005).first()
            if not grupo_cuerpo_tecnico_verificacion:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 3005 (Grupo Cuerpo Técnico de Verificación).'
                })
            return grupo_cuerpo_tecnico_verificacion
        
        # Regla especial: si el texto contiene "Despacho Subdirección Evaluación Riesgo",
        # el grupo debe ser 2000 (Despacho Subdirección Evaluación Riesgo).        
        if 'DESPACHO SUBDIRECCION EVALUACION RIESGO' in texto_normalizado_mayus:
            grupo_despacho_evaluacion_riesgo = Grupo.objects.filter(id_grupo=2000).first()
            if not grupo_despacho_evaluacion_riesgo:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 2000 (Despacho Subdirección Evaluación Riesgo).'
                })
            return grupo_despacho_evaluacion_riesgo
        
        # Regla especial: si el texto contiene "Despacho Subdirección de Talento Humano",
        # el grupo debe ser 4000 (Despacho Subdirección Talento Humano).        
        if 'DESPACHO SUBDIRECCION TALENTO HUMANO' in texto_normalizado_mayus:
            grupo_despacho_talento_humano = Grupo.objects.filter(id_grupo=4000).first()
            if not grupo_despacho_talento_humano:
                raise serializers.ValidationError({
                    'grupo': 'No se encontró el grupo 4000 (Despacho Subdirección Talento Humano).'
                })
            return grupo_despacho_talento_humano
        
        sigla_match = re.search(r'\(([^)]+)\)', texto_original)
        if sigla_match:
            sigla = self._normalizar_texto(sigla_match.group(1)).replace(' ', '').upper()
            if sigla:
                grupo_obj = self._buscar_grupo_por_sigla(sigla)
                if grupo_obj:
                    return grupo_obj
                return ''

        palabras = texto_normalizado.split()
        indice_subdireccion = next(
            (indice for indice, palabra in enumerate(palabras) if palabra == 'Subdirección'),
            None,
        )
        if indice_subdireccion is not None:
            sigla = ''.join(
                palabra[0]
                for palabra in palabras[indice_subdireccion:]
                if palabra and palabra[0].isupper()
            ).upper()
            if sigla:
                grupo_obj = self._buscar_grupo_por_sigla(sigla)
                if grupo_obj:
                    return grupo_obj
                raise serializers.ValidationError({'grupo': f'No se encontró grupo con siglas "{sigla}".'})

        rol_obj = Rol.objects.select_related('Grupo').filter(id_rol=9999).first()
        if not rol_obj or not rol_obj.Grupo:
            raise serializers.ValidationError({'grupo': 'No se encontró el grupo asociado al Rol con id_rol=9999.'})

        return rol_obj.Grupo

    def validate(self, data):
        nombre_completo = (data.get('primer_nombre') or '').strip()
        if nombre_completo:
            partes = extraer_partes_nombre(nombre_completo)
            data['primer_nombre'] = partes['primer_nombre']
            data['segundo_nombre'] = partes['segundo_nombre'] or (data.get('segundo_nombre') or '')
            data['primer_apellido'] = partes['primer_apellido'] or (data.get('primer_apellido') or '')
            data['segundo_apellido'] = partes['segundo_apellido'] or (data.get('segundo_apellido') or '')

        data['primer_nombre'] = self._formatear_nombre_bonito(data.get('primer_nombre'))
        data['segundo_nombre'] = self._formatear_nombre_bonito(data.get('segundo_nombre'))
        data['primer_apellido'] = self._formatear_nombre_bonito(data.get('primer_apellido'))
        data['segundo_apellido'] = self._formatear_nombre_bonito(data.get('segundo_apellido'))

        username = (data.get('username') or '').strip()
        username_parts = username.split('.')
        if len(username_parts) != 2 or not all(username_parts):
            raise serializers.ValidationError({'username': 'El username debe tener la estructura "algo.algo".'})

        numero_documento = str(data.get('numero_documento') or '').strip()
        if len(numero_documento) < 5:
            raise serializers.ValidationError({'numero_documento': 'El número de documento debe tener mínimo 5 caracteres.'})

        try:
            data['numero_documento'] = int(numero_documento)
        except (TypeError, ValueError):
            raise serializers.ValidationError({'numero_documento': 'El número de documento debe poder convertirse a entero.'})

        tipo_documento = (data.get('tipo_documento') or '').strip().upper()
        if tipo_documento in ('CC', 'NN'):
            tipo_identificacion = TipoIdentificacion.objects.filter(id_tidentificacion=1).first()
            if not tipo_identificacion:
                raise serializers.ValidationError({'tipo_documento': 'No existe TipoIdentificacion con id_tidentificacion=1.'})
            data['tipo_documento'] = tipo_identificacion
        else:
            raise serializers.ValidationError({'tipo_documento': 'El tipo_documento debe ser "CC" o "NN".'})

        sexo = (data.get('sexo') or '').strip().upper()
        id_tsexo = None
        id_tgenero = None

        if sexo == 'M':
            id_tsexo = 1
            id_tgenero = 2
        elif sexo == 'F':
            id_tsexo = 2
            id_tgenero = 1
        elif sexo == '':
            data['sexo'] = None
            data['genero'] = None
        else:
            # Campo opcional: si no cumple regla, enviar None
            data['sexo'] = None
            data['genero'] = None

        if id_tsexo is not None and id_tgenero is not None:
            data['sexo'] = TipoSexo.objects.filter(id_tsexo=id_tsexo).first()
            data['genero'] = TipoGenero.objects.filter(id_tgenero=id_tgenero).first()

        ciudad_residencia = data.get('ciudad_residencia')
        municipio_obj = Municipio.objects.filter(id_municipio__iexact=ciudad_residencia).first()
        data['ciudad_residencia'] = municipio_obj if municipio_obj else None

        estado_civil_valor = data.get('estado_civil')
        if estado_civil_valor:
            estado_civil_obj = EstadoCivil.objects.filter(nombre_ecivil=estado_civil_valor).first()
            data['estado_civil'] = estado_civil_obj if estado_civil_obj else None
        else:
            data['estado_civil'] = None

        estado = self._normalizar_texto(data.get('estado')).upper()
        if estado == 'ACTIVOS':
            data['estado'] = True
        else:
            data['estado'] = False

        fondo_pensional = self._normalizar_texto(data.get('fondo_pensional')).upper()
        mapa_fondo_pensional = {
            'ADMINISTRADORA COLOMBIANA DE PENSIONES COLPENSIONES': 1,
            'COLPENSIONES': 1,
            'PORVENIR': 2,
            'PROTECCION': 3,
            'COLFONDOS': 4,
        }

        if fondo_pensional:
            id_fpensiones = mapa_fondo_pensional.get(fondo_pensional)
            if id_fpensiones is not None:
                fondo_pensional_obj = FondoPensiones.objects.filter(id_fpensiones=id_fpensiones).first()
            else:
                fondo_pensional_obj = FondoPensiones.objects.filter(nombre_fpensiones__iexact=fondo_pensional).first()
            data['fondo_pensional'] = fondo_pensional_obj if fondo_pensional_obj else None
        else:
            data['fondo_pensional'] = None

        eps_json = self._normalizar_texto(data.get('eps')).upper()
        mapa_eps = {
            'NUEVA EPS': 1,
            'RECAUDO SGP CAPITAL SALUD': 2,
            'CAPITAL SALUD': 2,
            'ALIANSALUD EPS': 4,
            'ALIANSALUD': 4,
            'COMPENSAR ENTIDAD PROMOTORA DE SALUD': 5,
            'COMPENSAR': 5,
            'E P S SANITAS': 6,
            'EPS SANITAS': 6,
            'SANITAS': 6,
            'FAMISANAR': 7,
            'SALUD TOTAL S A': 8,
            'SALUD TOTAL': 8,
            'COOMEVA EPS': 9,
            'COOMEVA': 9,
            'EPS SURA': 10,
            'SURA': 10,
        }

        if eps_json:
            id_eps = mapa_eps.get(eps_json)
            if id_eps is not None:
                eps_obj = Eps.objects.filter(id_eps=id_eps).first()
            else:
                eps_obj = Eps.objects.filter(nombre_eps__iexact=eps_json).first()
            data['eps'] = eps_obj if eps_obj else None
        else:
            data['eps'] = None

        data['grupo'] = self._obtener_grupo_desde_texto(data.get('grupo'))
        return data