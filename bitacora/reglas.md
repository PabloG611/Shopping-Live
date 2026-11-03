# Shopping Live — Reglas del proyecto

**Versión:** 2.1
**Última actualización:** 2026-09-18
**Estado:** documento vivo (visión + reglas de negocio consolidadas)

> Este es el documento maestro del proyecto. Une la **visión** (qué queremos construir) y las
> **reglas de negocio** (cómo debe comportarse el sistema sí o sí). Es la brújula: ante una duda
> técnica, volvemos aquí.
>
> Marcas de estado por regla:
> - **[FIRME]** = acordado.
> - **[PROPUESTA]** = sugerencia pendiente de aprobar.
> - **[POR DEFINIR]** = falta decidir.

---

## Historial de versiones

| Versión | Fecha | Cambios |
|---------|-------|---------|
| 1.0 | 2026-09-18 | Visión original (desde `reglas.txt`). |
| 1.1 | 2026-09-18 | Primer borrador de reglas de negocio para revisión. |
| 2.0 | 2026-09-18 | Consolidación visión + reglas de negocio en un solo documento; aplicadas las decisiones del equipo (una tienda por persona, sin split de pagos, tiempos de reserva configurables, envío incluido en el precio, control riguroso de tiendas). |
| 2.1 | 2026-09-18 | Sección 8 (Anti-fraude) aprobada: R8.1–R8.4 pasan a FIRME. Queda pendiente solo R8.5 (asesoría legal / T&C). |

---

# PARTE A — Visión

## A.1. Idea general
Plataforma para comprar en vivo (tipo lives de venta de ropa), que elimina la fricción actual de
TikTok + WhatsApp. Capacidades: usuarios, lives, creación de tiendas, compras e interacción (chat).
Pensada a nivel profesional y con escalabilidad a servidores de mayor capacidad.

## A.2. Problema que resuelve
Hoy, en los lives de venta por redes: el usuario toma pantallazo, escribe por WhatsApp, espera a que
alguien le confirme disponibilidad, y el pago/despacho se controla a mano. Se pierde stock, tiempo e
interés. La tienda depende de una persona revisando WhatsApp y conciliando pagos manualmente.
**Shopping Live integra live + stock en tiempo real + compra + pago en un solo flujo.**

## A.3. Los dos productos
- **App móvil (compradores):** experiencia tipo TikTok, feed vertical, al alcance del celular.
- **Panel web (tiendas):** herramienta de gestión para crear la tienda, subir productos, transmitir y administrar.

---

# PARTE B — Reglas de negocio

## 1. Actores
- **Comprador (usuario):** usa la **app móvil**. Ve lives, aparta y paga prendas.
- **Tienda (empresa vendedora):** usa el **panel web**. Crea tienda, sube productos, transmite lives, gestiona pedidos.
- **Plataforma (nosotros):** dueña del sistema. Define reglas, cobra comisión, opera la infraestructura, aprueba tiendas.

## 2. Stock y venta en vivo (núcleo del producto)
- **R2.1 [FIRME]** El stock se maneja **por variante** (ej. "camiseta roja talla M" tiene su propio inventario).
- **R2.2 [FIRME]** La **tienda decide qué prendas y qué tallas muestra** en cada live.
- **R2.3 [FIRME]** Al apartar una prenda, el sistema **reserva** el stock por una **ventana de pago configurable por la tienda** (la tienda define el tiempo por prenda).
- **R2.4 [FIRME]** La tienda puede **extender el tiempo de la ventana durante el live** si lo considera necesario.
- **R2.5 [FIRME]** Durante la reserva, ese stock **no está disponible** para nadie más; el contador visible baja al instante para todos.
- **R2.6 [FIRME]** Si el comprador **no paga** dentro de la ventana, la reserva **expira** y el stock se **libera automáticamente**.
- **R2.7 [FIRME]** Un comprador puede **apartar varias variantes y pagarlas en una sola orden**; la ventana de pago aplica al conjunto.
- **R2.8 [FIRME]** El sistema **nunca permite sobreventa**: jamás se vende dos veces la misma unidad (control atómico de inventario).
- **R2.9 [FIRME]** La tienda puede **aumentar el stock en vivo** si tiene más unidades de las registradas. (Solo puede subir el disponible real; nunca comprometer unidades ya vendidas/reservadas.)
- **R2.10 [FIRME]** La tienda puede definir un **límite de unidades por comprador**. Si un usuario necesita más de lo permitido, debe **contactar directamente con la tienda**, respetando el proceso de compra de esa tienda.

