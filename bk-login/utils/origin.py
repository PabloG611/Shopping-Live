from django.conf import settings

def Origen(evento: dict) -> bool:
    return evento.get("origen") == settings.BACKEND_ID

