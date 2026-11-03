# Backlog de Vulnerabilidades — bk-login / ft-login

Fuente: `docs/security/reporteseguridadestado05102026.md` (validación del `Reporte seguridad 05 10 2026.pdf`).
Ramas validadas: bk-login `main` @ `cf2e63a` (02-oct) · ft-login `main` @ `c748105` (04-oct) · Fecha de validación: 2026-10-05

> Estado de partida: **nada de lo reportado está corregido en `main`.** Los 15 incumplimientos y las 5 observaciones del frontend siguen vigentes, y se suman 6 hallazgos nuevos (N1–N6). El riesgo más alto es la combinación V4.1.2 + V2.5.1 + N1 + N3: bypass de rol en el gateway por `Referer` y fuerza bruta de la recuperación, que para usuarios `interno` cambia la contraseña de Entra ID.
>
> Backlog anterior (informe ISO 27001 de septiembre, hallazgos A–U): `docs/backlog octubre.md`.
>
> **IDs de seguimiento:** los ítems de este backlog que se trabajan reciben una letra y un número que siguen la secuencia anterior (A–T = 0001–0020, U = 0021, V = 0022). Asignados: 0.1 → **W (0023)**, 0.2 → **X (0024)**. El siguiente es Y (0025). Las decisiones se registran en `docs/apuntes/`.
>
> **Segundo barrido (2026-10-06, tarde):** se repitieron todas las verificaciones. No hay commits nuevos en ningún repo, y el working tree de bk-login solo cambió en este archivo. Ningún ítem cambió de estado. Hallazgo nuevo: `logger` no definido en `historico_ser` de `dev-server` (ver 0.2).
>
> **Última actualización:** 2026-10-06. Se reverificó cada ítem contra el código: bk-login `dev-server` (al día con `origin/dev-server`, `5410723`, más los cambios sin commit del working tree), bk-login `main` (`4824397`), ft-login `dev-server` (`a902760`) y `origin/main`, y bk-eiunp-login `dev`. Las notas **Verificado 2026-10-06** registran lo encontrado.
>
> **Decisiones de diseño vigentes** (no reabrir sin una decisión nueva del equipo): el gateway **no** tiene rate limiting (2.4); TLS sin validar solo fuera de `prod` (5.1); las vistas de `/api-auth/users/` se protegen con `X-Internal-Token` ([docs/security/x-internal-token.md](security/x-internal-token.md)).

**Convención de estado:** [✅] Resuelto · [❌] No resuelto aún · [⏳] En proceso (incluye lo hecho en el working tree sin commit) · [🦎] Bloqueado por otras tareas del backlog.

**Nota sobre ramas.** La rama local `dev-server` está **detrás** de `main`: le faltan `d91c109`, `bf73012`, `0e4ac58`, `7cc320a`, el merge `cf2e63a` y `4824397`. Tenerlo en cuenta al hacer el próximo merge para no reintroducir ni perder cambios. `9f2422c` (rate limit en `validate_recovery`) ya está en `origin/dev-server`.

**Cambios sin commit en bk-login `dev-server` (2026-10-06):** 1.1, 1.2, 2.1, `hmac.compare_digest` de 5.2 y 6.5. Archivos: `api/middleware/eco_security_middleware.py`, `api/middlewares/SecureRequestMiddleware.py`, `api/settings.py`, `gateway/views.py`, `users/services/recovery_service.py`, `users/views.py`, `utils/tools.py`. En ft-login, sin commit: `FormularioRecuperar.tsx`, `RecuperacionService.tsx`. En el worktree de `main` (`../bk-login-main`), sin commit: retiro de `register_beneficiario`/`register_proteccion` (0.1). Pasan a ✅ cuando se commiteen.

Orden de trabajo sugerido: 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 (ver numeración en cada ítem).

---

## BLOQUEANTE (funcional)

