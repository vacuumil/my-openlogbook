import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "OpenLogBook API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    
    # Database mode
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    POSTGRES_SERVER: str = os.getenv("POSTGRES_SERVER", "")
    POSTGRES_USER: str = os.getenv("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.getenv("POSTGRES_PASSWORD", "postgres")
    POSTGRES_DB: str = os.getenv("POSTGRES_DB", "logbook")
    POSTGRES_PORT: str = os.getenv("POSTGRES_PORT", "5432")
    
    @property
    def SQLALCHEMY_DATABASE_URI(self) -> str:
        if self.DATABASE_URL:
            return self.DATABASE_URL
        # If running inside Docker where POSTGRES_SERVER='postgres' is explicitly passed
        if self.POSTGRES_SERVER == "postgres":
            return f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        # Default for local development without Docker: robust zero-config local SQLite
        return "sqlite+aiosqlite:///./openlogbook.db"
        
    SECRET_KEY: str = os.getenv("SECRET_KEY", "super-secret-pilot-logbook-key-change-in-production-123456789")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days for mobile pilot convenience

    class Config:
        case_sensitive = True

settings = Settings()
