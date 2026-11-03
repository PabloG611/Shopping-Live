# Catálogo de Endpoints y Roles — Gateway

Base URL: `/api-gateway/endpoints/`

Administra las tablas `Endpoint` (catálogo de rutas conocidas por el gateway, usado para el bypass de endpoints públicos, para exigir o no validación de rol vía `rolRequired`, y para bloquear/desbloquear rutas) y `EndpointsRole` (qué `Rol` tiene acceso explícito a cada `Endpoint`, validado en `proxy` cuando `ENVIRONMENT=prod`).

Todos los endpoints de este documento requieren JWT válido en el header `Authorization: Bearer <token>` (se valida con `autenticar_jwt`, igual que el resto del gateway), **y además** que alguno de los roles activos del usuario tenga un `EndpointsRole` explícito sobre la ruta de administración correspondiente, vía `_autorizar_gestion_gateway`. Ver la sección *Namespace `gateway-admin`* más abajo — es la causa más común de "tengo el rol pero me sigue negando el acceso".

Implementación: [`gateway/views.py`](../../views.py) (funciones `listar_endpoints`, `guardar_endpoint`, `eliminar_endpoint`, `listar_endpoints_roles`, `guardar_endpoint_rol`, `eliminar_endpoint_rol`). Rutas: [`gateway/urls.py`](../../urls.py).

---

## 0. Namespace `gateway-admin` — quién puede llamar a estas rutas

Estas 12 rutas (las 6 de este documento + las 6 de [`organizaciones-externas.md`](organizaciones-externas.md)) están registradas explícitamente en `gateway/urls.py` **antes** del catch-all `proxy`, así que nunca pasan por el chequeo normal de `BK-Service` / endpoint público. En su lugar, cada vista llama a `_autorizar_gestion_gateway(request, id_usuario, ruta_admin)` ([`gateway/views.py`](../../views.py), ver [HALLAZGO-U](../../../docs/security/findings-iso27001/HALLAZGO-U-gestion-catalogo-endpoints-sin-rol-admin.md)), que exige un `EndpointsRole` activo sobre un `Endpoint` **virtual**, con clave `gateway-admin/<ruta_admin>` — **no** `api-gateway/<lo que sea>` (el prefijo real de la URL pública) y **no** el path tal cual aparece en `gateway/urls.py`.

Decisión del equipo: existe un único rol de administración (hoy, `Gestor de roles`) con acceso a estas 12 rutas; no hay una distinción más fina por acción dentro de una misma ruta, pero **sí** hay una fila de `EndpointsRole` por ruta — tener permiso en `gateway-admin/endpoints/guardar` no da acceso a `gateway-admin/endpoints/eliminar`.

### Claves exactas a registrar

| Ruta pública (`gateway/urls.py`) | Clave que hay que dar de alta en `Endpoint.endpoint` |
|---|---|
| `GET /api-gateway/endpoints/` | `gateway-admin/endpoints` |
| `POST /api-gateway/endpoints/guardar/` | `gateway-admin/endpoints/guardar` |
| `POST\|DELETE /api-gateway/endpoints/eliminar/` | `gateway-admin/endpoints/eliminar` |
| `GET /api-gateway/endpoints/roles/` | `gateway-admin/endpoints/roles` |
| `POST /api-gateway/endpoints/roles/guardar/` | `gateway-admin/endpoints/roles/guardar` |
| `POST\|DELETE /api-gateway/endpoints/roles/eliminar/` | `gateway-admin/endpoints/roles/eliminar` |
| `GET /api-gateway/organizaciones-externas/` | `gateway-admin/organizaciones-externas` |
| `POST /api-gateway/organizaciones-externas/guardar/` | `gateway-admin/organizaciones-externas/guardar` |
| `POST\|DELETE /api-gateway/organizaciones-externas/eliminar/` | `gateway-admin/organizaciones-externas/eliminar` |
| `GET /api-gateway/organizaciones-externas/endpoints/` | `gateway-admin/organizaciones-externas/endpoints` |
| `POST /api-gateway/organizaciones-externas/endpoints/guardar/` | `gateway-admin/organizaciones-externas/endpoints/guardar` |
| `POST\|DELETE /api-gateway/organizaciones-externas/endpoints/eliminar/` | `gateway-admin/organizaciones-externas/endpoints/eliminar` |