- [✅] **0.1 → W (0023) Login externo roto en `main` (500)** — bk-login · En `main` (`4824397`, 2026-10-05) · Ficha: [HALLAZGO-W](security/findings-iso27001/HALLAZGO-W-login-externo-roto-exencion-2fa.md)
  - Ubicación: `custom_auth/views.py:120` llama a `TwoFactorAuthService.is_2fa_exempt(user)`; el método no existe en `custom_auth/services/two_factor_auth.py` (eliminado en `d91c109`).
  - Impacto: el `AttributeError` lo captura el `except Exception` y todo login externo responde 500 «Error interno del servidor».
  - **Decisión (2026-10-05):** la exención existía solo para una prueba de estrés con beneficiarios y personal de protección. **No deben existir exentos de 2FA.** El 2FA aplica a todo usuario externo (usuario y contraseña del sistema); los usuarios de Microsoft no pasan por este flujo. Se descarta la corrección del reporte: **no** se restaura `is_2fa_exempt`.
  - [✅] Eliminar la llamada a `is_2fa_exempt` y la rama sin 2FA en `custom_auth/views.py::auth`.
  - [✅] Pruebas en `custom_auth/tests.py` (`python manage.py test custom_auth.tests`): 3/3 OK en local.
  - [❌] Confirmar que el pipeline central (`ci-cd.yml` → `EcosistemaUNP/cicd-workflows`, `ce00fdf`) corre `custom_auth.tests`.
  - [⏳] Retirar `register_beneficiario` y `register_proteccion`, creados para la misma prueba de estrés. **Decisión (2026-10-06):** se borran. Hecho (sin commit, worktree de `main` en `../bk-login-main`): se eliminaron las dos vistas de `users/views.py`, sus rutas de `users/urls.py` y el import de `transaction`, que solo usaban ellas. No tenían servicios propios: `RegistrationService`, `UpdateUserDataService` y `beneficiario_profile_helpers` los siguen usando `register` y `update_data`. `manage.py check` y `custom_auth.tests` (3/3) OK. `dev-server` nunca los tuvo.
  - [✅] Commit en `main` (`4824397`).
  - [✅] Llevar a `dev-server`. Verificado 2026-10-06: no aplica. `dev-server` no tiene `is_2fa_exempt` ni la rama sin 2FA, así que no está afectado. Queda solo alinear ramas en el próximo merge.

- [⏳] **0.2 → X (0024) (N4) `logger` y `timezone` no definidos tras el refactor `d91c109`** — bk-login · Media (funcional) · En `main` (`4824397`, 2026-10-05) · Ficha: [HALLAZGO-X](security/findings-iso27001/HALLAZGO-X-logger-timezone-no-definidos.md)
  - Ubicación: `users/views.py` (`register_beneficiario`, `register_proteccion`), `users/services/update_user_data_service.py` (`logger`; `timezone` en `:834`).
  - Impacto: `logger.info` lanza `NameError` después de crear el usuario; el `except` también usa `logger`, así que el error queda sin capturar: el usuario se crea y se responde 500.
  - [✅] Los 9 usos de `logger.*` pasan a `_log_warn` (el estilo que dejó `d91c109`) y se importa `timezone`. `pyflakes` ya no muestra ningún `undefined name`.
  - [❌] `pyflakes` en CI. Ojo: los `from x import *` le impiden detectar nombres no definidos en varios archivos.
  - [✅] Commit en `main` (`4824397`).
  - [❌] Llevar a `dev-server`. Verificado 2026-10-06: `pyflakes` reporta `undefined name 'timezone'` en `users/services/update_user_data_service.py:814` (falta `from django.utils import timezone`).
  - [❌] **Nuevo (segundo barrido, 2026-10-06): `logger` no definido en `gateway/views.py:1140` (`historico_ser`), solo en `dev-server`.** Ya estaba commiteado (`0dde400`), no viene del working tree. Impacto: `logger.info` lanza `NameError` dentro del `try`, el `except Exception` lo captura y el endpoint **siempre** responde 400 con `{"error": "name 'logger' is not defined"}`, así que `historico_ser` no funciona en `dev-server`. Además el `except` devuelve `str(e)` al cliente. Corrección: cambiarlo a `_log_warn(..., level="info")` y no exponer `str(e)`. `main` no está afectado.

## CRÍTICO / ALTO

