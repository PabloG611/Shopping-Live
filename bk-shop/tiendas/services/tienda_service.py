"""
Lógica de negocio de tiendas. Compartida por los clientes web y móvil.
"""
from django.utils.text import slugify

from core.base_service import BaseService
from core.exceptions import ConflictError
from tiendas.models import PerfilTienda, Tienda


class TiendaService(BaseService[Tienda]):
    model = Tienda

    @classmethod
    def crear_con_propietario(cls, *, usuario, nombre: str, descripcion: str = "") -> Tienda:
        """Crea una tienda y asigna al usuario como propietario, de forma atómica."""
        slug = cls._slug_unico(nombre)
        tienda = cls.create(nombre=nombre, slug=slug, descripcion=descripcion)
        PerfilTienda.objects.create(
            usuario=usuario, tienda=tienda, rol=PerfilTienda.Rol.PROPIETARIO
        )
        return tienda

    @classmethod
    def _slug_unico(cls, nombre: str) -> str:
        base = slugify(nombre) or "tienda"
        slug = base
        contador = 1
        while Tienda.objects.filter(slug=slug).exists():
            contador += 1
            slug = f"{base}-{contador}"
            if contador > 1000:
                raise ConflictError("No fue posible generar un slug único para la tienda.")
        return slug

    @classmethod
    def activar(cls, tienda: Tienda) -> Tienda:
        if tienda.estado == Tienda.Estado.ACTIVA:
            return tienda
        return cls.update(tienda, estado=Tienda.Estado.ACTIVA)
