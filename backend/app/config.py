"""
GestureHub Backend — Backward-compatible config shim.

The canonical settings object now lives in app.core.config.
This module re-exports it so existing imports like
`from app.config import settings` continue to work.
"""
from app.core.config import settings  # noqa: F401

__all__ = ["settings"]