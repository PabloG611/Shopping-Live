# CLAUDE.md

## Bitácora de decisiones y acciones

- Toda decisión o acción relevante (correcciones, cambios de criterio, hallazgos, descartes) se documenta en `docs/apuntes/AAAA-MM-DD.md`, un archivo por día, en Markdown.
- Cada entrada lleva un encabezado con la hora (`## HH:MM — Título`), usando la hora local real (`date "+%Y-%m-%d %H:%M"`), y distingue **Decisión**, **Acción** y **Pendiente**.
- Si el archivo del día ya existe, se agrega la entrada al final; no se reescriben entradas anteriores.

## Seguimiento de hallazgos de seguridad

- Los hallazgos usan una secuencia única de número + letra: A–T = 0001–0020, U = 0021, V = 0022, W = 0023, X = 0024. Los nuevos continúan la secuencia (Y = 0025, Z = 0026, luego AA = 0027…).
- Ficha del hallazgo: `docs/security/findings-iso27001/HALLAZGO-<letra>-<slug>.md`.
- Respuesta al cerrarlo: `docs/security/respuestasIssues/<número>-<letra>-issue_response.md`.

## Criterios vigentes

- **2FA:** no existen usuarios exentos de 2FA. Aplica a todos los usuarios externos (login con usuario y contraseña del sistema); los usuarios de Microsoft (Entra ID) no pasan por este flujo. No reintroducir exenciones por rol (ver HALLAZGO-W).
- **Recuperación de contraseña:** solo para usuarios externos. La contraseña de Microsoft se cambia en Microsoft (directorio activo), nunca desde el aplicativo (`graph_reset_password` no debe usarse para recuperación). Código con `secrets`, cruzado con el usuario, y `@rate_limit` de 5 intentos.
- **Gateway sin rate limiting:** el gateway es un redireccionador y **no debe** limitar peticiones. El control de carga es responsabilidad de cada backend. Los límites de bk-login van en sus propias vistas (login, 2FA, recuperación). No proponer reactivar `@rate_limit(scope="gateway-proxy")`.
- **Gateway sin timeout:** por la misma razón, el proxy (`_reenviar_a_backend`) no lleva timeout; el tiempo máximo lo definen cada backend y nginx. Las llamadas llevan `# nosec B113` justificado (ver HALLAZGO-Z). Las demás llamadas salientes de bk-login (reCAPTCHA, Graph, Novasoft, ProtecDoc, SP) sí llevan timeout explícito.
- **Headers del cliente:** el gateway borra siempre `Pato-ID`, `Rol-ID` y `X-Internal-Token` entrantes antes de reenviar a los backends.
- **`X-Internal-Token`:** nunca escribir su valor (ni parcial ni su hash) en logs, documentos, reportes ni respuestas. Las vistas de `/api-auth/users/` se protegen con él a nivel de middleware. Referencia: `docs/security/x-internal-token.md`.
- **TLS fuera de `prod`:** `verify=False` solo en local. Pruebas, preproducción y producción usan `ENVIRONMENT=prod`. Riesgo aceptado.
- **`token_sp`:** lo usa otro frente, solo para usuarios externos de Protección y beneficiarios. bk-login no lo valida. Hay un plan para migrar todos los tokens de `localStorage` a cookies.
- **Endpoints exentos del gateway (bypass por `Referer`):** el trato está pendiente de definir por el equipo; no cambiarlo sin una decisión.
