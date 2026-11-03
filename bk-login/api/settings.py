from pathlib import Path
from decouple import config
from cryptography.fernet import Fernet
import os
from decouple import Csv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = config('SECRET_KEY')

INTERNAL_SERVICE_TOKEN = config('INTERNAL_SERVICE_TOKEN')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = config('DEBUG', default=False, cast=bool)
URL_UNP = config('URL_UNP')
ALLOWED_HOSTS = config('ALLOWED_HOSTS', cast=lambda v: [
                       s.strip() for s in v.split(',')])
ALLOWED_ORIGINS = config('ALLOWED_ORIGINS', cast=lambda v: [
                         s.strip() for s in v.split(',')])

DATA_UPLOAD_MAX_MEMORY_SIZE = 157286400  # aprox 150 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 157286400  # aprox 150 MB

INSTALLED_APPS = [
    'corsheaders',
    'django_otp',
    'django_otp.plugins.otp_totp',
    'two_factor',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'custom_auth',
    'users',
    'gateway',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'api.middlewares.SecureRequestMiddleware.SecureRequestMiddleware',
    'api.middleware.eco_security_middleware.ServiceSecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'django_otp.middleware.OTPMiddleware',
    'api.middlewares.middleware.LoggerMiddlewareDatabase',
    'api.middlewares.middleware.AtomicMiddleware',
]

ROOT_URLCONF = config('ROOT_URLCONF')

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [
            BASE_DIR / 'templates',
        ],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = config('WSGI_APPLICATION')


def load_key():
    return open(".secret.key", "rb").read()


def decrypt_message(encrypted_message):
    key = load_key()
    f = Fernet(key)
    decrypted_message = f.decrypt(encrypted_message.encode()).decode()
    return decrypted_message


BACKEND_ID = config('BACKEND_ID')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': decrypt_message(config('DATABASE_NAME_AUTH')),
        'USER': decrypt_message(config('DATABASE_USER_AUTH')),
        'PASSWORD': decrypt_message(config('DATABASE_PASSWORD_AUTH')),
        'HOST': decrypt_message(config('DATABASE_HOST_AUTH')),
        'PORT': decrypt_message(config('DATABASE_PORT_AUTH')),
    },

    'unp': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': decrypt_message(config('DATABASE_NAME_UNP')),
        'USER': decrypt_message(config('DATABASE_USER_UNP')),
        'PASSWORD': decrypt_message(config('DATABASE_PASSWORD_UNP')),
        'HOST': decrypt_message(config('DATABASE_HOST_UNP')),
        'PORT': decrypt_message(config('DATABASE_PORT_UNP')),
    },

    'ser': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': decrypt_message(config('DATABASE_NAME_SER')),
        'USER': decrypt_message(config('DATABASE_USER_SER')),
        'PASSWORD': decrypt_message(config('DATABASE_PASSWORD_SER')),
        'HOST': decrypt_message(config('DATABASE_HOST_SER')),
        'PORT': decrypt_message(config('DATABASE_PORT_SER')),
    },

    'sesp': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': decrypt_message(config('DATABASE_NAME_SESP')),
        'USER': decrypt_message(config('DATABASE_USER_SESP')),
        'PASSWORD': decrypt_message(config('DATABASE_PASSWORD_SESP')),
        'HOST': decrypt_message(config('DATABASE_HOST_SESP')),
        'PORT': decrypt_message(config('DATABASE_PORT_SESP')),
    },

    'sp': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': decrypt_message(config('DATABASE_NAME_SP')),
        'USER': decrypt_message(config('DATABASE_USER_SP')),
        'PASSWORD': decrypt_message(config('DATABASE_PASSWORD_SP')),
        'HOST': decrypt_message(config('DATABASE_HOST_SP')),
        'PORT': decrypt_message(config('DATABASE_PORT_SP')),
    },

    'sth': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': decrypt_message(config('DATABASE_NAME_STH')),
        'USER': decrypt_message(config('DATABASE_USER_STH')),
        'PASSWORD': decrypt_message(config('DATABASE_PASSWORD_STH')),
        'HOST': decrypt_message(config('DATABASE_HOST_STH')),
        'PORT': decrypt_message(config('DATABASE_PORT_STH')),
    }
}

