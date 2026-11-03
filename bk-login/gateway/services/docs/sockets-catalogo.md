# Catálogo de Sockets y Roles — Gateway

Base URL: `/api-gateway/sockets/`

Administra las tablas `SocketAvailable` (catálogo de sockets) y `SocketAvailableRole` (qué `Rol` tiene acceso a cada socket). Funciona igual que el [catálogo de endpoints](endpoints-catalogo.md): mismas reglas de autenticación, mismos filtros y mismo formato de respuesta.

Implementación: [`gateway/views.py`](../../views.py) (funciones `listar_sockets`, `guardar_socket`, `eliminar_socket`, `listar_sockets_roles`, `guardar_socket_rol`, `eliminar_socket_rol`). Rutas: [`gateway/urls.py`](../../urls.py).

---

## Quién puede llamar a estas rutas

Requieren JWT válido **y** un `EndpointsRole` activo sobre la clave `gateway-admin/<ruta>` correspondiente (ver la sección *Namespace `gateway-admin`* de [`endpoints-catalogo.md`](endpoints-catalogo.md)). Las claves a dar de alta en `Endpoint.endpoint`, sin slash final:

| Ruta pública | Clave en `Endpoint.endpoint` |
|---|---|
| `GET /api-gateway/sockets/` | `gateway-admin/sockets` |
| `POST /api-gateway/sockets/guardar/` | `gateway-admin/sockets/guardar` |
| `POST\|DELETE /api-gateway/sockets/eliminar/` | `gateway-admin/sockets/eliminar` |
| `GET /api-gateway/sockets/roles/` | `gateway-admin/sockets/roles` |
| `POST /api-gateway/sockets/roles/guardar/` | `gateway-admin/sockets/roles/guardar` |
| `POST\|DELETE /api-gateway/sockets/roles/eliminar/` | `gateway-admin/sockets/roles/eliminar` |

---

## 1. Listar sockets — `GET /api-gateway/sockets/`

Query params opcionales: `is_active` (`true`/`false`), `filtro` (substring sobre `socket`), `id_rol` (solo sockets con asignación activa para ese rol).

```json
{
  "sockets": [
    {
      "id_socket_available": "3f1c...",
      "socket": "noti/chat",
      "descripcion": "Chat de notificaciones",
      "is_active": true
    }
  ]
}
```

## 2. Guardar socket — `POST /api-gateway/sockets/guardar/`

| Campo | Requerido | Descripción |
|---|---|---|
| `id_socket_available` | No | UUID a actualizar. Si se omite, `update_or_create` por `socket` |
| `socket` | Sí | Nombre o ruta del socket (único) |
| `descripcion` | No | Texto libre |
| `is_active` | No (default `true`) | Un socket inactivo no se envía en la cookie |

Errores: `400` falta `socket`, `404` `id_socket_available` no existe, `409` `socket` repetido.

## 3. Eliminar socket — `POST|DELETE /api-gateway/sockets/eliminar/`

Body o query param: `id_socket_available`. Borra en cascada sus `SocketAvailableRole`.

## 4. Listar roles de sockets — `GET /api-gateway/sockets/roles/`

Query params opcionales: `id_socket_available`, `id_rol`, `is_active`. Igual que en endpoints, los roles sin sockets aparecen con los campos de socket en `null`.

```json
{
  "sockets_roles": [
    {
      "id_socket_available_role": "9a2b...",
      "id_socket_available": "3f1c...",
      "socket": "noti/chat",
      "id_rol": 3100,
      "nombre_rol": "GI - Consulta",
      "is_active": true
    }
  ]
}
```

## 5. Guardar rol de socket — `POST /api-gateway/sockets/roles/guardar/`

| Campo | Requerido | Descripción |
|---|---|---|
| `id_socket_available_role` | No | UUID del registro a actualizar |
| `id_socket_available` | Sí si no hay `id_socket_available_role` | UUID del socket |
| `id_rol` | Sí si no hay `id_socket_available_role` | `Rol.id_rol` |
| `is_active` | No (default `true`) | Habilita/deshabilita sin borrar |

Sin `id_socket_available_role` hace `update_or_create` por el par socket/rol. Errores: `400`, `404`, `409` (el par ya existe al reasignar).

## 6. Eliminar rol de socket — `POST|DELETE /api-gateway/sockets/roles/eliminar/`

Body o query param: `id_socket_available_role`.

---

## Cookie `sockets_available`

Al iniciar sesión (externo móvil, 2FA, Microsoft web, Microsoft móvil y sesión Microsoft), bk-login envía la cookie `sockets_available` con los sockets activos asignados (con `SocketAvailableRole` activo) a alguno de los roles activos del usuario.

- Valor: lista JSON codificada como URL. En el front: `JSON.parse(decodeURIComponent(valor))` → `["noti/chat", "sgai-alertas"]`.
- Cookie de sesión, `path=/`; `Secure`, `SameSite` y dominio salen de `SECURE_COOKIES`, `AUTH_COOKIE_SAMESITE` y `AUTH_COOKIE_DOMAIN`.
- No es httpOnly por defecto, para que el front la lea. Se cambia con `SOCKETS_COOKIE_HTTPONLY=True`.
- No se emite con `COOKIES=False`. Se borra en el logout.
- No se actualiza en el refresh de tokens: un cambio de roles se refleja en el siguiente login.
- Es solo informativa: el servidor de sockets debe validar el acceso por su cuenta, porque el cliente puede modificar la cookie.
