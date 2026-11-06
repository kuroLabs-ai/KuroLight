"""Centralized logging infrastructure for KuroLight."""

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

from kurolight.config.app_config import AppConfig

DEFAULT_LOG_FORMAT = "%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
MAX_LOG_BYTES = 5 * 1024 * 1024  # 5 MB
BACKUP_COUNT = 3

_initialized = False


def setup_logging(log_level: int = logging.INFO, log_dir: Optional[Path] = None) -> None:
    """Initialize root application logging."""
    global _initialized
    if _initialized:
        return

    if log_dir is None:
        log_dir = AppConfig.get_data_dir() / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)
    log_file = log_dir / "kurolight.log"

    formatter = logging.Formatter(DEFAULT_LOG_FORMAT)

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(log_level)

    # Rotating file handler
    file_handler = RotatingFileHandler(
        log_file,
        maxBytes=MAX_LOG_BYTES,
        backupCount=BACKUP_COUNT,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(log_level)

    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    root_logger.addHandler(console_handler)
    root_logger.addHandler(file_handler)

    _initialized = True
    logging.getLogger("kurolight").info("KuroLight logging initialized at %s", log_file)


def get_logger(name: str) -> logging.Logger:
    """Retrieve named logger within kurolight namespace."""
    if not name.startswith("kurolight"):
        name = f"kurolight.{name}"
    return logging.getLogger(name)