# Reutilización de conexiones persistentes en TODAS las bases: mantener cada
# conexión abierta hasta CONN_MAX_AGE segundos en lugar de abrir/cerrar una por
# cada request (handshake TCP+auth). Configurable por entorno.
# IMPORTANTE: el total de conexiones = (workers) x (bases activas). Ajustar
# DB_CONN_MAX_AGE / el max_connections de Postgres en coordinación con infra.
_conn_max_age = config('DB_CONN_MAX_AGE', default=60, cast=int)
for _db_config in DATABASES.values():
    _db_config.setdefault('CONN_MAX_AGE', _conn_max_age)
    _db_config.setdefault('CONN_HEALTH_CHECKS', True)

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
        # ASVS V2.1.1: mínimo 12 caracteres (backlog 6.5)
        'OPTIONS': {'min_length': 12},
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
    {
        # ASVS V2.1.7: contraseñas comunes y filtradas (lista de Django más la
        # tabla CommonPassword; reemplaza a CommonPasswordValidator)
        'NAME': 'custom_auth.validators.CommonPasswordDBValidator',
    },
]

# Roadmap §9.5: Argon2id para las contraseñas nuevas (HALLAZGO-AA). Los demás
# hashers se conservan para verificar los hashes existentes; Django los migra a
# Argon2 en el siguiente login exitoso de cada usuario.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',
    'django.contrib.auth.hashers.ScryptPasswordHasher',
]


LANGUAGE_CODE = config('LANGUAGE_CODE')
TIME_ZONE = config('TIME_ZONE')
USE_I18N = config('USE_I18N', cast=bool)
USE_TZ = config('USE_TZ', cast=bool)

STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')
STATIC_URL = config('STATIC_URL')
DEFAULT_AUTO_FIELD = config('DEFAULT_AUTO_FIELD')

SESSION_COOKIE_SECURE = config('SESSION_COOKIE_SECURE')
CSRF_COOKIE_SECURE = config('CSRF_COOKIE_SECURE')

# Security headers
SECURE_HSTS_SECONDS = 31536000
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_BROWSER_XSS_FILTER = True

#CORS_ALLOW_CREDENTIALS = True

default_headers = [
    'authorization',
    'content-type',
    'x-csrftoken',
    'x-requested-with',
    'bk-service',
    'user-agent',
    'origin',
]

CORS_ALLOW_METHODS = [
    'GET',
    'POST',
    'PUT',
    'DELETE',
    'OPTIONS',
    'PATCH'
]

CORS_ALLOWED_ORIGINS = config('CORS_ORIGINS', cast=Csv())
CORS_ALLOW_CREDENTIALS = config('CORS_ALLOW_CREDENTIALS', default=True, cast=bool)
CORS_ALLOW_HEADERS = default_headers
CORS_ALLOW_METHODS = CORS_ALLOW_METHODS

EMAIL_HOST = config('EMAIL_HOST')
EMAIL_PORT = config('EMAIL_PORT', cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = (config('EMAIL_HOST_PASSWORD'))
DEFAULT_FROM_EMAIL = config('DEFAULT_FROM_EMAIL')

CACHES = {
    'default': {
        'BACKEND': 'django_redis.cache.RedisCache',
        'LOCATION': [f"redis://:{decrypt_message(config('REDIS_PASS'))}@{decrypt_message(config('REDIS_HOST'))}:{decrypt_message(config('REDIS_PORT'))}/{config('REDIS_DB', default='1')}"],
        'OPTIONS': {
            'CLIENT_CLASS': 'django_redis.client.DefaultClient',
        }
    }
}

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'simple': {
            'format': '[{levelname}] {asctime} {name} {message}',
            'style': '{',
        },
    },
    'filters': {
        'redact_sensitive': {
            '()': 'utils.log_redaction.RedactSensitiveFilter',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'simple',
            'filters': ['redact_sensitive'],
        },
        # julio.gutierrez- definiendo un archivo log
            'file': {
              'class': 'logging.FileHandler',
              'filename': '/app/Ecosistema/logs/bk-login/bk-login.log',
              'formatter': 'simple',
           },
    },
    'root': {
        'handlers': ['console'],  # Solo console
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],  # julio.gutierrez- definiendo un archivo log
            'level': 'INFO',
            'propagate': True,
        },
        # Tu logger personalizado
        'bk-auth-sentry': {
            # julio.gutierrez- definiendo un archivo log
            'handlers': ['console','file'],
            'level': 'INFO',
            'propagate': True,
        },
    },
}

# Configuración de GDAL y GEOS para soporte GIS (Geospatial)
if os.name == 'nt':  # Windows
    GDAL_LIBRARY_PATH = config('GDAL_LIBRARY_PATH', default=None)
    GEOS_LIBRARY_PATH = config('GEOS_LIBRARY_PATH', default=None)
