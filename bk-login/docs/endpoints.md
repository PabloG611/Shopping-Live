# Endpoints del aplicativo (bk-login)

Inventario de todas las rutas HTTP expuestas por este proyecto Django
(generado a partir de `python manage.py` + lectura de cada `urls.py`, no a
mano). Tres prefijos principales, montados en [`api/urls.py`](../api/urls.py):

| Prefijo | App | Contenido |
|---|---|---|
| `/api-auth/auth/` | `custom_auth` | Login, 2FA, sesión, Microsoft/AD |
| `/api-auth/users/` | `users` | Datos de usuario, perfiles, roles, catálogos |
| `/api-gateway/` | `gateway` | Proxy hacia otros backends (`api-doc`, `api-sesp`, etc.) + integraciones directas (ProtecDoc, Novasoft, SER) |

Para el detalle de cómo autenticarse (headers `BK-Service` /
`Authorization: Bearer`, y por qué **no** son equivalentes entrar por
`/api-gateway/...` vs. por `/api-auth/...` directo) ver
[`gateway/services/docs/autenticacion-gateway.md`](../gateway/services/docs/autenticacion-gateway.md).

---

## 1. Autenticación — `/api-auth/auth/`

Todas POST. [`custom_auth/urls.py`](../custom_auth/urls.py) →
[`custom_auth/views.py`](../custom_auth/views.py).

| Ruta | Qué hace | Autenticación de entrada |
|---|---|---|
| `` (raíz) | Paso 1 de login: valida usuario/contraseña, dispara 2FA | Ninguna (público) |
| `external/mobile/` | Login para la app móvil externa | Ninguna (público) |
| `microsoft/` | Inicia el flujo de login con Microsoft/AD | Ninguna (público) |
| `microsoft/session/` | Completa la sesión Microsoft (intercambia `code` por tokens propios) | Ninguna (recibe `code` de Microsoft) |
| `microsoft/mobile_session/` | Intercambia un refresh token Microsoft (variante móvil) | Refresh token Microsoft previo |
| `microsoft/permissions/` | Actualiza permisos/consentimiento del usuario Microsoft | JWT (`@jwt_required`) — el único de este grupo que sí valida el access token |
| `2fa/` | Paso 2 de login: valida código TOTP y emite `access_token`/`refresh_token` | `username` + `code2fa` (emitidos en el paso 1) |
| `connect_device/` | Vincula un dispositivo nuevo (confirma TOTP) | Identifica por `username` + `otp_code` en el body, no valida JWT |
| `link_notification/` | Vincula un token de notificaciones push | Identifica por `username` en el body, no valida JWT |
| `unlink_notification/` | Desvincula un token de notificaciones push | Identifica por `username` en el body, no valida JWT |
| `refresh_token/` | Renueva el `access_token` a partir del `refresh_token` (cookie o body) | Requiere `refresh_token` válido + `X-Fingerprint` coincidente |
| `logout/` | Cierra sesión: revoca refresh tokens y pone el access token en blacklist | Identifica por `username` en el body; si viene `Authorization: Bearer`, ese token se blacklistea, pero no es obligatorio para que el logout funcione |

---

## 2. Usuarios — `/api-auth/users/`

[`users/urls.py`](../users/urls.py).

### 2.1 Endpoints funcionales

| Método | Ruta | Qué hace | Autenticación |
|---|---|---|---|
| POST | `register/` | Registro de usuario externo (crea usuario, envía credenciales por email) | Ninguna (`@rate_limit` por correo) |
| POST | `recovery/` | Inicia recuperación de contraseña (siempre responde igual, exista o no el usuario) | Ninguna (`@rate_limit` por username) |
| POST | `validate_recovery/` | Valida el código de recuperación y fija la contraseña nueva | Código de recuperación de un solo uso |
| POST | `update_data/` (`save_data_basic`) | Alta/actualización completa de datos básicos de un usuario | Ninguna a nivel de vista |
| POST | `update_data_colectivo/` (`save_data_colectivo`) | Alta/actualización de datos de colectivos y su representante | Ninguna a nivel de vista |
| POST | `update_data_cerrem/` (`save_data_basic_invitado_cerrem`) | Igual que `update_data/`, además valida contra el backend de SER y asigna rol de invitado CERREM | Ninguna a nivel de vista |
| POST | `data/` (`get_data`) | Devuelve el perfil completo del usuario autenticado (básicos + servicios) y emite un token SP | JWT (`@jwt_required`) |
| GET | `consultarpersona/` (`ConsultarPersonas`) | Busca personas por `username` (query param) | Ninguna a nivel de vista |
| POST | `get_all_data/` | Devuelve todos los datos de un usuario (o colectivo/representante) por `username` | Ninguna a nivel de vista |
| GET | `consecutivos/<int:origen>/` | Genera/consulta el consecutivo para un origen dado | Ninguna a nivel de vista |
| POST | `importarusuario/` (`ImportarUsuario`) | Carga masiva de usuarios desde un archivo Excel | Ninguna a nivel de vista (solo `post_required`) |
| POST | `update_profile/` (`create_update_profiles`) | Crea/actualiza perfiles (`PerfilUsuario`) y asigna rol | Ninguna a nivel de vista |
| GET | `role_range/` | Devuelve el rango numérico de roles (`start`/`end`) para un `grupo` | Ninguna a nivel de vista |
| POST | `crearrol` (`GuardarRoles`) | Crea/actualiza un `Rol` | Ninguna a nivel de vista |
| POST | `role_by_user` (`get_role_by_user_id`) | Devuelve los roles activos de un usuario por `id_usuario` | Ninguna a nivel de vista |
| GET | `users_by_rol/<int:id_rol>/` | Lista los `id_busuario` de los usuarios activos con un rol dado | Ninguna a nivel de vista |
| GET | `consultarrol/` | Bandeja paginada/filtrable/cacheada de usuarios sin rol asignado. **Ver [`users/view/docs/consultarrol.md`](../users/view/docs/consultarrol.md)** | Ninguna a nivel de vista |
| GET | `consultar_funcionario_identificacion/<str:numero_identificacion>/` | Datos de un funcionario migrado, por identificación | Ninguna a nivel de vista |
| POST | `consultar_funcionario_nombre/` | Datos de un funcionario migrado, por nombre | Ninguna a nivel de vista |

