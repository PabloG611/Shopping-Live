import os
import base64

def imagen_a_base64(ruta_relativa):
    # Obtener la ruta absoluta del directorio del proyecto
    directorio_proyecto = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
    # Unir la ruta base con la ruta relativa de la imagen
    ruta_imagen = os.path.join(directorio_proyecto, 'img', ruta_relativa)
    
    # Verificar si el archivo existe
    if not os.path.isfile(ruta_imagen):
        raise FileNotFoundError(f"No such file or directory: '{ruta_imagen}'")
    
    # Convertir la imagen a base64
    with open(ruta_imagen, "rb") as img_file:
        base64_data = base64.b64encode(img_file.read()).decode("utf-8")
    
    return base64_data