- [⏳] **1.1 (V2.5.1 + N1) Recuperación de cuenta con fuerza bruta y reset de contraseña de Entra ID** — bk-login · Crítica · Corrección completa en el working tree, sin commit
  - Ubicación: `users/services/recovery_service.py:127` (`random.randint(100000, 999999)`); `users/views.py::validate_recovery` (busca con `RecoveryCode.objects.filter(code=recovery_code).last()` sin cruzar el usuario); `graph_reset_password` para `userType="interno"`.
  - Impacto: cualquier código vigente sirve sin conocer el usuario; sin límite de intentos se puede tomar la cuenta corporativa (Entra ID) de un funcionario. Además `set_password()` se aplica sin `validate_password()`.
  - **Decisión (2026-10-05):** la recuperación de contraseña aplica **solo a usuarios externos**, cuyo usuario y contraseña son propios del aplicativo. La contraseña de los usuarios de Microsoft no se cambia desde el aplicativo: se cambia en Microsoft, que actualiza el directorio activo.
  - Corrección:
    - [✅] Limitar `recovery` y `validate_recovery` a usuarios externos: eliminar la rama `userType="interno"` y la llamada a `graph_reset_password` (esto cierra N1).
      - Hecho (2026-10-06, sin commit): `userType="interno"` responde 400 `INTERNAL_USER_RECOVERY_NOT_ALLOWED` en `recovery` y 400 en `validate_recovery` antes de consultar el código. Eliminados `find_internal_user_email`, `graph_get_user`, `graph_reset_password` y `_get_app_token` (`utils/tools.py`). ft-login (`FormularioRecuperar.tsx`) ya no envía la solicitud para usuarios internos y avisa que el cambio se hace en Microsoft.
    - [✅] Generar el código con `secrets` en vez de `random`.
      - Hecho (2026-10-06, sin commit): `secrets.randbelow`. Además evita códigos activos y vigentes (`code` es único y `save_data` actualizaba el registro existente, lo que podía reasignar el código de otro usuario) y reactiva (`is_active=True`) un código viejo reutilizado.
    - [✅] Cruzar usuario + código en la búsqueda.
      - Hecho (2026-10-06, sin commit): `validate_recovery` exige `username`, busca el código por `code` + `email` del usuario + `is_active`, el más reciente por `created_at`. Usuario inexistente y código inválido responden el mismo 404. ft-login envía `username` en el paso 2 (`RecuperacionService.tsx`, `FormularioRecuperar.tsx`).
    - [✅] `@rate_limit` de **5 intentos** en `validate_recovery`.
      - Hecho (2026-10-06, sin commit): `max_attempts=5` (se conservan `window_seconds=600`, `lock_seconds=86400`, identidad por referer/IP). Antes: `main` no tenía límite; `dev-server` tenía `max_attempts=8`.
    - [✅] Llamar a `validate_password()` antes de `set_password()`.
      - Hecho (2026-10-06, sin commit): una contraseña que no cumple `AUTH_PASSWORD_VALIDATORS` responde 400 con los mensajes y no consume el código.
    - [❌] Commit en bk-login y ft-login, y llevar a `main`.
  - [❌] Pendiente no verificable desde código: confirmar si `api-auth/users/recovery/` y `api-auth/users/validate_recovery/` tienen `public=True` en el catálogo `Endpoint` de producción.

- [⏳] **1.2 (N5) Código de recuperación en los logs** — bk-login · Media · Sin commit
  - Ubicación: `users/services/recovery_service.py:128` (`Código de recuperación generado: {code}` a nivel debug).
  - Impacto: si debug está activo en algún ambiente, el código queda expuesto en logs (incumple V7.1.1).
  - Corrección: eliminar la línea. **Decisión (2026-10-05):** borrarla. Verificado el 2026-10-05: sigue en `main` y en `dev-server`.
  - Hecho (2026-10-06, sin commit): línea eliminada en `generate_recovery_code`. Sigue en `main`.

- [⏳] **2.1 (V4.1.2) Bypass de validación de rol en el gateway vía `Referer`** — bk-login · Alta · Sin commit
  - Ubicación: `gateway/views.py:342` — `is_exempt_service_path(origin=HTTP_REFERER, …)` devuelve `True` si el `Referer` (controlado por el cliente) apunta a `panda-pdf`, `sg/sg/viaticos` u otras rutas exentas; se omite la validación de rol para **cualquier** backend de `BK_API`, `api-auth` incluido.
  - Impacto: cualquier usuario con un JWT válido se salta la autorización por rol.
  - Corrección: eliminar la exención basada en `Referer`; la exención, si se mantiene, debe decidirse por la ruta solicitada, no por cabeceras del cliente.
  - **Decisión (2026-10-05):** el trato de los endpoints exentos se definirá más adelante. Mientras tanto sigue abierto, y es la principal brecha del modelo de `X-Internal-Token` (ver [x-internal-token.md §6.1](security/x-internal-token.md)).
  - **Decisión (2026-10-06):** se elimina toda exención por paths. Hecho (sin commit): se borraron `GATEWAY_ROLE_VALIDATION_EXEMPT_PATHS` e `is_exempt_service_path` de `gateway/views.py`. La única exención que queda es `rolRequired=False` en el catálogo `Endpoint` (decidida por la ruta solicitada). Además, un endpoint `locked` o inactivo ahora se rechaza también con `rolRequired=False` (antes la exención se evaluaba primero y lo dejaba pasar).
  - [❌] Antes de desplegar: los frontends que dependían del `Referer` (`panda-pdf`, `sg/sg/viaticos`, `sg/gag/mis-bienes`, `sg/gag/transferencia-bienes`, `sg/gag/consulta-bienes`, `oapi/ggt/impresoras/mis-trabajos-pendientes`) necesitan `EndpointsRole` para sus roles o `rolRequired=False` en los endpoints que consumen; si no, en `prod` reciben 403.
  - [❌] bk-eiunp-login conserva la misma lógica (`gateway/services/endpoint_access_service.py:68,110,299`) con la lista vacía: no hay bypass activo, pero queda el código. Verificado 2026-10-06.

