import requests
from decouple import config
from cryptography.fernet import Fernet
from utils.logger_generico import _log_warn

_TIMEOUT = 30

def load_key():
    """Carga la clave de encriptación desde el archivo .secret.key"""
    return open(".secret.key", "rb").read()

def decrypt_message(encrypted_message):
    """
    Desencripta mensajes usando Fernet (encriptación simétrica)
    Utilizado para proteger credenciales de bases de datos y servicios externos
    """
    key = load_key()
    f = Fernet(key)
    decrypted_message = f.decrypt(encrypted_message.encode()).decode()
    return decrypted_message


class APIClient:
    def __init__(self, base_url, username, password):
        self.base_url = base_url
        self.username = username
        self.password = password
        self.token = None

    def login(self):
        url = f"{self.base_url}/Cuenta/Login"
        _log_warn("Intentando login en Novasoft...", level="info")
        _log_warn(f"URL: {url}", level="info")
        _log_warn(f"Username: {self.username}", level="info")
        
        response = requests.post(
            url,
            json={
                "UserLogin": self.username,
                "Password": self.password,
                "ConnectionName": decrypt_message(config('NOVASOFT_CONNECTION_NAME'))
            },
            headers={
                "Content-Type": "application/json"
            },
            timeout=_TIMEOUT
        )

        _log_warn(f"STATUS: {response.status_code}", level="info")

        if response.status_code != 200:
            raise Exception(f"Error autenticando: {response.text}")

        self.token = response.json().get("token")

        _log_warn("Login exitoso, token obtenido", level="info")


    def get_headers(self):
        if not self.token:
            raise Exception("No hay token, debes hacer login primero")

        return {
            "Authorization": f"Bearer {self.token}"
        }

    def get_data(self, endpoint):
        url = f"{self.base_url}/{endpoint}"
        response = requests.get(
            url,
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            timeout=_TIMEOUT
        )

        if response.status_code != 200:
            raise Exception(f"Error en GET: {response.text}")

        return response.json()
    

if __name__ == "__main__":
    client = APIClient(
        base_url=config('NOVASOFT_API_URL'),
        username=decrypt_message(config('NOVASOFT_USERNAME')),
        password=decrypt_message(config('NOVASOFT_PASSWORD'))
    )

    client.login()
    data = client.get_data("NOM/ConsultaDatos/1037324231")
    _log_warn(data, level="info")