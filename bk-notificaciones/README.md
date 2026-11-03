# bk-notificaciones - UNP

[![Django](https://img.shields.io/badge/Django-6.0.3-green.svg)](https://www.djangoproject.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![DRF](https://img.shields.io/badge/DRF-3.16.1-red.svg)](https://www.django-rest-framework.org/)
[![Channels](https://img.shields.io/badge/Channels-WebSockets-orange.svg)](https://channels.readthedocs.io/)
[![Email/SMS](https://img.shields.io/badge/Services-Email_SMS_Push-0078D4.svg)](https://unp.gov.co/)

## 📋 Descripción

`bk-notificaciones` es el servicio centralizado de **Gestión y Despacho de Notificaciones** del Ecosistema UNP de la Unidad Nacional de Protección.

Proporciona un motor unificado para la emisión de notificaciones por correo electrónico (SMTP/Office 365), mensajes de texto SMS, alertas push y eventos en tiempo real mediante WebSockets a las aplicaciones clientes del ecosistema.

## 🏗️ Arquitectura del Proyecto

```text
bk-notificaciones/
├── bk_notificaciones/  # Configuración principal de Django (settings, urls, wsgi, asgi)
├── notificaciones/     # Módulo principal de despacho, plantillas y log de notificaciones
├── utils/              # Conectores SMTP, proveedores SMS, cifrado y funciones auxiliares
├── requirements.txt    # Dependencias Python
└── manage.py           # Script de gestión Django
```

## 🚀 Tecnologías Utilizadas

- **Framework Web:** Django 6.0.3 & Django REST Framework 3.16.1
- **Notificaciones Real-Time:** Django Channels 4.3.2, Redis (`channels_redis`), Daphne
- **Seguridad & Encriptación:** `cryptography`, `python-decouple`, `django-cors-headers`
- **Gestión HTTP/REST:** `requests 2.33.1`, `urllib3`
- **Servidor WSGI/ASGI:** Gunicorn & Daphne

## 📦 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/EcosistemaUNP/bk-notificaciones.git
cd bk-notificaciones
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
DATABASE_NAME='gAAAAAB...'
DATABASE_USER='gAAAAAB...'
DATABASE_PASSWORD='gAAAAAB...'
DATABASE_HOST='gAAAAAB...'
DATABASE_PORT='5432'

# Redis & Channels
REDIS_HOST='127.0.0.1'
REDIS_PORT='6379'

# Configuración de Servidor de Correo (SMTP / Office365)
EMAIL_HOST='smtp.office365.com'
EMAIL_PORT=587
EMAIL_USE_TLS=True
EMAIL_HOST_USER='notificaciones@unp.gov.co'
EMAIL_HOST_PASSWORD='tu-password'
DEFAULT_FROM_EMAIL='notificaciones@unp.gov.co'

# API Key de Seguridad Interna
NOTIFICACIONES_INTERNAL_KEY='clave-servicio-a-servicio'
```

Requiere el archivo `.secret.key` en la raíz para descifrar las credenciales de BD.

### 5. Aplicar Migraciones
```bash
python manage.py migrate
```

### 6. Ejecutar Servidor

**Servidor HTTP (Desarrollo):**
```bash
python manage.py runserver 0.0.0.0:8000
```

**Servidor ASGI para WebSockets (Daphne):**
```bash
daphne -b 0.0.0.0 -p 8000 bk_notificaciones.asgi:application
```

## 🔑 Endpoints Principales

- `POST /api/notificaciones/enviar-email/` - Envío individual o masivo de correos electrónicos con plantillas.
- `POST /api/notificaciones/enviar-sms/` - Despacho de mensajes SMS a protegidos/analistas.
- `GET /api/notificaciones/historial/` - Consulta de trazabilidad y estado de entrega de notificaciones.

## 🧪 Pruebas

```bash
python manage.py test
```

---
*Desarrollado para la Unidad Nacional de Protección (UNP) de Colombia.*