- [❌] **2.2 (V4.1.2) Reenvío de `Pato-ID` del cliente en endpoints públicos** — bk-login · Alta
  - Ubicación: `gateway/views.py:380-389` — `_construir_headers_backend` copia `dict(request.headers)` y solo sobrescribe `Pato-ID` si `id_usuario` no es `None`.
  - Impacto: en endpoints públicos el backend recibe una identidad elegida por el cliente.
  - Corrección: eliminar siempre `Pato-ID`, `Rol-ID` y `X-Internal-Token` entrantes antes de construir los headers hacia el backend.
  - **Decisión (2026-10-05):** aprobada. Se borran los headers de identidad e internos que inyecta el usuario para que no lleguen a los backends.
  - Verificado 2026-10-06: sin cambios en `dev-server`. `Rol-ID` y `X-Internal-Token` siempre se sobrescriben; `Pato-ID` del cliente pasa cuando `id_usuario` es `None`.

- [🦎] **2.3 (N3) `X-Internal-Token` inyectado tras el bypass por `Referer`** — bk-login · Alta · Bloqueado por 2.1, 2.2 y 4.1
  - Ubicación: `gateway/views.py::_construir_headers_backend`.
  - Impacto: tras el bypass de 2.1, el usuario llega con privilegio de servicio interno a vistas de bk-login sin `@jwt_required` (`save_data_basic`, `get_all_data`…).
  - Corrección: se cierra con 2.1 + 2.2 + 4.1. 2.1 está en proceso; 2.2 y 4.1 siguen abiertos.

- [✅] **2.4 (N2) Rate limit del gateway comentado** — bk-login · **No aplica: decisión de diseño (2026-10-05)**
  - Ubicación: `gateway/views.py:1104-1112` (`@rate_limit(scope="gateway-proxy", …)` comentado).
  - **Decisión de diseño: el gateway NO DEBE tener rate limiting.** El gateway es un redireccionador hacia distintos servicios, así que no puede limitar cuántas veces se accede a un mismo endpoint en un tiempo dado. Si un usuario pide *n* veces el mismo reporte, cachearlo o fijar su alcance de rendimiento es responsabilidad del backend correspondiente, no del login.
  - Consecuencias:
    - El bloque comentado no se reactiva. Ya se había aceptado como intencional en el backlog anterior (hallazgo O) y ahora queda confirmado.
    - Los endpoints sensibles de bk-login que necesitan límite (login, 2FA, `recovery`, `validate_recovery`) lo llevan **en la propia vista** con `@rate_limit`, no en el gateway (ver 1.1).
    - Cada backend detrás del gateway es responsable de su propio control de carga (caché, límites, paginación).

