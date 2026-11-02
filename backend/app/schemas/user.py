from uuid import UUID
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, field_validator
import re

def validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Пароль должен содержать не менее 8 символов.")
    if not re.search(r"\d", v):
        raise ValueError("Пароль должен содержать хотя бы одну цифру.")
    if not re.search(r"[a-zA-Zа-яА-Я]", v):
        raise ValueError("Пароль должен содержать хотя бы одну букву.")
    return v

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    license_number: Optional[str] = None
    profile_json: Optional[str] = None

class UserCreate(UserBase):
    password: str

    @field_validator("password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    license_number: Optional[str] = None
    profile_json: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def check_password(cls, v: str) -> str:
        return validate_password_strength(v)

class AccountDelete(BaseModel):
    password: str

class UserResponse(UserBase):
    id: UUID
    is_active: bool
    is_superuser: bool = False
    created_at: datetime
    profile_json: Optional[str] = None

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class TokenPayload(BaseModel):
    sub: Optional[str] = None