> "Ninguna a nivel de vista" significa que la vista no trae
> `@jwt_required` ni `permission_classes` propios; lo único que se aplica es
> el middleware global `SecureRequestMiddleware`, que **no verifica la
> firma del JWT** (solo que el header empiece con `"Bearer "`) — ver el
> apartado *Camino alterno* en
> [`autenticacion-gateway.md`](../gateway/services/docs/autenticacion-gateway.md).

### 2.2 Catálogos (`ModelViewSet`, solo lectura)

Registrados por router en [`users/urls.py`](../users/urls.py) →
[`users/view/api.py`](../users/view/api.py). Todos con
`http_method_names = ['get']` (POST/PUT/PATCH/DELETE responden `405` aunque
el router genere esas rutas), y cada uno expone `<ruta>/` (lista) y
`<ruta>/<pk>/` (detalle):

| Ruta | Modelo | Filtro por querystring |
|---|---|---|
| `pais/` | `Pais` | — |
| `departamento/` | `Departamento` | `?pais=` |
| `municipio/` | `Municipio` | `?departamento=` |
| `zona/` | `ZonaUbicacion` | — |
| `tipoidentificacion/` | `TipoIdentificacion` | — |
| `tipogenero/` | `TipoGenero` | — |
| `tipoestadocivil/` | `EstadoCivil` | — |
| `tipogprh/` | `GpRh` | — |
| `tipofondopensiones/` | `FondoPensiones` | — |
| `tipoeps/` | `Eps` | — |
| `tiposexo/` | `TipoSexo` | — |
| `tiposexual/` | `TipoOrientacionSexual` | — |
| `tipodiferencial/` | `TipoFactorDiferencial` | — |
| `tipovinculacion/` | `TipoVinculacion` | — |
| `dependencia/` | `Dependencia` | — |
| `grupo/` | `Grupo` | `?dependencia=` |
| `rol/` | `Rol` | `?grupo=` |
| `perfil/` | `PerfilUsuario` | `?username=` (requerido; sin él devuelve vacío) |
| `novasoft-funcionarios/` | `FuncionariosMigradosNovasoft` | — |

---

## 3. Gateway — `/api-gateway/`

[`gateway/urls.py`](../gateway/urls.py). Las rutas explícitas se resuelven
**antes** que el proxy genérico y no pasan por su lógica de `BK-Service` /
endpoint público (ver
[`autenticacion-gateway.md`](../gateway/services/docs/autenticacion-gateway.md)).
Las 12 rutas de administración del catálogo (`endpoints/*`,
`organizaciones-externas/*`) sí exigen rol, por su propio namespace
`gateway-admin` — ver la sección *0* de
[`endpoints-catalogo.md`](../gateway/services/docs/endpoints-catalogo.md).