Nótese que **ninguna** de las 12 claves termina en `/`, aunque la ruta de Django sí (`endpoints/roles/eliminar/`, con slash).

### Errores comunes al registrar estas claves (todos reales, detectados en producción)

El campo `Endpoint.endpoint` se compara **carácter a carácter** contra lo que `_validar_permiso_endpoint` calcula en caliente (`f"{bk_service}/{safe_path}"`, normalizado). No hay tolerancia a variaciones — si no coincide exacto, el usuario recibe `403 "No tiene permisos..."` aunque su rol sí tenga un `EndpointsRole` activo sobre *algo* parecido, y además el proxy crea silenciosamente un `Endpoint` nuevo (huérfano, sin rol) la primera vez que alguien pega contra la ruta mal registrada — ver la nota sobre auto-alta más abajo.

1. **Prefijo equivocado** — usar `api-gateway/endpoints/eliminar` (el prefijo de la URL pública, lo que se ve en el navegador) en vez de `gateway-admin/endpoints/eliminar` (la clave interna que realmente usa `_autorizar_gestion_gateway`).
2. **Slash final de más** — copiar el path tal como aparece en `urls.py` (`endpoints/roles/eliminar/`, con slash) en vez de la clave interna sin slash (`endpoints/roles/eliminar`). `gateway-admin/endpoints/roles/eliminar/` y `gateway-admin/endpoints/roles/eliminar` son dos `Endpoint` distintos para Django (`endpoint` es `unique=True` por string exacto).
3. **Nombre "amigable" en vez de la clave real de `BK_API`** — esto no es del namespace `gateway-admin`, pero es el mismo error aplicado al proxy genérico: registrar `hser/consulta-hser` pensando en el nombre del backend, cuando la clave que el proxy realmente resuelve desde el header `BK-Service` es `api-hei` (ver el diccionario `BK_API` en [`gateway/views.py`](../../views.py)). El primer segmento de cualquier `endpoint` fuera de `gateway-admin/` debe ser una clave literal de `BK_API`.

### Cómo verificar antes de asumir "el rol ya tiene acceso"

No basta con ver el `EndpointsRole` en la bandeja — hay que comparar el string exacto:

```bash
# 1. ¿Qué endpoints tiene el rol hoy?
curl -X GET "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/?id_rol=8401" \
  -H "Authorization: Bearer <jwt>"

# 2. ¿Coincide el campo "endpoint" EXACTO con la tabla de arriba?
#    (sin slash final, prefijo "gateway-admin/", sin typos)
```

Si el `EndpointsRole` apunta a un `Endpoint` con el string equivocado, el fix es renombrar ese mismo registro (conserva el rol ya asignado, porque `EndpointsRole` referencia por `id_endpoint`, no por el string) en vez de crear uno nuevo:

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/guardar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_endpoint": "<uuid del endpoint mal registrado>", "endpoint": "gateway-admin/endpoints/eliminar"}'
```

---

## 1. Listar endpoints

**`GET /api-gateway/endpoints/`**

Lista el catálogo de endpoints (`Endpoint`).

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params (todos opcionales)

| Parámetro | Descripción |
|---|---|
| `is_active` | `true` / `false` |
| `locked` | `true` / `false` |
| `public` | `true` / `false` |
| `rolRequired` | `true` / `false` |
| `filtro` | Substring sobre el campo `endpoint` (`icontains`) |
| `id_rol` | Filtra a los endpoints con `EndpointsRole` activo para ese `id_rol` — "¿a qué tiene acceso vigente este rol?" (análogo a `filtro`, pero buscando por rol en vez de por ruta; combinable con los demás filtros) |

### Respuesta exitosa

```json
{
  "endpoints": [
    {
      "id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a",
      "endpoint": "api-sgai/gi/infraestructura/casos",
      "is_active": true,
      "rolRequired": true,
      "locked": false,
      "public": false
    }
  ]
}
```

### Errores

| Código | Causa |
|---|---|
| `401` | Token ausente, inválido o revocado |
| `500` | Error interno al consultar |

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/?is_active=true" \
  -H "Authorization: Bearer <jwt>"
```