- [⏳] **3.1 (V3.2.1) `TOKEN_SECRET_KEY` / `REFRESH_TOKEN_SECRET_KEY` filtrados en git y sin rotar** — bk-login · **Baja: la filtración es solo del entorno de desarrollo (2026-10-06)**
  - Ubicación: historial (`9f2422c` en `.env.backup`, `2d94689` en `documentacion.md`). El hash SHA-256 del valor filtrado coincide con `bk-login/.env`, `docker/envs/bk-login.env` y `docker/backups/bk-login.env`.
  - **Aclaración (2026-10-06):** los valores filtrados son los del entorno de **desarrollo**. Pruebas y producción usan secret keys distintas, que nunca se publicaron en el repositorio. Quien tenga el historial solo puede firmar JWT válidos para desarrollo, no para pruebas ni producción. Es el mismo criterio que se aplicó a `.secret.key` en el backlog anterior.
  - Corrección:
    - [✅] ~~Rotar `TOKEN_SECRET_KEY` y `REFRESH_TOKEN_SECRET_KEY` en producción~~. No aplica: producción y pruebas no comparten las claves filtradas.
    - [⏳] Purgar `.env.backup` y `.env` del historial con `git filter-repo` (se mantiene `.env.example`) y hacer force-push de todas las ramas.
      - **Ejecutado localmente (2026-10-06)** en un clon espejo fuera del working tree: `Documents\backups db\login\bk-login-purge`.
        ```powershell
        git clone --mirror https://github.com/EcosistemaUNP/bk-login.git bk-login-purge
        cd bk-login-purge
        pip install git-filter-repo   # 2.47.0, instalado en el venv (no viene con Git)
        git filter-repo --invert-paths --path .env --path .env.backup --path-glob '*/.env' --path-glob '*/.env.backup'
        ```
        Resultado: se procesaron 2321 commits y se reescribió el historial de las 26 ramas. Como es habitual, `filter-repo` eliminó el remote `origin`.
      - La nota de `filter-repo` que sugiere `git branch -d <rama>` para las 26 ramas **no se aplica**. En un clon `--mirror` esas son las ramas reales del repositorio, y borrarlas las quitaría del remoto al hacer el push.
      - [✅] Verificación local: `git log --all --name-only --format= | Select-String -Pattern '(^|/)\.env(\.backup)?$'` no imprime nada.
      - [✅] **Force-push ejecutado (2026-10-06)** con `git push --force --mirror origin`. Solo cambiaron las 4 ramas que contenían `.env.backup`:
        - `dev-server`: `5410723` → `b95330f`
        - `featuring/security`: `bb52a65` → `a606b26`
        - `prod`: `f994334` → `e32d39f`
        - `thais`: `cdcd95b` → `7eaa6c8`

        Las otras 22 ramas, entre ellas `main` y `dev`, no tocaban `.env.backup` y conservan sus hashes. Se hizo `git fetch` desde la copia de trabajo y ninguna rama de `origin` contiene ya `.env` ni `.env.backup`.
      - **Rechazos esperados:** GitHub rechazó todos los `refs/pull/*/head` (`deny updating a hidden ref`). Son referencias de solo lectura que GitHub crea para cada PR, y no se pueden reescribir con push. Los commits viejos con `.env.backup` siguen accesibles desde esos PR y por hash hasta que GitHub los purgue.
      - Pendiente:
        - [❌] **Limpiar `documentacion.md`.** La segunda pasada falló porque no existía `..\replacements.txt` (`FileNotFoundError`), así que el push salió sin `--replace-text`. En `origin` siguen tres commits que tocan `TOKEN_SECRET_KEY` en ese archivo: `2d94689` (2025-02-26), `25c54fb` (2025-08-05) y `7fa8458` (2025-12-02). Hay que revisar cuáles contienen el valor y no solo el nombre de la variable.
          1. Crear `replacements.txt` en `backups db\login\`, con una línea `<valor>==>***REMOVED***` por cada secreto.
          2. Desde `bk-login-purge`: `git filter-repo --replace-text ..\replacements.txt --force`, verificar y repetir `git push --force --mirror origin`.
        - [❌] **Pedir a GitHub Support que purgue la caché y los refs de PR** del repositorio, con la lista de hashes viejos, para que los commits antiguos dejen de ser accesibles.
        - [❌] **Resincronizar las copias locales.** Las ramas locales `dev-server`, `prod` y `thais` siguen con el historial viejo: `dev-server` está 5↑/5↓ respecto de `origin`. Si alguien las publica, vuelve a subir `.env.backup`. Hay que avisar al equipo que vuelva a clonar o que resetee esas ramas a `origin/<rama>`; no sirve hacer `git pull`, porque eso mezcla el historial viejo con el nuevo.
    - [❌] Agregar gitleaks (o equivalente) al workflow. Verificado 2026-10-06: el único workflow es `.github/workflows/ci-cd.yml` (ya no existe `deploy.yml`) y no tiene escaneo de secretos.

- [❌] **3.2 Secreto de Azure AD versionado (`REACT_APP_CLIENT_SECRET`)** — ft-login · Alta
  - Ubicación: `.env` versionado desde `43b25aa` (22-abr-2025); `.gitignore:98` tiene `#.env` comentado. La variable no se usa en `src/`.
  - Verificado 2026-10-06: `.env` sigue trackeado en `dev-server`, `.gitignore:98` sigue comentado y `REACT_APP_CLIENT_SECRET` sigue en `.env:19`.
  - Corrección:
    - [❌] Rotar el secreto en Entra ID.
    - [❌] Sacar `.env` del repositorio y descomentar `.env` en `.gitignore`.

