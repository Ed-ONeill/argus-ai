"""Process-local bounds for expensive authenticated requests.

Cached reads and the scheduled pipeline do not consume this budget. A shared
external limiter is required before scaling the backend to multiple replicas.
"""
from collections import deque
from contextlib import contextmanager
import threading
import time

from fastapi import HTTPException


class RequestBudget:
    def __init__(self, calls: int, seconds: float, concurrent: int):
        self.calls, self.seconds = calls, seconds
        self._times = deque()
        self._lock = threading.Lock()
        self._slots = threading.BoundedSemaphore(concurrent)

    @contextmanager
    def acquire(self):
        if not self._slots.acquire(blocking=False):
            raise HTTPException(429, "Analysis capacity is busy. Please try again shortly.",
                                headers={"Retry-After": "30"})
        try:
            with self._lock:
                now = time.monotonic()
                while self._times and now - self._times[0] >= self.seconds:
                    self._times.popleft()
                if len(self._times) >= self.calls:
                    retry = max(1, int(self.seconds - (now - self._times[0])) + 1)
                    raise HTTPException(429, "Request limit reached. Please try again shortly.",
                                        headers={"Retry-After": str(retry)})
                self._times.append(now)
            yield
        finally:
            self._slots.release()


feed_recompute_budget = RequestBudget(calls=3, seconds=60, concurrent=1)
analysis_budget = RequestBudget(calls=20, seconds=60, concurrent=2)
