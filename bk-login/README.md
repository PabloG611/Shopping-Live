# bk-login - UNP

[![Django](https://img.shields.io/badge/Django-5.1.7-green.svg)](https://www.djangoproject.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![DRF SimpleJWT](https://img.shields.io/badge/JWT-SimpleJWT_5.4-red.svg)](https://django-rest-framework-simplejwt.readthedocs.io/)
[![2FA OTP](https://img.shields.io/badge/Security-2FA_OTP-0078D4.svg)](https://django-two-factor-auth.readthedocs.io/)
[![MSAL](https://img.shields.io/badge/Azure_AD-MSAL_1.32-0089D6.svg)](https://learn.microsoft.com/azure/active-directory/)

## 📋 Descripción

`bk-login` es el microservicio centralizado de **Autenticación, Portal de Acceso (SSO) y Gateway de Tokens JWT** del Ecosistema UNP.

Proporciona autenticación mediante credenciales locales, integración con Azure AD / Office 365 (MSAL), autenticación multifactor (2FA / OTP con catorce verificadores y códigos QR), renovación y revocación de tokens JWT, control de límites de sesión en Redis y trazabilidad con Sentry.

## 🏗️ Arquitectura del Proyecto

```text
bk-login/
├── api/             # Endpoints REST para autenticación, refresco de tokens y login
├── builders/        # Construcción de tokens personalizados, claims y contextos de usuario
├── custom_auth/     # Backend de autenticación personalizada e integración OAuth/MSAL
├── gateway/         # Gateway de seguridad, validación de firmas y middlewares
├── infra/           # Infraestructura (Conexiones Redis, Sentry, Logging)
├── login/           # Configuración principal de Django (settings, urls, wsgi, asgi)
├── services/        # Servicios de negocio (Verificación OTP, sincronización de usuarios)
├── requirements.txt # Dependencias Python
└── manage.py        # Script de gestión Django
```

## 🚀 Tecnologías Utilizadas

- **Core Framework:** Django 5.1.7 & Django REST Framework 3.15.2
- **Gestión de Tokens JWT:** `djangorestframework-simplejwt 5.4.0` & `PyJWT`
- **Autenticación Multifactor (2FA):** `django-two-factor-auth`, `django-otp`, `pyotp`, `qrcode`, `django-phonenumber-field`
- **Integración Azure AD / Microsoft:** `msal 1.32.0`
- **Caché y Gestión de Sesiones:** Redis (`django-redis`)
- **Monitoreo:** `sentry-sdk`
- **Seguridad:** `cryptography`, `bcrypt`, `python-decouple`, `django-cors-headers`

## 📦 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/EcosistemaUNP/bk-login.git
cd bk-login
```

### 2. Crear y activar entorno virtual
```bash
python -m venv env
# En Windows PowerShell:
.\env\Scripts\Activate.ps1
# En Linux/Mac:
source env/bin/activate
```

### 3. Instalar dependencias
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configurar Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del proyecto basándote en la plantilla:

```env
SECRET_KEY='tu-clave-secreta-django'
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1

# Base de Datos PostgreSQL (Encriptada)
DATABASE_NAME='***REMOVED***...'
DATABASE_USER='***REMOVED***...'
DATABASE_PASSWORD='***REMOVED***...'
DATABASE_HOST='***REMOVED***...'
DATABASE_PORT='5432'

# Redis (Sesiones y Blacklist JWT)
REDIS_HOST='127.0.0.1'
REDIS_PORT='6379'
# Base lógica de Redis (sin cifrar). Debe ser distinta en cada entorno que comparta servidor Redis.
REDIS_DB='1'

# Configuración JWT
SIMPLE_JWT_SECRET_KEY='tu-secret-jwt'
ACCESS_TOKEN_LIFETIME_MINUTES=60
REFRESH_TOKEN_LIFETIME_DAYS=7

# Microsoft / Azure Active Directory (MSAL)
CLIENT_ID='tu-azure-client-id'
CLIENT_SECRET='tu-azure-client-secret'
AUTHORITY='https://login.microsoftonline.com/tu-tenant-id'

# Sentry (Opcional)
SENTRY_DSN='https://...'
```

Debe estar presente el archivo `.secret.key` en la raíz para descifrar las credenciales de BD.

### 5. Aplicar Migraciones
```bash
python manage.py migrate
```

### 6. Ejecutar Servidor de Desarrollo
```bash
python manage.py runserver 0.0.0.0:8000
```

## 🔑 Endpoints Principales

- `POST /api/login/` - Iniciar sesión (retorna Access Token y Refresh Token).
- `POST /api/token/refresh/` - Refrescar Access Token mediante Refresh Token.
- `POST /api/token/verify/` - Validar vigencia de token JWT.
- `POST /api/2fa/setup/` - Configurar autenticación en dos pasos (Generación QR).
- `POST /api/2fa/verify/` - Validar código OTP para completar inicio de sesión.
- `GET /api/azure/login/` - Iniciar flujo de autenticación SSO con Microsoft Azure AD.

## 🔐 Token de servicio interno (`X-Internal-Token`)

`X-Internal-Token` es un secreto compartido que prueba que una petición viene del propio sistema: del gateway de `bk-login` o de otro backend privado del ecosistema. **Ningún backend privado acepta peticiones sin él**, y buena parte de la seguridad de la plataforma depende de que se mantenga en secreto.

- **Origen:** variable de entorno `INTERNAL_SERVICE_TOKEN`, con un valor distinto en pruebas y en producción. Sin ella la app no arranca.
- **Quién lo conoce:** solo `bk-login` y los backends privados. Ni los usuarios ni los clientes (frontends web y app móvil) tienen acceso.
- **Inyección:** el gateway lo agrega en `gateway/views.py::_construir_headers_backend`, después de validar el JWT y el rol del usuario, junto con `Pato-ID` y `Rol-ID`.
- **Validación:** `SecureRequestMiddleware` lo exige en todo lo que no sea `/api-auth/auth/` ni `/api-gateway/`. Eso incluye `/api-auth/users/`: gestión de roles, `consultarpersona`, `consultar_funcionario_identificacion`, `consultar_funcionario_nombre` y `get_all_data`.
- **Nunca se expone:** no puede aparecer en logs (los redactan `utils/log_redaction.py` y el gateway), reportes, tickets, commits ni documentación.
- **Rotación:** periódica en pruebas y producción, e inmediata ante cualquier posible filtración o vulnerabilidad.

Documentación completa (flujo, validaciones, brechas conocidas, procedimiento de rotación y checklist para backends nuevos): [`docs/security/x-internal-token.md`](docs/security/x-internal-token.md).

## 🧪 Pruebas

```bash
# Ejecutar suite de pruebas unitarias con pytest
pytest

# Verificación de integridad Django
python manage.py check
```

---
*Desarrollado para la Unidad Nacional de Protección (UNP) de Colombia.*
