# bk-sgai - UNP

[![Django](https://img.shields.io/badge/Django-5.2.10-green.svg)](https://www.djangoproject.com/)
[![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)](https://www.python.org/)
[![DRF](https://img.shields.io/badge/DRF-3.15.2-red.svg)](https://www.django-rest-framework.org/)
[![GraphQL](https://img.shields.io/badge/GraphQL-Graphene_3.4-E10098.svg)](https://graphene-python.org/)
[![SQL Server](https://img.shields.io/badge/Database-SQL_Server_|_PostgreSQL-CC292B.svg)](https://github.com/microsoft/mssql-django)
[![Kafka](https://img.shields.io/badge/Messaging-Apache_Kafka-231F20.svg)](https://kafka.apache.org/)

## 📋 Descripción

`bk-sgai` es el backend del **Sistema de Gestión Administrativa e Infraestructura (SGAI)** del Ecosistema UNP de la Unidad Nacional de Protección.

Administra los procesos de contratación pública, gestión de inventario y almacén de insumos, órdenes de trabajo (OT), mantenimiento e infraestructura física, hoja de vida y asignación de vehículos, certificados administrativos y gestión del talento humano.

## 🏗️ Arquitectura del Proyecto

```text
bk-sgai/
├── almacen/         # Entradas, salidas, transferencias y control de stock de almacén
├── certificados/    # Generación y validación de certificados administrativos oficiales
├── contratacion/    # Registro, seguimiento y ejecución de contratos institucionales
├── infraestructura/ # Administración de sedes, mantenimiento físico e infraestructura
├── inventario/      # Control de bienes de activo fijo y propiedad, planta y equipo
├── novedad/         # Reporte y gestión de novedades administrativas
├── ot/              # Gestión de Órdenes de Trabajo (OT) y mantenimiento
├── sgai/            # Configuración principal de Django (settings, urls, wsgi, asgi)
├── talento_humano/  # Gestión de personal administrativo y operativo
├── vehiculo/        # Control de parque automotor, pólizas, mantenimientos y asignaciones
├── requirements.txt # Dependencias Python
└── manage.py        # Script de gestión Django
```

## 🚀 Tecnologías Utilizadas

- **Framework Principal:** Django 5.2.10 & Django REST Framework 3.15.2
- **API GraphQL:** `graphene 3.4.3` & `graphql-core`
- **Bases de Datos:** Microsoft SQL Server (`mssql-django 1.6`) & PostgreSQL (`psycopg2`)
- **Streaming de Eventos:** `kafka-python 2.2.13`
- **Procesamiento de Documentos:** `reportlab`, `pdfkit`, `PyPDF2`, `python-docx`, `extract-msg`, `python-odt-template`
- **Servidor ASGI:** Daphne / Uvicorn

## 📦 Instalación y Configuración

### 1. Clonar el repositorio
```bash
git clone https://github.com/EcosistemaUNP/bk-sgai.git
cd bk-sgai
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

# Base de Datos (SQL Server o PostgreSQL)
DATABASE_ENGINE='mssql' # o 'django.db.backends.postgresql'
DATABASE_NAME='SGAI_DB'
DATABASE_USER='sa'
DATABASE_PASSWORD='tu-password-sql-server'
DATABASE_HOST='localhost'
DATABASE_PORT='1433'

# Kafka Broker (Opcional)
KAFKA_BOOTSTRAP_SERVERS='localhost:9092'
```

Requiere el archivo `.secret.key` en la raíz para descifrar las credenciales de BD si están cifradas.

### 5. Aplicar Migraciones
```bash
python manage.py migrate
```

### 6. Ejecutar Servidor de Desarrollo
```bash
python manage.py runserver 0.0.0.0:8000
```

## 🔑 Endpoints & GraphQL API

- `POST /graphql/` - Endpoint GraphQL para consultas flexibles de bienes, vehículos y ordenes de trabajo.
- `GET /api/sgai/almacen/` - Endpoints REST de gestión de inventarios y stock.
- `GET /api/sgai/vehiculo/` - Endpoints REST de parque automotor.

## 🧪 Pruebas

```bash
python manage.py test
```

---
*Desarrollado para la Unidad Nacional de Protección (UNP) de Colombia.*