- [❌] **3.3 `REACT_APP_SECRET_KEY_TOKEN` expuesto en el bundle (feb–may 2026)** — ft-login
  - Ubicación: sigue en `.env` (`:16`, verificado 2026-10-06); ya no se usa en `src/`.
  - Corrección: eliminar la variable y confirmar que ningún servicio acepte `token_sp` firmados con ese valor.
  - **Contexto (2026-10-05):** `token_sp` lo usa otro frente de trabajo, al que no hay acceso libre, y solo para usuarios externos de Personas de Protección y beneficiarios. El servicio de login no lo valida, así que no sirve para suplantar ninguna identidad ante bk-login.
  - [❌] Confirmar con el otro frente que su validación de `token_sp` no usa el valor expuesto de `REACT_APP_SECRET_KEY_TOKEN`. Si lo usa, alguien podría suplantar identidades **en ese servicio**.
  - [🦎] Ver 3.5 (migración de tokens a cookies).

- [🦎] **3.5 Migrar todos los tokens de LocalStorage a cookies** — ft-login / bk-login · Plan de trabajo (decidido 2026-10-05) · Bloqueado por 6.8
  - Alcance: access token, refresh token y `token_sp`, hoy en `localStorage` (accesibles desde JavaScript, expuestos a XSS). Verificado 2026-10-06: ft-login sigue guardándolos en `localStorage` (`src/services/auth-storage.ts:95-103`).
  - Base existente: en `dev-server` ya se agregaron cookies httpOnly (`utils/auth_cookies.py`, `0a04a94`). Antes de extenderlo, resolver las observaciones de 6.8 (`path='/'` y CSRF).
  - [❌] Definir el plan por fases (bk-login emite cookies → ft-login deja de leer/escribir `localStorage` → coordinar con el frente que consume `token_sp`).

- [❌] **3.4 Rotar `SECRET_KEY_MOVIL`** — bk-login
  - Motivo: el secreto va embebido en la app móvil y la firma HMAC no incluye timestamp (ver 5.2 y 7.2).

- [❌] **4.1 (V4.2.1) `ConsultarPersonas` sin autenticación y con enumeración por prefijo** — bk-login · Alta
  - Ubicación: `users/views.py:566-567` — solo `@api_view(['GET'])`, sin `@jwt_required`; filtra por `username__startswith` (`:588`). Verificado 2026-10-06: sin cambios.
  - Impacto: enumeración de usuarios, alcanzable vía gateway (`api-auth/users/consultarpersona/`) con el bypass de 2.1.
  - Corrección: `@jwt_required` y búsqueda exacta (o con mínimo de caracteres + rate limit).
  - **Aclaración (2026-10-05):** la vista no es pública. Está bajo `/api-auth/users/`, que exige `X-Internal-Token` (`SecureRequestMiddleware`), un secreto que no conocen ni los usuarios ni los frontends ([x-internal-token.md](security/x-internal-token.md)). Solo es alcanzable sin autorización real mediante el bypass de 2.1 (el gateway inyecta el token) o el camino móvil de 5.2. Con eso cerrado, queda pendiente solo la enumeración por prefijo (`username__startswith`).

- [✅] **5.1 (V9.1.1) TLS sin validación de certificado fuera de prod** — bk-login · **Riesgo aceptado: decisión de diseño (2026-10-05)**
  - Ubicación: `gateway/services/novasoft/novasoft_auth.py:69`, `gateway/services/protecdoc/protecdoc_auth.py:59` (`verify=config('ENVIRONMENT') == 'prod'`).
  - **Decisión:** se mantiene así. Fuera de `prod` solo están los entornos locales de desarrollo, que no tienen mayor seguridad. Los entornos de **pruebas, preproducción y producción usan `ENVIRONMENT=prod`**, así que en todos ellos el certificado se valida.
  - Condición para que la decisión siga siendo válida: ningún ambiente desplegado puede correr con `ENVIRONMENT` distinto de `prod`. `config('ENVIRONMENT')` no tiene valor por defecto en estas llamadas, así que si falta la variable la llamada falla en lugar de omitir la validación.

