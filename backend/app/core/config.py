import os
import logging
from pydantic_settings import BaseSettings

logger = logging.getLogger("openlogbook.security")

# Publicly known values from old example configs: never acceptable in production
PUBLIC_DEFAULT_KEYS = {
    "",
    "super-secret-pilot-logbook-key-change-in-production-123456789",
    "super-secure-aes256-gcm-master-key-must-be-32-chars-long!",
}
DEV_ONLY_KEY = "openlogbook-local-development-key"

class Settings(BaseSettings):
    PROJECT_NAME: str = "OpenLogBook API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

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
        
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    ENCRYPTION_KEY: str = os.getenv("ENCRYPTION_KEY", "")
    OLD_ENCRYPTION_KEY: str = os.getenv("OLD_ENCRYPTION_KEY", "")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 30  # 30 days for mobile pilot convenience

    def model_post_init(self, __context):
        if self.is_production:
            # A random fallback would make encrypted data unreadable after a restart
            missing = [
                name for name, value in (("SECRET_KEY", self.SECRET_KEY), ("ENCRYPTION_KEY", self.ENCRYPTION_KEY))
                if value in PUBLIC_DEFAULT_KEYS
            ]
            if missing:
                raise RuntimeError(f"Refusing to start: set unique values for {', '.join(missing)} in backend/.env")
            return
        if self.SECRET_KEY in PUBLIC_DEFAULT_KEYS or self.ENCRYPTION_KEY in PUBLIC_DEFAULT_KEYS:
            logger.warning("Using development keys: do not store real data with this configuration")
        self.SECRET_KEY = self.SECRET_KEY or DEV_ONLY_KEY
        self.ENCRYPTION_KEY = self.ENCRYPTION_KEY or self.SECRET_KEY

    # Strict CORS configuration
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")

    @property
    def parsed_cors_origins(self) -> list:
        return [orig.strip() for orig in self.CORS_ORIGINS.split(",") if orig.strip()]

    class Config:
        case_sensitive = True
        env_file = ".env"
        extra = "allow"

settings = Settings()
