import os
import time
import platform
from datetime import datetime, timezone

from django.http import JsonResponse
from django.db import connection
from django.views import View
from django.core.cache import cache


START_TIME = time.time()

class HealthCheckView(View):
    def get(self, request, endpoint=None):
        if endpoint == "health":
            return self.health()
        elif endpoint == "ready":
            return self.ready()
        elif endpoint == "status":
            return self.status()
        elif endpoint == "metrics":
            return self.metrics()
        return JsonResponse(
            {
                "error": "Endpoint no válido"
            },
            status=404
        )

    def health(self):
        """
        Liveness:
        Solo verifica que Django está vivo
        """
        return JsonResponse(
            {
                "status": "UP",
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            status=200
        )

    def ready(self):
        """
        Readiness:
        Verifica dependencias necesarias
        """
        checks = {
            "database": self.check_database(),
            "cache": self.check_cache()
        }
        ready = all(
            value["status"] == "UP"
            for value in checks.values()
        )
        return JsonResponse(
            {
                "status": "READY" if ready else "NOT_READY",
                "checks": checks
            },
            status=200 if ready else 503
        )
    
    def status(self):
        """
        Información del servicio
        """
        uptime = int(time.time() - START_TIME)
        return JsonResponse(
            {
                "service": os.getenv(
                    "SERVICE_NAME",
                    "django-api"
                ),

                "environment": os.getenv(
                    "ENVIRONMENT",
                    "development"
                ),

                "version": os.getenv(
                    "APP_VERSION",
                    "unknown"
                ),

                "instance": platform.node(),

                "python_version": platform.python_version(),

                "uptime_seconds": uptime,

                "timestamp": datetime.now(
                    timezone.utc
                ).isoformat()
            }
        )

    def metrics(self):
        """
        Métricas simples
        Compatible para ser consumido
        posteriormente por Prometheus
        """
        uptime = int(time.time() - START_TIME)
        return JsonResponse(
            {
                "uptime_seconds": uptime,
                "database_connections": self.database_connections(),
                "python_threads": platform.python_version(),
                "timestamp": datetime.now(
                    timezone.utc
                ).isoformat()
            }
        )

    def check_database(self):
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1")
            return {
                "status": "UP"
            }
        except Exception as e:
            return {
                "status": "DOWN",
                "error": str(e)
            }

    def check_cache(self):
        try:
            cache.set(
                "health_check",
                "ok",
                timeout=10
            )
            value = cache.get(
                "health_check"
            )
            if value == "ok":
                return {
                    "status": "UP"
                }
            return {
                "status": "DOWN"
            }

        except Exception as e:

            return {
                "status": "DOWN",
                "error": str(e)
            }

    def database_connections(self):
        try:
            return len(connection.queries)
        except Exception:
            return 0