## 3. Tiendas
- **R3.1 [FIRME] (CRÍTICA)** Toda tienda debe **registrarse y pasar un control riguroso de verificación/aprobación** de la plataforma antes de vender. Objetivo: evitar que actores fraudulentos creen tiendas, cobren y no despachen, dejando a la plataforma expuesta legalmente. Este proceso debe diseñarse con especial cuidado (ver sección 8, Anti-fraude).
- **R3.2 [FIRME]** La tienda personaliza su apariencia **eligiendo opciones de configuración** (tema, colores, layout, secciones). **Nunca** escribe ni toca código fuente (sistema "usuario → intérprete → configuración").
- **R3.3 [FIRME]** En la v1, una tienda tiene **un solo live activo a la vez**. El **multi-live** es una **suscripción adicional** (feature de pago futura).
- **R3.4 [FIRME]** La tienda gestiona sus propios productos, precios, fotos, descripciones y **códigos de descuento**.
- **R3.5 [FIRME]** **Una tienda por persona.** Una identidad (análogo a la cédula: una persona = una tienda) representa exactamente una tienda.

## 4. Pagos y comisión
- **R4.1 [FIRME]** Medio principal: **PSE** a través de una **pasarela agregadora** (Wompi/Bold/etc.). Otros medios (Nequi, tarjeta) opcionales según la pasarela.
- **R4.2 [PROPUESTA]** Modelo base: **comisión a la tienda** (% por venta; el comprador paga el precio publicado). El **porcentaje se define cuando el producto esté terminado**.
- **R4.3 [FIRME]** **Sin split de pagos.** El **pago va directo a la tienda** (evita que la plataforma sea intermediaria de fondos y reduce riesgo legal/fiscal). A cambio, se refuerzan los mecanismos **anti-estafa** (sección 8).
- **R4.4 [FIRME]** Cada pago queda ligado a una **referencia única**; su estado (pendiente/confirmado/fallido) se **concilia automáticamente** con la pasarela. Sin verificación manual.

## 5. Compradores
- **R5.1 [FIRME]** Para comprar **se requiere cuenta**, con **todos los datos necesarios** para asociar la venta, despachar y dar soporte. No hay compra como invitado en la v1.
- **R5.2 [FIRME]** El comprador puede **buscar** tiendas/productos, **suscribirse** a tiendas y recibir **notificaciones** (ej. "tu tienda favorita está en vivo").
- **R5.3 [FIRME]** El comprador tiene **historial** de compras y **mensajería por orden** con la tienda (guías, peticiones, reclamos).

## 6. Envíos
- **R6.1 [FIRME]** La **tienda gestiona su propio envío** con su transportadora. La plataforma no opera la logística en la v1: la tienda **sube la guía** y se le notifica al comprador.
- **R6.2 [FIRME]** El **costo de envío va integrado en el precio del producto** (no se cobra aparte).

## 7. Reglas transversales (calidad del sistema)
- **R7.1 [FIRME]** Multitienda desde el inicio, con **aislamiento de datos por tienda**.
- **R7.2 [FIRME]** Ningún actor toca el **código fuente**; toda personalización es por configuración.
- **R7.3 [FIRME]** El sistema se diseña para **escalar** (hoy VM, mañana servidores mayores) sin reescribir el núcleo.

## 8. Anti-fraude y protección de la plataforma (CRÍTICO)
> Como el pago va directo a la tienda (sin split), la plataforma no retiene el dinero, pero **sí es la
> cara visible**. Hay que blindarse para no terminar como los "demandados" por una tienda que estafe.
Reglas objetivo (a detallar en diseño):
- **R8.1 [FIRME]** Verificación de identidad del dueño de la tienda (documento, datos de contacto reales, posiblemente validación bancaria de la cuenta que recibe pagos).
- **R8.2 [FIRME]** Términos y condiciones que dejen **explícito que la tienda es la responsable de la venta y el despacho**, y que la plataforma es un facilitador tecnológico.
- **R8.3 [FIRME]** Sistema de **reputación/reclamos**: los compradores pueden reportar incumplimientos; tiendas con reportes se suspenden.
- **R8.4 [FIRME]** Registro/auditoría de cada venta (quién vendió, qué, a quién, guía de envío) para respaldo ante disputas.
- **R8.5 [POR DEFINIR]** Definir con asesoría legal la figura correcta y los T&C. (Recomendado antes de lanzar; requiere abogado, no es parte del código.)

---

## 9. Fuera de alcance de la v1
- Multi-live simultáneo (será suscripción aparte).
- Logística de envíos operada por la plataforma.
- Compra como invitado.
- Split de pagos / plataforma como intermediaria de fondos.
- App para tiendas (las tiendas usan web).

## 10. Pendientes de decisión
- [ ] R4.2 — Porcentaje de comisión (se define al terminar el producto).
- [ ] R8.5 — Figura legal y T&C con asesoría (anti-fraude).
- [ ] Confirmar los **[PROPUESTA]** de la sección 8.