- [⏳] **5.2 (V4.1.5) Comparación de tokens no constante y bypass móvil** — bk-login · Alta (matizado)
  - Ubicación: `api/middleware/eco_security_middleware.py` (asume `"dev"`, compara con `==`); `SecureRequestMiddleware._is_internal_token_valid` (usa `==`).
  - Matiz: `SecureRequestMiddleware` corre antes y cierra por defecto (exige `X-Internal-Token` fuera de `/api-auth/auth/` y `/api-gateway/`); `is_origin_allowed` no se usa.
  - Pendiente real:
    - [⏳] Usar `hmac.compare_digest` en ambos middlewares. Hecho (2026-10-06, sin commit) en `SecureRequestMiddleware._is_internal_token_valid` y `ServiceSecurityMiddleware.is_token_valid`.
    - [❌] Peticiones con `x-request-source: mobile_app` se saltan el token interno: en GET basta el `User-Agent`; en POST basta la firma HMAC del cuerpo, sin timestamp firmado. Firmar también GET y agregar timestamp/nonce a la firma. Verificado 2026-10-06: sin cambios; `X-Timestamp` se exige en POST pero no entra en la firma.
    - [❌] Que `ENVIRONMENT` ausente no se trate como entorno de confianza (fallar cerrado). Verificado 2026-10-06: `eco_security_middleware.py:20` sigue con `default="dev"`.
  - **Nota (2026-10-05):** en los ambientes desplegados (`ENVIRONMENT=prod`), las peticiones móviles sin token se bloquean solo gracias a `ServiceSecurityMiddleware`, marcado como *deprecated*. **No retirarlo** hasta que `SecureRequestMiddleware` exija el token también en el camino móvil (ver [x-internal-token.md §6.2](security/x-internal-token.md)).

## MEDIO

- [🦎] **6.1 (V4.1.1) Vistas de `users/` sin autenticación propia** — bk-login · Parcial · Bloqueado por 2.1, 2.2 y 5.2
  - Ubicación: `users/views.py` — solo `get_data` tiene `@jwt_required`; sin él: `save_data_basic`, `save_data_colectivo`, `get_all_data`, `ConsultarPersonas`, entre otras. Hoy dependen solo del token interno del middleware. Verificado 2026-10-06: sin cambios.
  - Corrección: `@jwt_required` (o validación explícita de token interno) en cada vista.
  - **Aclaración (2026-10-05):** por diseño, las vistas de `/api-auth/users/` (gestión de roles, `consultarpersona`, `consultar_funcionario_identificacion`, `consultar_funcionario_nombre`, `get_all_data`) se protegen con `X-Internal-Token` a nivel de middleware. Solo se alcanzan desde el gateway, que ya validó el JWT y el rol, o desde backends privados. El riesgo real depende de cerrar 2.1, 2.2 y 5.2. Documentación: [docs/security/x-internal-token.md](security/x-internal-token.md).

- [❌] **6.2 (V4.1.3) Sin denegación por defecto en DRF** — bk-login · Parcial
  - Ubicación: `api/settings.py` no define `REST_FRAMEWORK` / `DEFAULT_PERMISSION_CLASSES`. (El modelo `Endpoint` sí cierra por defecto: `custom_auth/models/models_global.py:214-216`.) Verificado 2026-10-06: sin cambios.
  - Corrección: definir `DEFAULT_PERMISSION_CLASSES` restrictivo.

- [❌] **6.3 (V14.2.1) Dependencias vulnerables** — bk-login / ft-login
  - [❌] ft-login: `npm audit fix` — 8 vulnerabilidades (3 altas: `js-cookie`, `lodash`, `lodash-es`; 5 moderadas: `@remix-run/router`, `dompurify`, `yaml`…). Verificado 2026-10-06: `npm audit` sigue reportando 8 (3 altas, 5 moderadas).
  - [❌] bk-login: quitar `paramiko==4.0.0` de `requirements.txt:35` (PYSEC-2026-2858; ningún `.py` lo importa). El commit `200f473` de `dev-server` no lo quitó. Verificado 2026-10-06: sigue en `requirements.txt:35`.

- [❌] **6.4 (V8.3.1) Token y `session_id` del WebSocket en la URL** — bk-login
  - Ubicación: `custom_auth/consumers/consumers.py` lee de `scope['query_string']`.
  - Verificado 2026-10-06: en `dev-server` el consumidor toma solo el `session_id` del query string (`:6`) y se une al grupo `session_{id}` sin validar ningún token antes de `accept()`.
  - Corrección: ticket de un solo uso y vida corta para abrir el WebSocket.

- [⏳] **6.5 (V2.1.1) Longitud mínima de contraseña 8** — bk-login · Sin commit
  - Ubicación: `api/settings.py:165` — `MinimumLengthValidator` sin `OPTIONS`. `validate_recovery` no valida la contraseña (ver 1.1).
  - Corrección: `OPTIONS: {"min_length": 12}`.
  - Hecho (2026-10-06, sin commit): `OPTIONS: {'min_length': 12}` en `api/settings.py`. `validate_recovery` ya llama a `validate_password()` (1.1).