| Método | Ruta | Qué hace | Autenticación |
|---|---|---|---|
| POST | `hser/` | Consulta histórico SER (por cédula o número OT) en un backend externo | Ninguna a nivel de vista |
| POST | `protecdoc/radicado/` | Radica un documento en ProtecDoc | Ninguna (backend-a-backend) |
| GET | `protecdoc/trazabilidad/` | Trazabilidad de un radicado | JWT (`@jwt_required`) |
| GET | `protecdoc/radicado/metadata/` | Metadata de un radicado | JWT (`@jwt_required`) |
| GET | `protecdoc/radicado/detalle/` | Detalle de un radicado | JWT (`@jwt_required`) |
| GET | `protecdoc/v1/documentos/` | Lista documentos de un radicado (v1) | JWT (`@jwt_required`) |
| GET | `protecdoc/v1/documentos/descargar/` | Descarga un documento (v1) | JWT (`@jwt_required`) |
| GET | `protecdoc/v2/documentos/` | Lista documentos de un radicado (v2) | JWT **o** `X-Internal-Token` (mutuamente excluyentes) |
| GET | `protecdoc/v2/documentos/descargar/` | Descarga un documento (v2) | JWT **o** `X-Internal-Token` |
| GET | `novasoft/empleado/` | Consulta empleado en Novasoft | Ninguna (`@jwt_required` está comentado en el código) |
| GET | `endpoints/` | Lista el catálogo de endpoints (`Endpoint`) | JWT (`autenticar_jwt`) |
| POST | `endpoints/guardar/` | Crea/actualiza un endpoint del catálogo | JWT (`autenticar_jwt`) |
| POST/DELETE | `endpoints/eliminar/` | Elimina un endpoint (cascada sobre sus roles) | JWT (`autenticar_jwt`) |
| GET | `endpoints/roles/` | Lista las asignaciones endpoint-rol (`EndpointsRole`) | JWT (`autenticar_jwt`) |
| POST | `endpoints/roles/guardar/` | Crea/actualiza la asignación de un rol a un endpoint | JWT (`autenticar_jwt`) |
| POST/DELETE | `endpoints/roles/eliminar/` | Elimina una asignación de rol a un endpoint | JWT (`autenticar_jwt`) |
| GET | `sockets/` | Lista el catálogo de sockets (`SocketAvailable`) | JWT (`autenticar_jwt`) |
| POST | `sockets/guardar/` | Crea/actualiza un socket del catálogo | JWT (`autenticar_jwt`) |
| POST/DELETE | `sockets/eliminar/` | Elimina un socket (cascada sobre sus roles) | JWT (`autenticar_jwt`) |
| GET | `sockets/roles/` | Lista las asignaciones socket-rol (`SocketAvailableRole`) | JWT (`autenticar_jwt`) |
| POST | `sockets/roles/guardar/` | Crea/actualiza la asignación de un rol a un socket | JWT (`autenticar_jwt`) |
| POST/DELETE | `sockets/roles/eliminar/` | Elimina una asignación de rol a un socket | JWT (`autenticar_jwt`) |
| GET | `organizaciones-externas/` | Lista las organizaciones externas (`ExternalOrganization`) | JWT (`autenticar_jwt`) |
| POST | `organizaciones-externas/guardar/` | Crea/renombra una organización externa | JWT (`autenticar_jwt`) |
| POST/DELETE | `organizaciones-externas/eliminar/` | Elimina una organización (cascada sobre sus endpoints autorizados) | JWT (`autenticar_jwt`) |
| GET | `organizaciones-externas/endpoints/` | Lista qué endpoints tiene autorizados cada organización (`ExternalEndpoint`) | JWT (`autenticar_jwt`) |
| POST | `organizaciones-externas/endpoints/guardar/` | Autoriza un endpoint a una organización externa | JWT (`autenticar_jwt`) |
| POST/DELETE | `organizaciones-externas/endpoints/eliminar/` | Revoca un endpoint autorizado a una organización | JWT (`autenticar_jwt`) |
| Cualquiera | `<cualquier otra ruta>` (`proxy`) | Reenvía la petición al backend indicado en `BK-Service`, aplicando el bypass de endpoint público/externo y la validación JWT + rol cuando corresponde | Depende del catálogo `Endpoint` (público), de `api-key` + `ExternalEndpoint` (externo), o JWT + rol — ver docs dedicadas |

Detalle completo de radicación de documentos y consulta de trazabilidad:
[`gateway/services/docs/protecdoc.md`](../gateway/services/docs/protecdoc.md).

Contrato completo del CRUD de `Endpoint` / `EndpointsRole`:
[`gateway/services/docs/endpoints-catalogo.md`](../gateway/services/docs/endpoints-catalogo.md).

Contrato completo del CRUD de `ExternalOrganization` / `ExternalEndpoint` (acceso vía `api-key` para sistemas externos):
[`gateway/services/docs/organizaciones-externas.md`](../gateway/services/docs/organizaciones-externas.md).

---

## 4. Infraestructura

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health/` | Liveness check |
| GET | `/ready/` | Readiness check |
| GET | `/status/` | Estado del servicio |
| GET | `/metrics/` | Métricas |
| — | `/admin/` | Django Admin (incluye `auth`, `otp_totp`, login con 2FA vía `django-two-factor-auth`) |

---

## Notas

- Esta lista se generó recorriendo el `URLResolver` de Django
  (`get_resolver().url_patterns`) más lectura manual de cada vista para el
  método HTTP real y la autenticación aplicada — no es una transcripción
  literal de los `urls.py` (los routers de DRF generan varias rutas por
  cada catálogo que no están escritas explícitamente).
- "Ninguna a nivel de vista" **no** significa que la ruta sea de acceso
  público en producción: depende del camino de entrada (directo a
  `/api-auth/...` vs. a través de `/api-gateway/...`) y de qué tan
  estrictamente esté configurado `SecureRequestMiddleware`/`ALLOWED_SOURCES`
  en ese ambiente. Ver
  [`autenticacion-gateway.md`](../gateway/services/docs/autenticacion-gateway.md)
  para el detalle de esa diferencia antes de asumir que algo "no tiene auth".
