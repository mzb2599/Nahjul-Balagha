import logging
import random
import time
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Statuses that indicate a temporary upstream problem and are safe to retry.
TRANSIENT_STATUS_CODES = frozenset({408, 409, 425, 429, 500, 502, 503, 504})

TRANSIENT_MESSAGES = (
    "connection reset",
    "connection was reset",
    "reset by peer",
    "forcibly closed",
    "connection aborted",
    "connection refused",
    "connection error",
    "handshake",
    "ssl",
    "eof occurred",
    "read timed out",
    "read timeout",
    "connect timeout",
    "timed out",
    "timeout",
    "temporarily unavailable",
    "service unavailable",
    "deadline exceeded",
    "internal server error",
    "bad gateway",
    "gateway timeout",
    "rate limit",
    "resource exhausted",
    "quota exceeded",
    "max retries exceeded",
)

TRANSIENT_EXCEPTION_NAMES = frozenset(
    {
        "apiconnectionerror",
        "connectionerror",
        "connectionreseterror",
        "connecttimeout",
        "internalservererror",
        "readtimeout",
        "remoteprotocolerror",
        "servererror",
        "serviceunavailable",
        "timeouterror",
    }
)


def _status_code(error: BaseException) -> int | None:
    for attribute in ("status_code", "code", "status"):
        value = getattr(error, attribute, None)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.isdigit():
            return int(value)
    return None


def is_transient(error: BaseException) -> bool:
    """Return True when retrying the same call has a reasonable chance of working."""
    if _status_code(error) in TRANSIENT_STATUS_CODES:
        return True
    if type(error).__name__.lower() in TRANSIENT_EXCEPTION_NAMES:
        return True
    message = str(error).lower()
    return any(hint in message for hint in TRANSIENT_MESSAGES)


def call_with_retry(
    func: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 8.0,
    label: str = "request",
) -> T:
    """Call a blocking operation, retrying transient upstream failures with jitter."""
    attempts = max(1, attempts)
    for attempt in range(1, attempts + 1):
        try:
            return func()
        except Exception as error:
            if attempt >= attempts or not is_transient(error):
                raise
            delay = min(max_delay, base_delay * (2 ** (attempt - 1)))
            delay *= 0.75 + random.random() * 0.5
            logger.warning(
                "%s failed (attempt %d/%d): %s. Retrying in %.1fs.",
                label,
                attempt,
                attempts,
                error,
                delay,
            )
            time.sleep(delay)
    raise RuntimeError(f"{label} failed without an exception.")
