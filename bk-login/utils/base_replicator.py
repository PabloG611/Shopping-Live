from django.conf import settings

BACKEND_MAP = {
    'SESP': 'sesp',
    'UNP': 'unp',
    'SER': 'ser',
}

def get_bases_destino():
    origen = settings.BACKEND_ID
    bases = []

    for backend, alias in BACKEND_MAP.items():
        if backend != origen and alias in settings.DATABASES:
            bases.append(alias)
    return bases

def replicar_en_bases(model_class, lookup: dict, defaults: dict):
    for db_alias in get_bases_destino():
        model_class.objects.using(db_alias).update_or_create(**lookup, defaults=defaults)
