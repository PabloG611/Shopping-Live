"""
Servicio base para la capa de negocio.

Cada dominio (tiendas, catalogo, ordenes, pagos...) implementa su lógica en un
service que hereda de BaseService. La regla del proyecto: las vistas NO contienen
lógica de negocio, solo delegan en services. Esto evita repetir reglas entre los
clientes web y móvil (ambos llaman al mismo service).
"""
from typing import Generic, Optional, Type, TypeVar

from django.db import models

from core.exceptions import NotFoundError

ModelT = TypeVar("ModelT", bound=models.Model)


class BaseService(Generic[ModelT]):
    """
    Operaciones CRUD comunes sobre un modelo. Las apps extienden con sus reglas.

    Uso:
        class ProductoService(BaseService[Producto]):
            model = Producto
    """

    model: Type[ModelT] = None

    @classmethod
    def _assert_model(cls) -> None:
        if cls.model is None:
            raise NotImplementedError(f"{cls.__name__} debe definir el atributo 'model'.")

    @classmethod
    def get_queryset(cls) -> models.QuerySet:
        cls._assert_model()
        return cls.model.objects.all()

    @classmethod
    def get_by_id(cls, obj_id, *, not_found_msg: str = None) -> ModelT:
        cls._assert_model()
        try:
            return cls.get_queryset().get(pk=obj_id)
        except cls.model.DoesNotExist as exc:
            raise NotFoundError(
                not_found_msg or f"{cls.model.__name__} no encontrado."
            ) from exc

    @classmethod
    def find_by_id(cls, obj_id) -> Optional[ModelT]:
        """Como get_by_id pero devuelve None en vez de lanzar."""
        cls._assert_model()
        return cls.get_queryset().filter(pk=obj_id).first()

    @classmethod
    def create(cls, **data) -> ModelT:
        cls._assert_model()
        return cls.model.objects.create(**data)

    @classmethod
    def update(cls, instance: ModelT, **data) -> ModelT:
        for field, value in data.items():
            setattr(instance, field, value)
        instance.save(update_fields=list(data.keys()) or None)
        return instance

    @classmethod
    def delete(cls, instance: ModelT) -> None:
        instance.delete()
