"""Background execution and control for multi-image export batches."""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from kurolight.domain.export import ExportJob
from kurolight.services.export_service import ExportService


@dataclass
class _ManagedBatch:
    job_id: str
    jobs: list[ExportJob]
    status: str = "queued"
    completed: int = 0
    succeeded: int = 0
    failed: int = 0
    progress: float = 0.0
    current_asset: str = ""
    errors: list[str] = field(default_factory=list)
    pause_event: threading.Event = field(default_factory=threading.Event)
    cancel_event: threading.Event = field(default_factory=threading.Event)
    lock: threading.RLock = field(default_factory=threading.RLock)


class ExportJobManager:
    """Runs export batches without blocking the UI bridge."""

    def __init__(self, export_service: ExportService) -> None:
        self.export_service = export_service
        self._batches: dict[str, _ManagedBatch] = {}
        self._lock = threading.RLock()

    def start(self, jobs: list[ExportJob]) -> str:
        if not jobs:
            raise ValueError("Cannot start an empty export batch")
        batch = _ManagedBatch(job_id=str(uuid.uuid4()), jobs=jobs)
        batch.pause_event.set()
        with self._lock:
            self._batches[batch.job_id] = batch
        thread = threading.Thread(target=self._run, args=(batch,), daemon=True)
        thread.start()
        return batch.job_id

    def get(self, job_id: str) -> dict[str, Any]:
        batch = self._find(job_id)
        with batch.lock:
            return {
                "id": batch.job_id,
                "status": batch.status,
                "total": len(batch.jobs),
                "completed": batch.completed,
                "succeeded": batch.succeeded,
                "failed": batch.failed,
                "progress": batch.progress,
                "current_asset": batch.current_asset,
                "errors": list(batch.errors),
                "output_folder": str(batch.jobs[0].settings.output_dir),
            }

    def control(self, job_id: str, action: str) -> dict[str, Any]:
        batch = self._find(job_id)
        with batch.lock:
            if batch.status in {"completed", "failed", "cancelled"}:
                raise ValueError(f"Export job is already {batch.status}")
            if action == "pause":
                batch.status = "pausing" if batch.current_asset else "paused"
                batch.pause_event.clear()
            elif action == "resume":
                batch.status = "running"
                batch.pause_event.set()
            elif action == "cancel":
                batch.cancel_event.set()
                batch.pause_event.set()
                batch.status = "cancelling"
            else:
                raise ValueError(f"Unsupported export job action: {action}")
        return self.get(job_id)

    def _find(self, job_id: str) -> _ManagedBatch:
        with self._lock:
            batch = self._batches.get(job_id)
        if batch is None:
            raise KeyError(f"Export job not found: {job_id}")
        return batch

    def _run(self, batch: _ManagedBatch) -> None:
        with batch.lock:
            if batch.status == "queued":
                batch.status = "running"
        for index, job in enumerate(batch.jobs):
            while not batch.pause_event.wait(timeout=0.1):
                with batch.lock:
                    if batch.status == "pausing":
                        batch.status = "paused"
            if batch.cancel_event.is_set():
                break

            with batch.lock:
                batch.status = "running"
                batch.current_asset = job.asset_name

            def on_progress(value: float, current_index: int = index) -> None:
                with batch.lock:
                    batch.progress = min(1.0, (current_index + value) / len(batch.jobs))

            result = self.export_service.export_job(job, progress_cb=on_progress)
            with batch.lock:
                batch.completed += 1
                batch.succeeded += int(result.success)
                batch.failed += int(not result.success)
                if result.error_message:
                    batch.errors.append(f"{job.asset_name}: {result.error_message}")
                batch.progress = batch.completed / len(batch.jobs)
                batch.current_asset = ""

        with batch.lock:
            if batch.cancel_event.is_set():
                batch.status = "cancelled"
            elif batch.failed and batch.succeeded == 0:
                batch.status = "failed"
            else:
                batch.status = "completed"
            if batch.status == "completed":
                batch.progress = 1.0
