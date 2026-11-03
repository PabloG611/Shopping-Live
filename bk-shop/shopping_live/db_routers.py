class SharedSchemaRouter:
    """
    Router por defecto de Shopping Live.

    Arquitectura actual (ver bitácora §3): multitienda sobre UNA sola base de
    datos con aislamiento lógico por `tienda`. Por eso todo va a 'default'.

    Se conserva este router como punto único de extensión: si más adelante se
    agrega una base de solo-lectura, réplicas o un esquema externo, la lógica de
    ruteo se concentra aquí sin tocar las apps.
    """

    def db_for_read(self, model, **hints):
        return "default"

    def db_for_write(self, model, **hints):
        return "default"

    def allow_relation(self, obj1, obj2, **hints):
        return True

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        return db == "default"
