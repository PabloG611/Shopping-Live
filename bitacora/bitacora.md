# Bitácora Shopping Live

Diario de lo que se hace, por días. Cada día: qué hicimos, qué se decidió y qué sigue.
Los detalles de negocio viven en `reglas.md` y los técnicos en `arquitectura.md`.

---

## 2026-09-18

- Se pasó la idea original de `reglas.txt` a `reglas.md` y se estructuró.
- Se definió el stack y la arquitectura inicial (ver `arquitectura.md`).
- Se cerraron las reglas de negocio con el equipo (ver `reglas.md` v2.0). Decisiones clave:
  una tienda por persona, sin split de pagos (pago directo a la tienda), tiempos de reserva
  configurables por la tienda, envío incluido en el precio, control riguroso de tiendas (anti-fraude).
- Se ordenó la documentación en 3 archivos: `bitacora.md`, `arquitectura.md`, `reglas.md`.

**Pendiente / siguiente paso:**
- Definir dónde vivirá el código (fuera de OneDrive institucional) y la cuenta de GitLab.
- Arrancar Fase 0: estructura del proyecto en local (Docker: Django + Postgres + Redis) + repo GitLab.

---

## 2026-10-17

Arranque de Fase 0: montaje de las bases de los proyectos a partir de repos de referencia del ecosistema UNP (clonados temporalmente fuera de OneDrive para evitar el problema de archivos "solo nube").

**Estructura de carpetas definida en Shopping Live:**
- `bk-login/`  → backend de autenticación (base bk-login; se ampliará a multi-proveedor, no solo Microsoft).
- `bk-shop/`   → backend de negocio multitienda (sirve a web y móvil con la misma API).
- `bk-notificaciones/` → backend de notificaciones (pendiente de limpieza/renombrado).
- `ft-shop-web/` → frontend web (React + Vite) para empresas/negocios y admin. Antes `ft-shop`.
- `ft-shop-app/` → frontend móvil (React Native + Expo) para compradores. Carpeta nueva, por iniciar.

**Decisión de arquitectura confirmada:** dos mundos de cliente (web empresas/admin y móvil
compradores), UN solo backend `bk-shop`. La lógica de negocio vive en la capa `services/` de cada
app y la comparten ambos clientes; lo que cambia por cliente son vistas/serializers, no el negocio.
Móvil = React Native + Expo.

**Trabajo hecho en `bk-shop` (base: bk-sgai, limpiada a fondo):**
- Eliminados los 15 módulos de negocio de la UNP (almacen, contabilidad, contratacion, etc.).
- Core Django renombrado `sgai/` → `shopping_live/` (settings, urls, wsgi, asgi, db_routers).
- `settings.py` reescrito para Shopping Live: una sola base PostgreSQL (multitienda por aislamiento
  lógico), Redis (cache + Channels), Celery, DRF + SimpleJWT, CORS, drf-spectacular. Sin PostGIS,
  Fernet, GDAL ni el middleware perimetral de token interno del ecosistema viejo.
- `requirements.txt` depurado al stack de la bitácora (de ~110 paquetes a ~30).
- Nuevo paquete `core/` UNIVERSAL (clave para no repetir código): `ResponseBuilder`,
  `exceptions` de negocio, `BaseService`, `BaseViewSet`.
- `utils/` reducido a helpers genéricos (logger, paginación, imagen64, dias_nohabiles).
- Primera app de negocio como PATRÓN CANÓNICO: `tiendas/` con la convención completa
  (models/ serializers/ services/ apiviews/ + admin + urls). Modelos `Tienda` y `PerfilTienda`
  (multitienda, tema por configuración). Migración 0001 generada y validada.
- Verificado: `python manage.py check` → sin errores. Dependencias instaladas en el Python global.
- Añadidos `.env.example` y `.env` de desarrollo.

**Pendiente / siguiente paso:**
- Crear las siguientes apps de negocio siguiendo el patrón de `tiendas/`: `catalogo` (Producto,
  VarianteProducto, stock), `ordenes`, `pagos` (capa adaptador de pasarela), `lives`, `chat` (WebSocket).
- Definir la app de autenticación de Shopping Live (web+admin y compradores) — revisar si se reutiliza
  bk-login o se arma propia.
- Limpiar y renombrar `bk-notificaciones`.
- Inicializar `ft-shop-app` (Expo) y revisar/limpiar `ft-shop-web`.
- Levantar PostgreSQL local (Docker) para poder correr migraciones reales y `runserver`.
