# Organizaciones Externas — Gateway

Base URL: `/api-gateway/organizaciones-externas/`

Administra las tablas `ExternalOrganization` (organizaciones externas que consumen endpoints del gateway con un `api-key` en vez de JWT — hoy usado por ProtecDoc) y `ExternalEndpoint` (qué endpoints tiene autorizados cada organización). Son la contraparte de [`endpoints-catalogo.md`](./endpoints-catalogo.md) (`Endpoint`/`EndpointsRole`), pero para acceso de sistemas externos en vez de usuarios con rol.

Todos los endpoints de este documento requieren JWT válido en el header `Authorization: Bearer <token>` (se valida con `autenticar_jwt`) — **esto es para administrar el catálogo**, no confundir con el mecanismo de `api-key` que usan las organizaciones externas para consumir el proxy.

Implementación: [`gateway/views.py`](../../views.py) (funciones `listar_organizaciones`, `guardar_organizacion`, `eliminar_organizacion`, `listar_endpoints_externos`, `guardar_endpoint_externo`, `eliminar_endpoint_externo`). Rutas: [`gateway/urls.py`](../../urls.py).

---

## Cómo encaja esto con el proxy

Cuando `proxy()` recibe una petición ([`gateway/views.py:743`](../../views.py#L743)), antes de exigir JWT + rol, pregunta:

```python
if ExternalAuthService.validate_external_endpoint(request, safe_path):
    # se sirve sin JWT ni validación de rol
```

`validate_external_endpoint` (en [`custom_auth/services/external_auth.py`](../../../custom_auth/services/external_auth.py)) exige un header `api-key` con este formato (antes de codificar en base64):

```
<secreto (60 chars)><separador><nombre_organizacion>:<fecha_expiracion YYYY-MM-DD>
```

- El **secreto** esperado se busca en el `.env` como `API_KEY_{NOMBRE_ORGANIZACION}` (en mayúsculas) — cada organización tiene su propio secreto, no uno compartido.
- El **nombre de la organización** es el segundo campo del token, y debe existir como `ExternalOrganization.name` (comparación exacta, sensible a mayúsculas).
- La **fecha** de expiración no puede ser anterior a hoy.
- Además de que el `api-key` sea válido, la organización debe tener ese `endpoint` puntual autorizado en `ExternalEndpoint` — si el secreto y la fecha son correctos pero la organización no tiene el endpoint asociado aquí, el acceso se deniega igual.

O sea: este CRUD es lo que decide, para una organización ya autenticada por su `api-key`, **a cuáles endpoints puede llegar**. Sin un registro en `ExternalEndpoint`, ninguna organización pasa el bypass aunque su `api-key` sea perfectamente válido.

> El valor de `endpoint` contra el que compara `validate_external_endpoint` es el normalizado: `bk_service` + `safe_path`, con segmentos dinámicos reemplazados vía `_normalizar_ruta_endpoint` (mismo criterio que usa `_validar_permiso_endpoint` para el catálogo interno). Para una petición con header `bk-service: api-ser` a `/api-gateway/ctarc/consulta-idSp/`, el valor a usar en `Endpoint.endpoint` (y por lo tanto en `ExternalEndpoint`) es `api-ser/ctarc/consulta-idSp/` — con el prefijo del backend y el slash final, tal como quedaría en el catálogo (`GET /api-gateway/endpoints/`).

---

## 1. Listar organizaciones

**`GET /api-gateway/organizaciones-externas/`**

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params (opcionales)

| Parámetro | Descripción |
|---|---|
| `filtro` | Substring sobre `name` (`icontains`) |

### Respuesta exitosa

```json
{
  "organizaciones": [
    {
      "id_external_organization": "9f1c2a3b-...",
      "name": "ProtecDoc"
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
curl -X GET "https://ecosistemadesarrollo.unp.gov.co/api-gateway/organizaciones-externas/" \
  -H "Authorization: Bearer <jwt>"
```

---

## 2. Guardar organización (crear / renombrar)

**`POST /api-gateway/organizaciones-externas/guardar/`**

Sin `id_external_organization`, crea (o reutiliza vía `update_or_create` si el nombre ya existe, por ser único). Con `id_external_organization`, renombra ese registro.

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body

| Campo | Requerido | Descripción |
|---|---|---|
| `id_external_organization` | No | UUID de la organización a renombrar |
| `name` | Sí | Nombre de la organización — **debe coincidir exacto con el segundo campo del `api-key`** que use esa organización, y con el sufijo de `API_KEY_{NOMBRE}` en el `.env` (en mayúsculas) |

### Respuesta exitosa

```json
{
  "mensaje": "Organización guardada correctamente",
  "organizacion": { "id_external_organization": "9f1c2a3b-...", "name": "ProtecDoc" }
}
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta el campo `name` |
| `401` | Token ausente, inválido o revocado |
| `404` | Se envió `id_external_organization` pero no existe |
| `409` | Ya existe una organización con ese nombre |
| `500` | Error interno al guardar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/organizaciones-externas/guardar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "ProtecDoc"}'
```

---

## 3. Eliminar organización

**`POST /api-gateway/organizaciones-externas/eliminar/`** (también acepta `DELETE`)

Elimina la organización y, en cascada, todas sus autorizaciones de endpoint (`ExternalEndpoint`).

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body (o query param)

| Campo | Requerido | Descripción |
|---|---|---|
| `id_external_organization` | Sí | UUID de la organización a eliminar |

### Respuesta exitosa

```json
{ "mensaje": "Organización eliminada correctamente" }
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta `id_external_organization` |
| `401` | Token ausente, inválido o revocado |
| `404` | No existe una organización con ese id |
| `500` | Error interno al eliminar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/organizaciones-externas/eliminar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_external_organization": "9f1c2a3b-..."}'
```

---

## 4. Listar endpoints autorizados por organización

**`GET /api-gateway/organizaciones-externas/endpoints/`**

### Cómo enviarlo

`Authorization: Bearer <jwt>`

### Query params (opcionales)

| Parámetro | Descripción |
|---|---|
| `id_endpoint` | Filtra por UUID del endpoint |
| `id_external_organization` | Filtra por UUID de la organización |

### Respuesta exitosa

```json
{
  "endpoints_externos": [
    {
      "id_external_endpoint": "3a7b9c10-...",
      "id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a",
      "endpoint": "api-sgai/gi/infraestructura/casos",
      "id_external_organization": "9f1c2a3b-...",
      "organizacion": "ProtecDoc"
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
curl -X GET "https://ecosistemadesarrollo.unp.gov.co/api-gateway/organizaciones-externas/endpoints/?id_external_organization=9f1c2a3b-..." \
  -H "Authorization: Bearer <jwt>"
```

---

## 5. Autorizar endpoint a una organización (crear / actualizar)

**`POST /api-gateway/organizaciones-externas/endpoints/guardar/`**

Sin `id_external_endpoint`, autoriza (crea, o reutiliza si ya existía) el par endpoint/organización. Con `id_external_endpoint`, reasigna ese registro puntual (cambiar a qué endpoint u organización apunta).

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body

| Campo | Requerido | Descripción |
|---|---|---|
| `id_external_endpoint` | No | UUID del registro a actualizar |
| `id_endpoint` | Sí si no hay `id_external_endpoint`; opcional para reasignar en un update | UUID del endpoint (del catálogo `Endpoint`, ver `GET /api-gateway/endpoints/`) |
| `id_external_organization` | Sí si no hay `id_external_endpoint`; opcional para reasignar en un update | UUID de la organización |

### Respuesta exitosa

```json
{
  "mensaje": "Endpoint externo guardado correctamente",
  "endpoint_externo": {
    "id_external_endpoint": "3a7b9c10-...",
    "id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a",
    "endpoint": "api-sgai/gi/infraestructura/casos",
    "id_external_organization": "9f1c2a3b-...",
    "organizacion": "ProtecDoc"
  }
}
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta `id_endpoint` o `id_external_organization` (creando sin `id_external_endpoint`) |
| `401` | Token ausente, inválido o revocado |
| `404` | `id_external_endpoint`, `id_endpoint` o `id_external_organization` no existen |
| `500` | Error interno al guardar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/organizaciones-externas/endpoints/guardar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_endpoint": "b8f0a6b0-5e3a-4c8a-9c2a-1f2e3d4c5b6a", "id_external_organization": "9f1c2a3b-..."}'
```

---

## 6. Revocar endpoint a una organización

**`POST /api-gateway/organizaciones-externas/endpoints/eliminar/`** (también acepta `DELETE`)

Elimina la autorización (no borra el `Endpoint` ni la `ExternalOrganization`, solo la relación).

### Cómo enviarlo

`Authorization: Bearer <jwt>`
`Content-Type: application/json`

### Body (o query param)

| Campo | Requerido | Descripción |
|---|---|---|
| `id_external_endpoint` | Sí | UUID de la autorización a eliminar |

### Respuesta exitosa

```json
{ "mensaje": "Endpoint externo eliminado correctamente" }
```

### Errores

| Código | Causa |
|---|---|
| `400` | Falta `id_external_endpoint` |
| `401` | Token ausente, inválido o revocado |
| `404` | No existe una autorización con ese id |
| `500` | Error interno al eliminar |

### Ejemplo con curl

```bash
curl -X POST "https://ecosistemadesarrollo.unp.gov.co/api-gateway/organizaciones-externas/endpoints/eliminar/" \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"id_external_endpoint": "3a7b9c10-..."}'
```

---

## Notas

- Estas rutas están registradas explícitamente en `gateway/urls.py` **antes** del catch-all `proxy`, así que no pasan por la lógica de `BK-Service` / endpoint público / validación de rol — solo exigen JWT válido, igual que el CRUD de `Endpoint`/`EndpointsRole`.
- No hay control de rol de administrador: cualquier usuario con JWT válido puede leer y modificar qué organizaciones externas existen y a qué pueden acceder. Si se necesita restringir esto a un perfil de administrador, hay que agregarlo explícitamente.
- `ExternalOrganization.name` es único a nivel de base de datos, pero **no hay `unique_together` en `ExternalEndpoint`** para (endpoint, organización) — `guardar_endpoint_externo` usa `get_or_create` para no duplicar al crear, pero nada impide crear duplicados actualizando `id_endpoint`/`id_external_organization` de dos registros distintos hacia el mismo par.
- Dar de alta una organización aquí (paso 2) es solo la mitad del trabajo para que consuma el proxy: también hay que crear su secreto en el `.env` como `API_KEY_{NOMBRE_EN_MAYUSCULAS}` y reiniciar/redesplegar el servicio para que lo recoja (las variables de entorno no se leen en caliente).
