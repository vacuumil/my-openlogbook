from fastapi import Request
from slowapi import Limiter

def get_real_client_ip(request: Request) -> str:
    """
    Extracts the client IP address behind a single reverse proxy (Nginx).
    The proxy appends the address it saw to X-Forwarded-For, so only the last
    entry is trustworthy: anything before it is supplied by the client and
    could be rotated to dodge the rate limits.
    """
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[-1].strip()

    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"

limiter = Limiter(key_func=get_real_client_ip)