Buscar por rol en vez de por ruta (equivalente a cruzar `/endpoints/roles/?id_rol=` contra sus endpoints, en un solo llamado):

```bash
curl -X GET "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/?id_rol=8401" \
  -H "Authorization: Bearer <jwt>"
```

---

## 2. Guardar endpoint (crear / actualizar)

**`POST /api-gateway/endpoints/guardar/`**

Crea un endpoint nuevo, o lo actualiza si se envía `id_endpoint`. Sin `id_endpoint`, hace `update_or_create` por el valor de `endpoint` (que es único).

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body

| Campo | Requerido | Descripción |
|---|---|---|
| `id_endpoint` | No | UUID del endpoint a actualizar. Si se omite, se crea (o reutiliza por `endpoint`) |
| `endpoint` | Sí | Ruta normalizada (ej. `api-sgai/gi/infraestructura/casos`) |
| `is_active` | No (default `true`) | Si está inactivo, se trata como bloqueado en la validación del proxy |
| `rolRequired` | No (default `true`) | Si es `false`, el proxy omite la validación de rol para ese endpoint (pasa ligero, sin exigir `EndpointsRole`) aunque el usuario sí debe estar autenticado |
| `locked` | No (default `false`) | Bloqueo manual del endpoint |
| `public` | No (default `false`) | Si es `true`, el proxy no exige JWT ni rol para ese endpoint |

### Respuesta exitosa

```json
{
  "mensaje": "Endpoint guardado correctamente",
  "endpoint": {
    "id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a",
    "endpoint": "api-sgai/gi/infraestructura/casos",
    "is_active": true,
    "rolRequired": true,
    "locked": false,
    "public": false
  }
}
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta el campo `endpoint` |
| `401` | Token ausente, inválido o revocado |
| `404` | Se envió `id_endpoint` pero no existe |
| `409` | Ya existe un endpoint con ese valor (choque de `unique`) |
| `500` | Error interno al guardar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/guardar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"endpoint": "api-sgai/gi/infraestructura/casos", "public": false, "rolRequired": true}'
```

---

## 3. Eliminar endpoint

**`POST /api-gateway/endpoints/eliminar/`** (también acepta `DELETE`)

Elimina un endpoint del catálogo. Al eliminarse, se eliminan en cascada sus `EndpointsRole` asociados (`on_delete=CASCADE`).

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body (o query param)

| Campo | Requerido | Descripción |
|---|---|---|
| `id_endpoint` | Sí | UUID del endpoint a eliminar |

### Respuesta exitosa

```json
{ "mensaje": "Endpoint eliminado correctamente" }
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta `id_endpoint` |
| `401` | Token ausente, inválido o revocado |
| `404` | No existe un endpoint con ese `id_endpoint` |
| `500` | Error interno al eliminar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/eliminar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a"}'
```

---

## 4. Listar roles de endpoints

**`GET /api-gateway/endpoints/roles/`**

Lista las asignaciones endpoint-rol (`EndpointsRole`).

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params (todos opcionales)

| Parámetro | Descripción |
|---|---|
| `id_endpoint` | Filtra por UUID del endpoint |
| `id_rol` | Filtra por id del rol |
| `is_active` | `true` / `false` |

### Respuesta exitosa

```json
{
  "endpoints_roles": [
    {
      "id_endpoints_role": "2c1a9e10-...",
      "id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a",
      "endpoint": "api-sgai/gi/infraestructura/casos",
      "id_rol": 3100,
      "nombre_rol": "GI - Consulta",
      "is_active": true
    }
  ]
}
```