- [❌] **6.6 (V3.3.1) Brechas reales del logout** — bk-login · Parcial (el reporte es inexacto: el access token propio **sí** se revoca en Redis, `custom_auth/views.py:1352-1379`)
  - [❌] Revocar también los tokens de Microsoft (RS256): hoy el `jwt.decode` HS256 falla y la excepción se ignora. Verificado 2026-10-06: sin cambios (`custom_auth/views.py:1359`).
  - [❌] Que la verificación de blacklist falle cerrado si Redis falla (hoy el `except` solo registra y deja pasar). Verificado 2026-10-06: sin cambios (`api/decorators/jwt_decorator.py:202-203`).
  - [❌] Que los backends detrás del gateway consulten la blacklist.

- [✅] **6.7 (V4.3.1) 2FA obligatorio para roles administrativos** — bk-login · Cubierto por W (0023), 2026-10-05
  - Se eliminó la exención de 2FA por completo (ver 0.1). Sin exenciones, ningún rol administrativo puede quedar exento. Lo cubre la prueba `test_no_existe_exencion_de_2fa`.

- [❌] **6.8 (N6) Cookies httpOnly en `dev-server`** — bk-login · Ya commiteado (`0a04a94`)
  - Ubicación: `utils/auth_cookies.py`.
  - Verificado 2026-10-06: la cookie `access_token` ya está acotada a `/api-auth/` (`:12`), pero las de sesión no.
  - [❌] `jwt_token` / `refresh_jwt_token` usan `path='/'` (`SESSION_COOKIE_PATH`, `:51`), contradiciendo el comentario del módulo (acotarla a `/api-auth/`); se envían a todos los backends del dominio.
  - [❌] `autenticar_jwt` acepta la cookie como respaldo; con `CORS_ALLOW_CREDENTIALS=True` la protección CSRF depende solo de `SameSite=Strict`. Evaluar token CSRF.

- [❌] **7.1 Sin Content-Security-Policy** — ft-login
  - Ubicación: `default.conf` (nginx).
  - Verificado 2026-10-06: `origin/main:default.conf` tiene `X-Frame-Options`, HSTS, `Referrer-Policy` y `Permissions-Policy`, pero no `Content-Security-Policy`. `dev-server` no tiene `default.conf`.
  - Corrección: agregar cabecera `Content-Security-Policy`.

- [⏳] **7.2 Captcha desactivado y omitible** — ft-login / bk-login · Matizado
  - Ubicación: `REACT_APP_ENABLE_CLOUDFLARE_CAPTCHA='false'` en `.env`; `validation_service.py:66` omite el captcha con `is_mobile`.
  - Matiz: no basta una cabecera libre (se exige `User-Agent` `application-unp/1.0` y, en POST, HMAC con `SECRET_KEY_MOVIL`), pero el secreto va en la app y la firma es reutilizable.
  - Corrección: activar el captcha en web; para móvil, ver 5.2 y 3.4.
  - [✅] Captcha en web. Verificado 2026-10-06: `REACT_APP_ENABLE_CLOUDFLARE_CAPTCHA=true` en `.env` de ft-login `dev-server`.
  - [🦎] Captcha omitible en móvil (`validation_service.py:66`): depende de 5.2 y 3.4.

## BAJO

- [❌] **7.3 Configuración MSAL sin uso** — ft-login
  - Ubicación: `src/config/msalConfig.ts` (`redirectUri: "http://localhost:3000/redirect"`); `@azure/msal-*` en `package.json:33-34` sin importarse en ningún componente. Verificado 2026-10-06: sin cambios.
  - Corrección: eliminar el archivo y las dependencias.

- [❌] **7.4 (V2.1.7) Sin chequeo de contraseñas filtradas** — bk-login · Parcial
  - Solo están los validadores estándar de Django. Corrección: validador contra listas de contraseñas filtradas (p. ej. HIBP k-anonymity).

- [❌] **7.5 (V5.1.1) Sin validación de entrada en el servidor** — bk-login · Parcial
  - Ubicación: vistas de `users/views.py` leen `json.loads(request.body)` sin serializers. Verificado 2026-10-06: 6 vistas siguen así.
  - Corrección: serializers DRF de validación.

---

## Pendientes no verificables desde el código

- [❌] Valor real de `TOKEN_SECRET_KEY` y de `ENVIRONMENT` en producción.
- [❌] Qué endpoints del catálogo `Endpoint` tienen `public=True` en producción (en especial `recovery/` y `validate_recovery/`).
- [❌] Controles «Por verificar» del reporte: V4.3.2, V5.1.3, V9.1.2 y V8.3.4 (requieren pruebas sobre el ambiente desplegado).

## Aclaraciones (no requieren acción)

- `REACT_APP_SECRET_KEY_CAPTCHA` está mal nombrada, pero se usa como `siteKey` de Turnstile (`src/config/captcha.ts:7`), que es un valor público. No es una fuga de secreto.
