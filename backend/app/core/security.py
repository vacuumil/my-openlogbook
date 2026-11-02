from datetime import datetime, timedelta, timezone
from typing import Optional, Any
import hashlib
import hmac
import bcrypt
from jose import jwt
from app.core.config import settings

ALGORITHM = "HS256"

# Verified when the account is unknown, so login timing does not reveal registered emails
DUMMY_PASSWORD_HASH = bcrypt.hashpw(b"openlogbook-timing-guard", bcrypt.gensalt(rounds=12)).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")

def password_fingerprint(hashed_password: str) -> str:
    """Token claim tied to the current password, so changing it revokes older sessions."""
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), hashed_password.encode("utf-8"), hashlib.sha256).hexdigest()[:16]

def create_access_token(
    subject: str | Any,
    expires_delta: Optional[timedelta] = None,
    hashed_password: Optional[str] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    if hashed_password:
        to_encode["pwf"] = password_fingerprint(hashed_password)
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
