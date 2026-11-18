"""Small thread-safe FIFO cache for recomputable inference results."""
from collections import OrderedDict
from collections.abc import MutableMapping
import threading


class BoundedCache(MutableMapping):
    def __init__(self, max_entries):
        if max_entries < 1:
            raise ValueError("Cache bound must be positive")
        self.max_entries = max_entries
        self._data = OrderedDict()
        self._lock = threading.RLock()

    def __getitem__(self, key):
        with self._lock:
            return self._data[key]

    def __setitem__(self, key, value):
        with self._lock:
            self._data[key] = value
            while len(self._data) > self.max_entries:
                self._data.popitem(last=False)

    def __delitem__(self, key):
        with self._lock:
            del self._data[key]

    def __iter__(self):
        with self._lock:
            return iter(tuple(self._data))

    def __len__(self):
        with self._lock:
            return len(self._data)

    def clear(self):
        with self._lock:
            self._data.clear()