### Errores

| Código | Causa |
|---|---|
| `401` | Token ausente, inválido o revocado |
| `500` | Error interno al consultar |

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/roles/?id_endpoint=b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a" \
  -H "Authorization: Bearer <jwt>"
```

---

## 5. Guardar rol de endpoint (crear / actualizar)

**`POST /api-gateway/endpoints/roles/guardar/`**

Asigna un rol a un endpoint. Con `id_endpoints_role` actualiza ese registro (permite reasignar `endpoint`, `rol` o `is_active`, enviando solo los campos que cambian). Sin `id_endpoints_role`, hace `update_or_create` por el par (`id_endpoint`, `id_rol`) — evita duplicar la misma asignación.

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body

| Campo | Requerido | Descripción |
|---|---|---|
| `id_endpoints_role` | No | UUID del registro a actualizar |
| `id_endpoint` | Sí si no hay `id_endpoints_role`; opcional para reasignar en un update | UUID del endpoint |
| `id_rol` | Sí si no hay `id_endpoints_role`; opcional para reasignar en un update | Id del rol (`Rol.id_rol`) |
| `is_active` | No (default `true`) | Habilita/deshabilita la asignación sin borrarla |

### Respuesta exitosa

```json
{
  "mensaje": "Rol de endpoint guardado correctamente",
  "endpoints_role": {
    "id_endpoints_role": "2c1a9e10-...",
    "id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a",
    "endpoint": "api-sgai/gi/infraestructura/casos",
    "id_rol": 3100,
    "nombre_rol": "GI - Consulta",
    "is_active": true
  }
}
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta `id_endpoint` o `id_rol` (creando sin `id_endpoints_role`) |
| `401` | Token ausente, inválido o revocado |
| `404` | `id_endpoints_role`, `id_endpoint` o `id_rol` no existen |
| `500` | Error interno al guardar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/roles/guardar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a", "id_rol": 3100}'
```

---

## 6. Eliminar rol de endpoint

**`POST /api-gateway/endpoints/roles/eliminar/`** (también acepta `DELETE`)

Elimina una asignación de rol a un endpoint (no elimina el `Endpoint` ni el `Rol`, solo la relación).

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body (o query param)

| Campo | Requerido | Descripción |
|---|---|---|
| `id_endpoints_role` | Sí | UUID de la asignación a eliminar |

### Respuesta exitosa

```json
{ "mensaje": "Rol de endpoint eliminado correctamente" }
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta `id_endpoints_role` |
| `401` | Token ausente, inválido o revocado |
| `404` | No existe una asignación con ese `id_endpoints_role` |
| `500` | Error interno al eliminar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/endpoints/roles/eliminar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_endpoints_role": "2c1a9e10-..."}'
```

---

## Notas

- Estas rutas están registradas explícitamente en `gateway/urls.py` **antes** del catch-all `proxy`, así que no pasan por la lógica de `BK-Service` / endpoint público del proxy genérico — pero sí exigen JWT válido **y** rol, vía su propio namespace `gateway-admin` (ver sección *0* al inicio de este documento), no confundir una cosa con la otra.
- `endpoint` (en `Endpoint`) también se crea automáticamente la primera vez que el `proxy` recibe una petición hacia una ruta nueva (`Endpoint.objects.get_or_create`), con `is_active=True`, `rolRequired=True`, `locked=False`. Estos endpoints "auto-descubiertos" no tienen ningún `EndpointsRole` hasta que se cree uno manualmente aquí.
- `rolRequired` es distinto de `public`: un endpoint `public=True` se sirve sin exigir JWT (bypass total, se ve en `proxy`, no en `_validar_permiso_endpoint`). Un endpoint con `rolRequired=False` sigue exigiendo JWT válido, pero el proxy omite la validación de `EndpointsRole` para ese endpoint (pasa ligero) — útil para endpoints que todo usuario autenticado puede usar sin importar su rol.
