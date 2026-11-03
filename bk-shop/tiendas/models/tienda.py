"""
Modelo multitienda. Aislamiento lógico por `tienda`: una sola base de datos y
todo lo demás (productos, lives, órdenes) cuelga de una Tienda.
"""
import uuid

from django.conf import settings
from django.db import models


class Tienda(models.Model):
    """Una tienda/negocio dentro de la plataforma."""

    class Estado(models.TextChoices):
        BORRADOR = "borrador", "Borrador"
        ACTIVA = "activa", "Activa"
        SUSPENDIDA = "suspendida", "Suspendida"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nombre = models.CharField(max_length=150)
    slug = models.SlugField(max_length=160, unique=True)
    descripcion = models.TextField(blank=True)
    estado = models.CharField(
        max_length=20, choices=Estado.choices, default=Estado.BORRADOR
    )
    # Personalización por configuración (motor de temas): el frontend INTERPRETA
    # este JSON para renderizar. El usuario nunca escribe código (ver bitácora §3).
    tema = models.JSONField(default=dict, blank=True)
    creada_en = models.DateTimeField(auto_now_add=True)
    actualizada_en = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tienda"
        ordering = ["-creada_en"]
        verbose_name = "Tienda"
        verbose_name_plural = "Tiendas"

    def __str__(self) -> str:
        return self.nombre


class PerfilTienda(models.Model):
    """
    Relación usuario ↔ tienda con rol. Un usuario puede ser dueño/colaborador de
    varias tiendas (bitácora §3).
    """

    class Rol(models.TextChoices):
        PROPIETARIO = "propietario", "Propietario"
        ADMIN = "admin", "Administrador"
        COLABORADOR = "colaborador", "Colaborador"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="perfiles_tienda",
    )
    tienda = models.ForeignKey(
        Tienda, on_delete=models.CASCADE, related_name="perfiles"
    )
    rol = models.CharField(max_length=20, choices=Rol.choices, default=Rol.PROPIETARIO)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "perfil_tienda"
        unique_together = ("usuario", "tienda")
        verbose_name = "Perfil de tienda"
        verbose_name_plural = "Perfiles de tienda"

    def __str__(self) -> str:
        return f"{self.usuario} · {self.tienda} ({self.rol})"
