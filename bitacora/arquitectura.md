# Shopping Live — Arquitectura y Stack (propuesta v1)

Documento vivo. Basado en: equipo de 2 personas, con experiencia en Django/Python y React,
proyecto personal para lanzar en serio, **multitienda desde el inicio**.

---

## 1. Principio estratégico

Construir por capas, de lo sólido y barato a lo caro y difícil. **No reinventar el video en vivo.**

| Capa | Dificultad | Estrategia |
|------|-----------|------------|
| 1. Núcleo transaccional (tiendas, productos, stock, órdenes, pagos) | Media | Construir nosotros con Django |
| 2. Realtime (chat, stock en vivo, notificaciones) | Media | Construir con WebSockets (Django Channels) |
| 3. Video en vivo (streaming tipo TikTok) | **Alta / cara** | **Delegar a un servicio especializado** |
| 4. Feed vertical tipo TikTok (app móvil) | Media-alta | React (web PWA primero, móvil después) |

El diferenciador del negocio está en la **capa 1 y 2**: eliminar la fricción de
"¿hay stock? → pantallazo → WhatsApp → pago manual". Ahí es donde ponemos el esfuerzo.

---

## 2. Stack propuesto

### Backend
- **Python + Django + Django REST Framework** → API del núcleo transaccional.
- **Django Channels + WebSockets** → chat del live, stock en tiempo real, notificaciones.
- **PostgreSQL** → base de datos principal (transaccional, multitienda).
- **Redis** → cache, capa de canales para Channels, colas ligeras y contadores de stock en vivo.
- **Celery + Redis** → tareas asíncronas (envío de notificaciones, conciliación de pagos, generación de guías).

### Frontend — DOS productos separados, una sola API
- **Panel web para empresas** → **React web** (TypeScript). Herramienta de gestión: dashboards, tablas,
  formularios, módulos de la tienda. La web es más cómoda para trabajar con muchos datos.
- **App para usuarios/compradores** → **React Native** (móvil). Experiencia tipo TikTok, feed vertical,
  al alcance del celular. Es más fácil que el usuario consuma una app que una web.
- Ambos frontends consumen la **misma API de Django REST Framework**.

### Video en vivo (NO construir)
- Fase temprana: integrar un proveedor de streaming en tiempo real (evaluar **Mux**, **Cloudflare Stream Live**, **Agora**, **LiveKit**).
- El backend solo orquesta: crea el "live", recibe eventos, sincroniza stock. El video lo sirve el proveedor por su CDN.

### Pagos
- Medio preferido: **PSE** (y opcionalmente Nequi/tarjetas), integrado a través de una
  **pasarela agregadora** (Wompi, Bold, ePayco, PayU, Mercado Pago) — no integración directa.
- Diseñar la capa de pagos **abstraída** (patrón adaptador) para poder cambiar/sumar pasarelas sin reescribir.
- **PENDIENTE CRÍTICO (modelo de negocio):** ¿a quién se le cobra la comisión?
  - a) a la tienda (marketplace clásico), b) recargo al usuario, c) suscripción de la tienda.
- **PENDIENTE CRÍTICO (arquitectura):** ¿habrá **split de pagos** (el dinero pasa por la plataforma
  y se reparte a las tiendas)? Esto tiene implicaciones legales/fiscales y exige una pasarela que
  soporte *marketplace payments*.

### Infraestructura
- **Docker + Docker Compose** para desarrollo local y despliegue inicial.
- Fase MVP: **una VM en la nube** (OVHcloud sirve; también DigitalOcean/Hetzner) en vez de CPU casera —
  la CPU casera vale para desarrollar, no para servir usuarios reales (IP fija, uptime, ancho de banda, backups).
- Media/fotos de productos → almacenamiento de objetos (S3-compatible: OVH Object Storage, Cloudflare R2).

---

## 3. Modelo de datos multitienda (borrador)

Multitienda = una sola base de datos con aislamiento lógico por `tienda`. Entidades núcleo:

- **Usuario** (comprador) / **PerfilTienda** (vendedor) — un usuario puede ser dueño de una o varias tiendas.
- **Tienda** — nombre, branding/tema (config, NO código), estado.
- **Producto** — pertenece a Tienda; nombre, descripción, precio, fotos.
- **VarianteProducto** — talla/color con su propio **stock**.
- **Live** — pertenece a Tienda; estado, referencia al stream del proveedor, ventana de tiempo de pago.
- **Orden** / **DetalleOrden** — compra de un usuario; ligada a variantes y a stock.
- **Pago** — referencia Nequi, estado (pendiente/confirmado/fallido), conciliación.
- **MensajeChat** — por live y/o por orden (soporte).
- **CodigoDescuento** — por tienda, con reglas.

### Sistema "Usuario → intérprete → código fuente"
La personalización de la tienda se guarda como **datos/configuración** (tema, colores, layout, secciones),
que el frontend **interpreta** para renderizar. El usuario nunca escribe ni toca código: elige opciones
dentro de límites definidos. Esto es un **motor de temas basado en configuración**, no ejecución de código del usuario.

---

## 4. El reto crítico: stock en tiempo real durante el live

Este es el corazón del producto y donde se resuelve la fricción original:

1. El live muestra un producto → todos los espectadores ven el **stock actual**.
2. Un usuario compra → el stock baja **al instante para todos** (vía WebSocket + contador en Redis).
3. Se abre una **ventana de tiempo de pago** (ej. X minutos) que **reserva** el stock.
4. Si paga (Nequi) dentro de la ventana → orden confirmada. Si no → el stock se **libera** automáticamente.

Esto elimina el "pantallazo + WhatsApp + ¿hay o no hay?". Es el diferenciador. Lo diseñamos con cuidado
(reservas con expiración, atomicidad para no vender más de lo que hay).

---

## 5. Roadmap por fases

### Fase 0 — Fundaciones (semana 1–2)
- Repo, Docker Compose (Django + Postgres + Redis), estructura de proyecto, CI básico.
- Modelo de datos núcleo + migraciones. Auth de usuarios y tiendas.

### Fase 1 — Núcleo transaccional (sin video)
- CRUD de tiendas, productos, variantes, stock.
- Feed y vista de producto (React PWA).
- Carrito/orden y motor de reserva de stock con ventana de pago.
- Integración Nequi (capa de pagos abstraída).

### Fase 2 — Realtime
- Chat con WebSockets. Stock en vivo. Notificaciones.
- Módulos de tienda: sala de pedidos, sala de pagos, historial, mensajería.

### Fase 3 — Video en vivo
- Integrar proveedor de streaming. Vincular live ↔ producto ↔ stock.
- Feed vertical con lives activos.

### Fase 4 — Escala y pulido
- App móvil (React Native), recomendación del feed, suscripciones, métricas.
- Escalado de infraestructura según demanda real.

---

## 6. Decisiones aún abiertas
- [ ] Confirmar proveedor de video (Mux vs Cloudflare Stream vs LiveKit) — comparar costos por minuto/espectador.
- [ ] Confirmar capacidades reales de la API de Nequi para recaudo automatizado.
- [ ] Definir hosting inicial (OVHcloud vs alternativas) y presupuesto mensual objetivo.
- [ ] PWA web primero vs app nativa desde el inicio.
