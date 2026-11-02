import os
import base64
import hashlib
import logging
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.core.config import settings

logger = logging.getLogger("openlogbook.security")

def _derive_key(key_str: str) -> bytes:
    return hashlib.sha256(key_str.encode("utf-8")).digest()

def _get_aes_key() -> bytes:
    key_material = getattr(settings, "ENCRYPTION_KEY", None) or settings.SECRET_KEY
    return _derive_key(key_material)

def _get_old_aes_key() -> Optional[bytes]:
    old_key = getattr(settings, "OLD_ENCRYPTION_KEY", None)
    if old_key and old_key.strip():
        return _derive_key(old_key.strip())
    return None

_CIPHER_PREFIX = "enc:v1:"

def encrypt_value(plaintext: Optional[str]) -> Optional[str]:
    """
    Encrypts a plaintext string using AES-256-GCM with the active ENCRYPTION_KEY.
    Returns string in format: enc:v1:<base64(nonce + ciphertext + tag)>
    If plaintext is None or empty, returns as-is.
    """
    if not plaintext:
        return plaintext

    # Failures must propagate: silently storing plaintext would defeat the encryption
    key = _get_aes_key()
    aesgcm = AESGCM(key)
    # 12-byte (96-bit) standard nonce for GCM
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    # Pack nonce + ciphertext
    payload = base64.b64encode(nonce + ciphertext).decode("utf-8")
    return f"{_CIPHER_PREFIX}{payload}"

def decrypt_value(data: Optional[str]) -> Optional[str]:
    """
    Decrypts an AES-256-GCM encrypted string.
    Supports key rotation: tries current ENCRYPTION_KEY first,
    falls back to OLD_ENCRYPTION_KEY if set and current key fails.
    If the data is unencrypted (legacy format), returns the string as-is.
    """
    if not data or not isinstance(data, str):
        return data

    if not data.startswith(_CIPHER_PREFIX):
        # Legacy unencrypted value
        return data

    payload_b64 = data[len(_CIPHER_PREFIX):]
    try:
        raw = base64.b64decode(payload_b64.encode("utf-8"))
    except Exception:
        return data

    if len(raw) < 12 + 16:  # 12-byte nonce + 16-byte auth tag
        return data

    nonce = raw[:12]
    ciphertext = raw[12:]

    # 1. Try with primary active key
    try:
        key = _get_aes_key()
        aesgcm = AESGCM(key)
        decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
        return decrypted_bytes.decode("utf-8")
    except Exception as primary_err:
        # 2. Try with fallback OLD_ENCRYPTION_KEY if configured (key rotation in progress)
        old_key = _get_old_aes_key()
        if old_key:
            try:
                old_aesgcm = AESGCM(old_key)
                decrypted_bytes = old_aesgcm.decrypt(nonce, ciphertext, None)
                return decrypted_bytes.decode("utf-8")
            except Exception as old_err:
                logger.error("Decryption failed with both primary and old key: %s", old_err)
                return data
        logger.error("Decryption failed: %s", primary_err)
        return data
