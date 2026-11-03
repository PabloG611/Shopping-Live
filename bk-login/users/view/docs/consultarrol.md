# Consultar Roles — Bandeja de usuarios sin rol asignado

Base URL: `/api-auth/users/consultarrol/`

Lista, filtra y pagina los perfiles (`PerfilUsuario`) que aún no tienen un rol
de negocio asignado (`rol__id_rol = 9999`). Es el origen de datos de la
bandeja "Gestión de nuevos usuarios" del front (`ft-ggt-usuarios`).

Implementado como `ConsultarRolesViewSet` (`viewsets.ModelViewSet`,
solo `GET`) en [`users/view/roles.py`](../roles.py).

---

## `GET /api-gateway/users/consultarrol/`

### Cómo enviarlo

```
Authorization: Bearer <jwt>
BK-Service: api-auth
```

### Query params

| Parámetro | Requerido | Descripción |
|---|---|---|
| `dependencia` | No | Filtra por `id_dependencia` exacto |
| `grupo` | No | Filtra por `id_grupo` exacto |
| `filtro` | No | Texto libre. Busca (OR, sin distinguir mayúsculas/tildes según collation) en: **Usuario**, **Id**, **Correo institucional**, **F. de ingreso**, **Nombre completo**, **Tipo de identificación** y **Número de identificación** |
| `page` | No | Número de página, 1-indexado. Default: `1` |

`dependencia` y `grupo` se combinan con `AND` entre sí; `filtro` se combina
con `AND` respecto a los anteriores, pero internamente hace `OR` entre los 7
campos que cubre.

### Reglas de negocio

- Solo perfiles con `rol.id_rol = 9999` (usuarios pendientes de asignación).
- Se excluyen usuarios que tengan más de un `PerfilUsuario` en total (no solo
  dentro de este filtro), sin importar los filtros aplicados.
- Tamaño de página fijo: **30 registros**.

### Respuesta exitosa — `200`

```json
{
  "perfiles": [
    {
      "username": "jperez",
      "uuid": "3d833ae4-b2c9-40b7-be95-14925e84a271",
      "correo": "jperez@unp.gov.co",
      "fecha_ingreso": "2026-03-04",
      "nombre_completo": "Juan Carlos Perez Gomez",
      "tipo_identificacion": "Cédula de ciudadanía",
      "numero_identificacion": "1000100100",
      "tipo_usuario": "Interno"
    }
  ],
  "pagination": {
    "page": 1,
    "per_page": 30,
    "total_pages": 4,
    "total_records": 103,
    "has_next": true,
    "has_previous": false
  }
}
```

| Campo (`perfiles[]`) | Corresponde a | Tipo |
|---|---|---|
| `username` | Usuario | string |
| `uuid` | Id | string (UUID) |
| `correo` | Correo institucional | string |
| `fecha_ingreso` | F. de ingreso | string `YYYY-MM-DD` |
| `nombre_completo` | Nombre completo | string |
| `tipo_identificacion` | Tipo de identificación | string |
| `numero_identificacion` | Número de identificación | string |
| `tipo_usuario` | — | siempre `"Interno"` |

### Errores

| Código | Causa |
|---|---|
| `400` | `page` no es un número de página válido (no numérico o fuera de rango) |
| `405` | Método distinto a `GET` (incluye `/consultarrol/{id}/`, que no expone `retrieve`) |
| `500` | Error inesperado en la consulta (detalle en `message`) |

Cuerpo de error:

```json
{
  "status": "Error",
  "message": "El parámetro page debe ser un número de página válido"
}
```

### Caché

Cada combinación única de `(dependencia, grupo, filtro, page)` se cachea en
Redis por **2 horas**. Una respuesta servida desde caché es idéntica a una
calculada en vivo (mismo JSON), pero no refleja cambios de rol/perfil
ocurridos dentro de esa ventana — no hay invalidación activa por escritura.

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemapruebas.unp.gov.co/api-gateway/users/consultarrol/?grupo=8001&filtro=perez&page=1" \
  -H "Authorization: Bearer <jwt>" \
  -H "BK-Service: api-auth"
```
