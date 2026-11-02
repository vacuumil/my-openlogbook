from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_password_hash, verify_password, create_access_token, DUMMY_PASSWORD_HASH
from app.core.config import settings
from app.core.limiter import limiter
from app.core.crypto import encrypt_value, decrypt_value
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, UserUpdate, Token, PasswordChange, AccountDelete
from app.api.deps import get_current_user

router = APIRouter()

def normalize_email(email: str) -> str:
    return email.strip().lower()

async def find_user_by_email(db: AsyncSession, email: str):
    # lower() on the column also matches accounts registered before normalization
    result = await db.execute(select(User).where(func.lower(User.email) == normalize_email(email)))
    return result.scalars().first()

def user_to_response(user: User) -> UserResponse:
    res = UserResponse.model_validate(user)
    if res.profile_json:
        res.profile_json = decrypt_value(res.profile_json)
    return res

@router.post("/register", response_model=Token)
@limiter.limit("5/minute")
async def register(request: Request, user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if email exists
    if await find_user_by_email(db, user_in.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован. Пожалуйста, войдите в аккаунт."
        )

    user = User(
        email=normalize_email(user_in.email),
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        license_number=user_in.license_number
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token(user.id, hashed_password=user.hashed_password)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_to_response(user)
    }

@router.post("/login", response_model=Token)
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await find_user_by_email(db, credentials.email)
    password_ok = verify_password(credentials.password, user.hashed_password if user else DUMMY_PASSWORD_HASH)

    if not user or not password_ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль. Проверьте раскладку клавиатуры и правильность ввода.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Учетная запись заблокирована администратором."
        )

    access_token = create_access_token(user.id, hashed_password=user.hashed_password)
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user_to_response(user)
    }

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return user_to_response(current_user)

@router.put("/profile", response_model=UserResponse)
async def update_profile(
    profile_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if profile_in.full_name is not None:
        current_user.full_name = profile_in.full_name
    if profile_in.license_number is not None:
        current_user.license_number = profile_in.license_number
    if profile_in.profile_json is not None:
        current_user.profile_json = encrypt_value(profile_in.profile_json)

    await db.commit()
    await db.refresh(current_user)
    return user_to_response(current_user)

@router.post("/change-password", response_model=Token)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    data: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Текущий пароль указан неверно.")

    current_user.hashed_password = get_password_hash(data.new_password)
    await db.commit()
    await db.refresh(current_user)

    # Every other session is now revoked, so this device needs a fresh token
    return {
        "access_token": create_access_token(current_user.id, hashed_password=current_user.hashed_password),
        "token_type": "bearer",
        "user": user_to_response(current_user)
    }

@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("5/minute")
async def delete_account(
    request: Request,
    data: AccountDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Permanently delete the caller's account and every flight they own"""
    if not verify_password(data.password, current_user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Пароль указан неверно.")
    if current_user.is_superuser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Учётную запись администратора нельзя удалить здесь.")

    await db.delete(current_user)
    await db.commit()
    return None
