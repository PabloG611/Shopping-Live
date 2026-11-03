# Cómo conectarse al Gateway — `BK-Service` + `Authorization: Bearer`

Guía para que otro servicio (frontend o backend) llame a un backend de UNP
**a través** del gateway (`/api-gateway/...`) en vez de pegarle directo.
Lógica en [`gateway/views.py`](../../views.py).

> Antes de copiar un ejemplo de otro repo: confirma si ese ejemplo entra por
> `/api-gateway/...` (recomendado, esta guía) o directo por `/api-auth/...`
> (legado, ver [Camino alterno](#camino-alterno-no-recomendado-llamar-api-auth-directo)).
> No son equivalentes en seguridad.

---

## Resumen de headers

| Header | Obligatorio | Para qué sirve |
|---|---|---|
| `Authorization: Bearer <jwt>` | Sí, salvo endpoint público o llamada servicio-a-servicio | Identifica al usuario. Se valida por completo en el gateway antes de reenviar la petición |
| `BK-Service: <clave>` | Sí, siempre que se entra por `/api-gateway/...` | Le dice al gateway **a qué backend** reenviar la petición (ver tabla de claves abajo) |
| `X-Internal-Token: <token>` | Solo llamadas servicio-a-servicio, nunca junto a `Authorization` | Autenticación interna sin usuario (ver [Token interno](#token-interno-servicio-a-servicio)) |
| `X-Fingerprint` | Solo si el JWT es "propio" (no Microsoft) y trae claim `fingerprint` | Debe coincidir con el fingerprint con el que se emitió el token |

---

## 1. Conseguir un JWT

Login de dos pasos contra `bk-login` (`custom_auth`, montado en `/api-auth/auth/`):

1. **`POST /api-auth/auth/`** — `{ "username": "...", "password": "..." }`. Si las
   credenciales son correctas responde `{"twoFARequired": true, ...}` (aún no
   entrega token).
2. **`POST /api-auth/auth/2fa/`** — `{ "username": "...", "code2fa": "..." }`
   (+ `fingerprint`, también aceptado por header `X-Fingerprint`). Responde:
   ```json
   {
     "access_token": "...",
     "refresh_token": "...",
     "session_id": "...",
     "user": { "username": "...", "email": "...", "is_active": true }
   }
   ```
3. **`POST /api-auth/auth/refresh_token/`** cuando expire el `access_token`
   (15 min por defecto). Requiere el mismo `X-Fingerprint`.

Login con Microsoft/AD: `/api-auth/auth/microsoft/` +
`/api-auth/auth/microsoft/session/`.

El `access_token` resultante es lo que va en `Authorization: Bearer <access_token>`.

---

## 2. Llamar al backend a través del gateway (recomendado)

```
<host>/api-gateway/<lo que el backend destino espera después de su propio prefijo>
```

### Claves válidas de `BK-Service`

El gateway resuelve el backend con un diccionario estático
(`BK_API`, [`gateway/views.py`](../../views.py) línea ~45), cada clave apunta a
una URL configurada por variable de entorno:

| `BK-Service` | Backend |
|---|---|
| `api-auth` | bk-login (este mismo repo, vía `/api-auth/`) |
| `api-svc` | Servicios generales |
| `api-gsc` | Gestión servicios ciudadanía |
| `api-doc` | ProtecDoc / documentos |
| `api-ser` | Servicios |
| `api-sesp` | SESP |
| `api-data` | Geodata |
| `api-pdf` | Generación de PDFs |
| `api-noti` | Notificaciones |
| `api-sgai` | SGAI |
| `api-tools` | Utilidades internas |
| `api-noa` | NOA |
| `api-hei` | Histórico SER |

Si el header falta o no es una de estas claves, el gateway responde
`502 {"error": "API not found"}` sin llegar a validar el JWT.

### Qué valida el gateway antes de reenviar

1. Resuelve el backend con `BK-Service` (arriba).
2. Normaliza la ruta y la busca en el catálogo `Endpoint`
   (`custom_auth.models.models_global.Endpoint`, tabla `eco_auth_endpoint`).
   - Si existe y tiene `public=True` → **reenvía sin ningún tipo de
     autenticación.**
   - Si no → exige `Authorization: Bearer <jwt>` válido: firma, que no esté
     en blacklist, fingerprint (si aplica) y que corresponda a una `Session`
     activa en BD. Cualquier falla → `401`.
3. Valida permisos por rol contra `EndpointsRole` (hoy resuelto vía el
   header `Referer`, marcado como solución temporal en el propio código;
   **en no-prod el permiso se auto-otorga**, solo se exige de verdad con
   `ENVIRONMENT=prod`).
4. Si todo pasa, reenvía la petición al backend agregando:
   `Pato-ID` (usuario resuelto), `Rol-ID`, `X-Internal-Token` (credencial
   propia del gateway) y `X-Request-ID`. El header `BK-Service` original
   también se reenvía tal cual.

### Ejemplo con curl

```bash
curl -X GET "https://ecosistemapruebas.unp.gov.co/api-gateway/users/consultarrol/?grupo=8001" \
  -H "Authorization: Bearer <access_token>" \
  -H "BK-Service: api-auth"
```

---

## 3. Camino alterno (no recomendado): llamar `/api-auth/` directo

Varios frontends hoy (ej. `ft-ggt-usuarios`) llaman directo a
`https://<host>/api-auth/users/...` en vez de pasar por
`/api-gateway/users/...`, mandando los mismos dos headers por costumbre.
**Ojo:** en ese camino el header `BK-Service` **no lo lee nadie** (solo se
usa dentro de `gateway/views.py`, y ese código nunca se ejecuta si no se
entra por `/api-gateway/`), y la mayoría de vistas de `users`/`custom_auth`
(ej. `ConsultarRolesViewSet`, `PerfilPermiso`) no tienen
`authentication_classes` propias — lo único que revisa el
`Authorization` ahí es el middleware `SecureRequestMiddleware`, y solo
verifica que el valor **empiece con la palabra `"Bearer "`**, no que la
firma sea válida. No hay blacklist, ni verificación de sesión activa, ni
rol, en ese camino.

No repliques este patrón en integraciones nuevas: es el que existe
hoy por herencia, no el diseño vigente. Para código nuevo, entra por
`/api-gateway/...`.

---

## 4. Token interno (servicio-a-servicio)

Para llamadas backend-a-backend sin usuario de por medio, algunos endpoints
(hoy solo `protecdoc/v2/documentos/` y su descarga,
[`gateway/services/protecdoc/internal_auth_decorator.py`](../protecdoc/internal_auth_decorator.py))
aceptan `X-Internal-Token: <INTERNAL_SERVICE_TOKEN>` en vez de
`Authorization`. Mandar **ambos headers a la vez se rechaza** (`401
AMBIGUOUS_AUTH`) — es uno u otro, nunca los dos. Este mismo token es el que
el gateway le inyecta a los backends que llama, así que no se comparte con
clientes externos.

---

## Cosas a tener en cuenta (para no asumir más de lo que hay)

- Las rutas explícitas de protecdoc (`v0`/`v1`) y novasoft
  (`gateway/urls.py`) **no pasan por el `proxy()` general**: cada una trae
  su propio decorador (`@jwt_required`, `@jwt_or_internal_token_required` o,
  en el caso de `novasoft/empleado/`, ninguno — el `@jwt_required` está
  comentado). El bypass de endpoint público y la validación de rol solo
  aplican a las rutas que caen en el catch-all de `/api-gateway/`.
- La validación de rol contra `EndpointsRole` está desactivada fuera de
  `prod` (se auto-otorga el permiso).
- El repo depende de `djangorestframework_simplejwt` en
  `requirements.txt`, pero no se usa: los JWT se firman/verifican a mano
  con `PyJWT` (`api/decorators/jwt_decorator.py`), con secretos
  `TOKEN_SECRET_KEY` / `REFRESH_TOKEN_SECRET_KEY`, no con `SIMPLE_JWT_*`.
