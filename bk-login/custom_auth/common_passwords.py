"""
Utilidades para la lista de contraseñas comunes o filtradas (ASVS V2.1.7).

Las contraseñas se identifican por su SHA-1 en hexadecimal mayúsculas, que
es el formato de las listas de Have I Been Pwned. Así la base de datos nunca
guarda contraseñas en claro y se pueden cargar listas de hashes filtrados.

No importa modelos: lo usan el modelo CommonPassword, la migración que carga
la lista inicial y el comando cargar_contrasenas_comunes.
"""
import gzip
import hashlib
import re
from pathlib import Path
from typing import Iterator

import django.contrib.auth

_SHA1_RE = re.compile(r'^[0-9A-Fa-f]{40}$')


def hash_password(password: str) -> str:
    """SHA-1 de la contraseña en hexadecimal mayúsculas."""
    return hashlib.sha1(password.encode('utf-8'), usedforsecurity=False).hexdigest().upper()


def candidate_hashes(password: str) -> set:
    """
    Hashes con los que se busca una contraseña: tal cual y en minúsculas sin
    espacios en los extremos (las listas de texto plano están en minúsculas,
    igual que la de Django).
    """
    return {hash_password(password), hash_password(password.lower().strip())}


def django_default_list_path() -> Path:
    """Lista de ~20.000 contraseñas comunes que trae Django."""
    return Path(django.contrib.auth.__file__).resolve().parent / 'common-passwords.txt.gz'


def _open_text(path) -> Iterator[str]:
    path = Path(path)
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', encoding='utf-8', errors='ignore') as f:
        yield from f


def iter_hashes_from_text(path) -> Iterator[str]:
    """Hashes de un archivo de contraseñas en texto plano, una por línea."""
    for line in _open_text(path):
        password = line.strip()
        if password:
            yield hash_password(password)


def iter_hashes_from_sha1(path, min_count: int = 0) -> Iterator[str]:
    """
    Hashes de un archivo de SHA-1, uno por línea. Acepta el formato de Have I
    Been Pwned (`HASH:apariciones`); con min_count se omiten los hashes que
    aparecen menos veces.
    """
    for line in _open_text(path):
        sha1, _, count = line.strip().partition(':')
        if not _SHA1_RE.match(sha1):
            continue
        if min_count and count.isdigit() and int(count) < min_count:
            continue
        yield sha1.upper()
