from pathlib import Path
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent
RESOURCES_DIR = BASE_DIR / "app" / "resources"


class Settings(BaseSettings):
    app_name: str = "PushToProdSeoul API"
    debug: bool = False

    base_dir: Path = BASE_DIR
    resources_dir: Path = RESOURCES_DIR

    anthropic_api_key: str | None = None
    claude_model: str = "claude-sonnet-4-6"

    class Config:
        env_file = BASE_DIR / ".env"
        env_file_encoding = "utf-8"


settings = Settings()
