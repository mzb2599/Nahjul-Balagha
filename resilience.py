import logging
import random
import re
import time
from typing import Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")

# Gemini/Google APIs put a suggested delay in the error body. Prefer it over a
# blind exponential backoff, especially for per-minute quota limits.
_RETRY_DELAY_RE = re.compile(
    r"retry(?:Delay['\"]?\s*[:=]\s*['\"]?|\s+in\s+)([\d.]+)\s*s",
    re.IGNORECASE,
)

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


def _suggested_delay(error: BaseException) -> float | None:
    match = _RETRY_DELAY_RE.search(str(error))
    if not match:
        return None
    try:
        return float(match.group(1))
    except ValueError:
        return None


def _format_delay(seconds: float) -> str:
    if seconds < 120:
        return f"{seconds:.0f} seconds"
    minutes = seconds / 60
    if minutes < 120:
        return f"{minutes:.0f} minutes"
    return f"{minutes / 60:.1f} hours"


def call_with_retry(
    func: Callable[[], T],
    *,
    attempts: int = 3,
    base_delay: float = 1.0,
    max_delay: float = 8.0,
    max_retry_wait: float = 120.0,
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
            suggested = _suggested_delay(error)
            if suggested is not None and suggested > max_retry_wait:
                # e.g. a daily quota reset: retrying inside this run cannot
                # succeed, so surface it instead of sleeping/wasting attempts.
                logger.error(
                    "%s is rate limited for another %s. Stopping instead of "
                    "retrying; any saved progress will be reused on the next run.",
                    label,
                    _format_delay(suggested),
                )
                raise
            if suggested is not None:
                delay = min(max_delay, suggested + 0.5)
            else:
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
