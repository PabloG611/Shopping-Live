from custom_auth.models.models_global import *
from users.models.models_global import *
from django.contrib.auth.models import User
from typing import Dict, Iterable, Optional
from django.db import models, router, transaction, IntegrityError, DatabaseError
from django.core.exceptions import ValidationError
from django.utils.timezone import now, timedelta
from django.forms.models import model_to_dict
from utils.logger_generico import _log_warn
def safe_model_to_dict(instance):
    data = model_to_dict(instance)
    for key, value in data.items():
        if isinstance(value, uuid.UUID):
            data[key] = str(value)
    return data


def save_data(allData: dict, model: models.Model, pk: int = None) -> int:
    valid_fields = {}
    try:
        with transaction.atomic():
            # 1. Validar y limpiar campos
            # Usamos _meta.fields (no get_fields) para evitar iterar
            # reverse relations y GenericRelation, previniendo asignaciones
            # accidentales a atributos que no son campos reales del modelo.
            for field in model._meta.fields:
                field_name = field.name
                if field_name in allData:
                    if isinstance(field, models.ForeignKey):
                        related_model = field.related_model
                        target_field = field.target_field.name
                        field_value = allData[field_name]

                        if field_value is None:
                            valid_fields[field_name] = None
                        elif not isinstance(field_value, related_model):
                            valid_fields[field_name] = related_model.objects.get(
                                **{target_field: field_value}
                            )
                        else:
                            valid_fields[field_name] = field_value
                    else:
                        valid_fields[field_name] = allData[field_name]

            pk_name = model._meta.pk.name

            # --- MEJORA AQUÍ: Lógica de Identificación ---

            # Si no hay PK, revisamos si hay campos UNIQUE en allData que ya existan
            if pk is None:
                unique_fields = [
                    f.name for f in model._meta.fields
                    if f.unique and f.name in valid_fields
                ]
                for u_field in unique_fields:
                    field_value = valid_fields[u_field]
                    # No buscar por valores vacíos o None para evitar
                    # colisiones accidentales con registros de otros usuarios
                    if field_value is None or field_value == '':
                        continue
                    existing_obj = model.objects.filter(
                        **{u_field: field_value}).first()
                    if existing_obj:
                        # Encontramos el registro por su campo único (ej. número identificación)
                        pk = existing_obj.pk
                        _log_warn(f"Registro existente encontrado en {model.__name__} "
                            f"por campo único '{u_field}' = '{field_value}'", level="info")
                        break

            if pk is not None:
                # UPDATE
                defaults = valid_fields.copy()
                defaults.pop(pk_name, None)

                # Usamos filter().update() o get() + save() para tener más control
                obj = model.objects.get(**{pk_name: pk})
                for key, value in defaults.items():
                    setattr(obj, key, value)

                obj.full_clean()
                obj.save()
                new_record = obj
            else:
                # CREATE
                new_record = model(**valid_fields)
                new_record.full_clean()
                new_record.save()

            return getattr(new_record, pk_name)

    except Exception as e:
        _log_warn(f"Error al guardar datos en {model.__name__}: {e}", level="error")
        raise


def save_session(request, user: User, platform: str, token: str) -> bool:
    try:
        session = Session(
            user=user,
            is_active=True,
            platform=platform,
            ip_address=get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', ''),
            expires_at=now() + timedelta(hours=24)
        )
        session.set_encrypted_token(token)
        session.save()
        return session.id_session
    except DatabaseError as e:
        raise
    except Exception as e:
        raise


def save_refresh(user: User, token: str, fingerprint: str = None) -> bool:
    """
    Guarda refresh token de Microsoft (legacy)

    NOTA: Esta función es para compatibilidad con tokens de Microsoft.
    Para tokens propios, usar RefreshTokenService.create_refresh_token()

    Args:
        user: Usuario
        token: Refresh token de Microsoft (cifrado)
        fingerprint: Fingerprint del dispositivo (opcional para Microsoft)

    Returns:
        True si se guardó exitosamente
    """
    try:
        from datetime import timedelta
        from django.utils import timezone

        # Desactivar refresh tokens antiguos del usuario
        RefreshToken.objects.filter(
            user=user, is_active=True).update(is_active=False)

        # Crear nuevo refresh token
        # Para Microsoft, el token viene cifrado de MSAL
        # Usar un fingerprint genérico si no se proporciona
        expires_at = timezone.now() + timedelta(days=30)  # Microsoft tokens duran más

        refresh_token_obj = RefreshToken.objects.create(
            user=user,
            token=token[:255],  # Truncar si es muy largo
            # Fingerprint genérico para Microsoft
            fingerprint=fingerprint or 'microsoft_token',
            is_active=True,
            expires_at=expires_at
        )

        return True
    except DatabaseError as e:
        raise
    except Exception as e:
        raise


def save_recaptcha(user: User, token: str) -> bool:
    try:
        recaptcha = Recaptcha.objects.create(user=user)
        recaptcha.set_encrypted_token(token)
        recaptcha.is_valid = True
        recaptcha.save()
        return recaptcha.id_recaptcha
    except DatabaseError as e:
        return False
    except Exception as e:
        return False


def save_biometric(user: User, token: str) -> bool:
    try:
        Biometric.objects.filter(
            user=user, is_active=True).update(is_active=False)

        biometric_data = Biometric.objects.create(user=user)
        biometric_data.set_encrypted_token(token)
        biometric_data.save()

        return biometric_data.id_biometric
    except DatabaseError as e:
        _log_warn(f'DatabaseError {e}', level="error")
        return False
    except Exception as e:
        _log_warn(f'Exception {e}', level="error")
        return False


def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0].strip()
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip
