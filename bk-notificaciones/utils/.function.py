from cryptography.fernet import Fernet

# Genera una clave y guarda en un archivo
def generate_key():
    key = Fernet.generate_key()
    with open(".secret.key", "wb") as key_file:
        key_file.write(key)

# Cargar la clave desde un archivo
def load_key():
    return open(".secret.key", "rb").read()

# Encriptar un mensaje
def encrypt_message(message):
    key = load_key()
    f = Fernet(key)
    encrypted_message = f.encrypt(message.encode())
    return encrypted_message

# Desencriptar un mensaje
def decrypt_message(encrypted_message):
    key = load_key()
    f = Fernet(key)
    decrypted_message = f.decrypt(encrypted_message).decode()
    return decrypted_message


# generate_key()
