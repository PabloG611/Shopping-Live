from cryptography.fernet import Fernet

# Genera una nueva clave de Fernet (esto solo deberías hacerlo una vez)
key = Fernet.generate_key()

# Guarda esta clave de forma segura, por ejemplo, en un archivo de configuración