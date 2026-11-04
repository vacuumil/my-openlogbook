import asyncio
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.api.deps import get_current_user
from app.core.limiter import limiter
from app.models.user import User

router = APIRouter()

MAX_CALENDAR_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 3
TIMEOUT_SECONDS = 15


class CalendarRequest(BaseModel):
    url: str = Field(..., min_length=10, max_length=2000)


class CalendarResponse(BaseModel):
    text: str


def _bad_link(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


async def _check_public_host(url: str) -> str:
    """Only https to a host on the public internet: the server must not become a way into its own network."""
    parts = urlsplit(url)
    if parts.scheme != "https" or not parts.hostname:
        raise _bad_link("Нужна ссылка https:// на календарь (.ics)")
    if parts.username or parts.password:
        raise _bad_link("Ссылка не должна содержать логин и пароль")
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, parts.hostname, parts.port or 443, type=socket.SOCK_STREAM)
    except socket.gaierror:
        raise _bad_link("Сервер календаря не найден")
    for info in infos:
        address = ipaddress.ip_address(info[4][0].split("%")[0])
        if not address.is_global:
            raise _bad_link("Этот адрес календаря недоступен")
    return url


@router.post("/calendar", response_model=CalendarResponse)
@limiter.limit("10/minute")
async def fetch_calendar(request: Request, body: CalendarRequest, current_user: User = Depends(get_current_user)):
    """Downloads a roster calendar for the browser, which cannot read another site's calendar itself."""
    url = body.url.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]

    async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS, follow_redirects=False, headers={"Accept": "text/calendar, */*"}) as client:
        for _ in range(MAX_REDIRECTS + 1):
            await _check_public_host(url)
            try:
                async with client.stream("GET", url) as response:
                    if response.is_redirect and response.headers.get("location"):
                        # Every hop is checked again before it is followed
                        url = urljoin(url, response.headers["location"])
                        continue
                    if response.status_code != 200:
                        raise _bad_link(f"Сервер календаря ответил ошибкой {response.status_code}. Проверьте ссылку.")
                    data = bytearray()
                    async for chunk in response.aiter_bytes():
                        data.extend(chunk)
                        if len(data) > MAX_CALENDAR_BYTES:
                            raise _bad_link("Календарь слишком большой")
                    break
            except httpx.HTTPError:
                raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Не удалось загрузить календарь. Попробуйте позже.")
        else:
            raise _bad_link("Слишком много перенаправлений")

    text = data.decode("utf-8", errors="replace")
    if "BEGIN:VCALENDAR" not in text[:2000].upper():
        raise _bad_link("По ссылке не календарь. Нужна ссылка на .ics")
    return CalendarResponse(text=text)
