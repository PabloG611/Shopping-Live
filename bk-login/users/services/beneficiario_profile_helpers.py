"""
Helpers para registro en ASP (beneficiario, protección) y perfiles locales.
"""

from typing import Any, List

import requests
from django.contrib.auth.models import User
from django.utils import timezone

from custom_auth.exceptions import ValidationError
from users.models.models_global import PerfilUsuario
from utils.save_data import save_data
from utils.logger_generico import _log_warn

ASP_DEPENDENCIA = 3000
ASP_GRUPO = 3000
BENEFICIARIO_ROL = 3099
PROTECCION_ROL = 3098


def parse_asp_api_error_message(
    response: requests.Response, service_label: str
) -> str:
    """Extrae un mensaje legible desde la respuesta de error de ASP."""
    try:
        body = response.json()
    except ValueError:
        body = None

    if isinstance(body, dict) and body:
        messages: List[str] = []
        for field_errors in body.values():
            if isinstance(field_errors, list):
                messages.extend(str(msg) for msg in field_errors if msg)
            elif field_errors:
                messages.append(str(field_errors))
        if messages:
            return " ".join(messages)

    text = (response.text or "").strip()
    if text:
        return text[:500]

    return (
        f"Error en el servicio de registro de {service_label} "
        f"(código {response.status_code})"
    )


def ensure_asp_profile(
    basicos_usuario: Any,
    user_instance: User,
    rol: int,
    profile_label: str,
) -> None:
    """Crea o reactiva un perfil ASP (dependencia/grupo 3000) si no está activo."""
    active_profile = PerfilUsuario.objects.filter(
        user=user_instance,
        dependencia=ASP_DEPENDENCIA,
        grupo=ASP_GRUPO,
        rol=rol,
        activo=True,
    ).first()
    if active_profile:
        _log_warn(f"Perfil de {profile_label} activo ya existe para {user_instance.username} (ID: {active_profile.id_pusuario})", level="info")
        return

    inactive_profile = (
        PerfilUsuario.objects.filter(
            user=user_instance,
            dependencia=ASP_DEPENDENCIA,
            grupo=ASP_GRUPO,
            rol=rol,
            activo=False,
        )
        .order_by("-fecha_actualizacion", "-id_pusuario")
        .first()
    )

    if inactive_profile:
        inactive_profile.activo = True
        if basicos_usuario:
            inactive_profile.basicos_usuario = basicos_usuario
        inactive_profile.fecha_actualizacion = timezone.now().date()
        inactive_profile.save(
            update_fields=["activo", "basicos_usuario", "fecha_actualizacion"]
        )
        _log_warn(f"Perfil de {profile_label} reactivado para {user_instance.username} (ID: {inactive_profile.id_pusuario})", level="info")
        return

    datos_perfil = {
        "dependencia": ASP_DEPENDENCIA,
        "grupo": ASP_GRUPO,
        "rol": rol,
        "basicos_usuario": basicos_usuario,
        "user": user_instance.id,
        "activo": True,
    }
    _log_warn(f"Creando perfil de {profile_label}: {datos_perfil}", level="info")
    save_data(datos_perfil, PerfilUsuario)


def handle_asp_api_response(
    response: requests.Response,
    basicos_usuario: Any,
    user_instance: User,
    rol: int,
    error_code: str,
    service_label: str,
    profile_label: str,
    log_action: str,
) -> None:
    """
    Solo HTTP 201 confirma registro y asigna perfil.
    Cualquier otro código lanza ValidationError (rollback vía atomic del caller).
    """
    _log_warn(f"Respuesta {log_action}: {response.status_code}", level="info")

    if response.status_code == 201:
        ensure_asp_profile(basicos_usuario, user_instance, rol, profile_label)
        return

    message = parse_asp_api_error_message(response, service_label)
    _log_warn(f"{log_action} rechazado para {user_instance.username}: {message}", level="warning")
    raise ValidationError(
        message=message,
        code=error_code,
        details={
            "status_code": response.status_code,
            "body": (response.text or "")[:1000],
        },
    )


def handle_beneficiario_api_response(
    response: requests.Response,
    basicos_usuario: Any,
    user_instance: User,
) -> None:
    handle_asp_api_response(
        response,
        basicos_usuario,
        user_instance,
        rol=BENEFICIARIO_ROL,
        error_code="BENEFICIARIO_API_ERROR",
        service_label="beneficiario",
        profile_label="beneficiario",
        log_action="insert beneficiario",
    )


def handle_proteccion_api_response(
    response: requests.Response,
    basicos_usuario: Any,
    user_instance: User,
) -> None:
    handle_asp_api_response(
        response,
        basicos_usuario,
        user_instance,
        rol=PROTECCION_ROL,
        error_code="PROTECCION_API_ERROR",
        service_label="protección",
        profile_label="protección",
        log_action="insert protección",
    )
