import asyncio
import time
from app.config import settings


class TokenBucketRateLimiter:
    """
    Token bucket rate limiter for email sending.
    Allows bursting up to bucket capacity, refills at configured rate.
    """

    def __init__(self, rate: float = None, capacity: int = None):
        self.rate = rate or settings.MAX_SEND_RATE  # tokens per second
        self.capacity = capacity or int(self.rate * 2)  # allow 2s burst
        self.tokens = self.capacity
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self):
        """Wait until a token is available."""
        while True:
            async with self._lock:
                self._refill()
                if self.tokens >= 1:
                    self.tokens -= 1
                    return
            await asyncio.sleep(0.05)  # 50ms wait before retry

    def _refill(self):
        now = time.monotonic()
        elapsed = now - self.last_refill
        new_tokens = elapsed * self.rate
        if new_tokens > 0:
            self.tokens = min(self.capacity, self.tokens + new_tokens)
            self.last_refill = now

    def update_rate(self, new_rate: float):
        """Update the rate limit (e.g., from SES quota or admin override)."""
        self.rate = new_rate
        self.capacity = int(new_rate * 2)
