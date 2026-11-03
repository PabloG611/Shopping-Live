import requests
from urllib.parse import urljoin
from django.conf import settings


def mask_pii(value, visible_chars=4):
    """
    Enmascara datos personales (PII) para logging seguro.

    Ejemplos:
        mask_pii("1234567890")    → "1234****"
        mask_pii("abc@mail.com")  → "abc@****"
        mask_pii("Juan", 2)       → "Ju**"
        mask_pii(None)            → None
        mask_pii(12345)           → "1234****"

    Args:
        value: Valor a enmascarar (str, int, o None).
        visible_chars: Número de caracteres visibles al inicio (default 4).

    Returns:
        Valor enmascarado como string, o None si value es None.
    """
    if value is None:
        return None
    s = str(value)
    if '@' in s:
        # Email: mostrar parte antes del @, enmascarar dominio parcial
        local, _, domain = s.partition('@')
        if len(domain) > 3:
            domain = domain[:1] + '***'
        return f'{local}@{domain}'
    if len(s) <= visible_chars:
        return s[0] + '*' * (len(s) - 1) if len(s) > 1 else '*'
    return s[:visible_chars] + '*' * (len(s) - visible_chars)


HSER_BASE_URL = getattr(settings, "HSER_BASE_URL", "https://ecosistemapruebas.unp.gov.co/hser/")

def call_hser(path: str, payload: dict, timeout=(3, 5)) -> dict:
    url = urljoin(HSER_BASE_URL, path)
    try:
        resp = requests.post(url, data=payload, timeout=timeout)
        if resp.status_code != 200:
            raise ValueError(f"HSER {path} devolvió {resp.status_code}")
        return resp.json()
    except requests.Timeout as e:
        raise ValueError(f"HSER {path} timeout") from e
    except requests.RequestException as e:
        raise ValueError(f"HSER {path} error de red") from e
    except ValueError:
        raise
    except Exception as e:
        raise ValueError(f"HSER {path} error inesperado") from e
