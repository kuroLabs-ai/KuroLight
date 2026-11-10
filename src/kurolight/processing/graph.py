"""Small DAG executor with a bounded, settings-aware in-memory cache."""

from __future__ import annotations

import hashlib
import json
import threading
from collections import OrderedDict
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

import numpy as np

ArrayProcessor = Callable[[tuple[np.ndarray, ...]], np.ndarray]


@dataclass(frozen=True)
class ProcessingNode:
    node_id: str
    dependencies: tuple[str, ...]
    parameters: Any
    processor: ArrayProcessor
    enabled: bool = True


class ProcessingGraph:
    """Runs array-processing DAGs while reusing unchanged upstream results."""

    SOURCE = "$source"

    def __init__(self, max_cache_bytes: int = 256 * 1024 * 1024) -> None:
        self.max_cache_bytes = max_cache_bytes
        self._cache: OrderedDict[str, tuple[np.ndarray, int]] = OrderedDict()
        self._cache_bytes = 0
        self._lock = threading.RLock()
        self.cache_hits = 0
        self.cache_misses = 0

    def clear_cache(self) -> None:
        with self._lock:
            self._cache.clear()
            self._cache_bytes = 0

    def cache_info(self) -> dict[str, int]:
        with self._lock:
            return {
                "entries": len(self._cache),
                "bytes": self._cache_bytes,
                "max_bytes": self.max_cache_bytes,
                "hits": self.cache_hits,
                "misses": self.cache_misses,
            }

    @staticmethod
    def _digest(value: Any) -> str:
        encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(encoded.encode("utf-8")).hexdigest()

    def run(
        self,
        source: np.ndarray,
        nodes: Iterable[ProcessingNode],
        *,
        process_version: int = 1,
    ) -> np.ndarray:
        if (
            isinstance(process_version, bool)
            or not isinstance(process_version, int)
            or process_version < 1
        ):
            raise ValueError("Processing version must be a positive integer")
        node_list = list(nodes)
        values: dict[str, np.ndarray] = {self.SOURCE: source}
        keys: dict[str, str] = {
            self.SOURCE: hashlib.sha256(
                memoryview(np.ascontiguousarray(source)).cast("B")
            ).hexdigest()
        }
        pending = {node.node_id: node for node in node_list}

        while pending:
            ready = [
                node for node in pending.values()
                if all(dep in values for dep in node.dependencies)
            ]
            if not ready:
                unresolved = ", ".join(sorted(pending))
                raise ValueError(f"Processing graph has a cycle or missing dependency: {unresolved}")

            for node in ready:
                if not node.dependencies:
                    raise ValueError(f"Processing node '{node.node_id}' has no input")
                input_keys = [keys[dep] for dep in node.dependencies]
                node_key = self._digest(
                    (
                        process_version,
                        node.node_id,
                        node.parameters,
                        input_keys,
                        node.enabled,
                    )
                )
                if not node.enabled:
                    values[node.node_id] = values[node.dependencies[0]]
                    keys[node.node_id] = keys[node.dependencies[0]]
                else:
                    cached = self._get_cached(node_key)
                    if cached is not None:
                        result = cached
                    else:
                        inputs = tuple(values[dep].copy() for dep in node.dependencies)
                        result = np.asarray(node.processor(inputs))
                        if result.ndim not in (2, 3):
                            raise ValueError(
                                f"Processing node '{node.node_id}' returned an invalid image shape"
                            )
                        self._put_cached(node_key, result)
                    values[node.node_id] = result
                    keys[node.node_id] = node_key
                del pending[node.node_id]

        last_node = node_list[-1] if node_list else None
        if last_node is None:
            return source.copy()
        return values[last_node.node_id].copy()

    def _get_cached(self, key: str) -> np.ndarray | None:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self.cache_misses += 1
                return None
            self._cache.move_to_end(key)
            self.cache_hits += 1
            return entry[0].copy()

    def _put_cached(self, key: str, value: np.ndarray) -> None:
        size = int(value.nbytes)
        if size > self.max_cache_bytes:
            return
        stored = value.copy()
        with self._lock:
            previous = self._cache.pop(key, None)
            if previous:
                self._cache_bytes -= previous[1]
            self._cache[key] = (stored, size)
            self._cache_bytes += size
            while self._cache_bytes > self.max_cache_bytes and self._cache:
                _, (_, removed_size) = self._cache.popitem(last=False)
                self._cache_bytes -= removed_size
