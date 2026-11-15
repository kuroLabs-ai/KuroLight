import threading
import time

from kurolight.domain.editing import EditState
from kurolight.domain.export import ExportFormat, ExportJob, ExportResult, ExportSettings
from kurolight.services.export_job_manager import ExportJobManager


class _BlockingExportService:
    def __init__(self):
        self.started = threading.Event()
        self.release = threading.Event()

    def export_job(self, job, progress_cb=None, cancel_event=None):
        if job.asset_id == "first":
            self.started.set()
            self.release.wait(timeout=3)
        if progress_cb:
            progress_cb(1.0)
        return ExportResult(
            job_id=job.id,
            asset_id=job.asset_id,
            output_path=job.target_path or job.settings.output_dir / job.asset_name,
            success=True,
        )


class _PartiallyFailingExportService:
    def export_job(self, job, progress_cb=None, cancel_event=None):
        success = job.asset_id != "failed"
        if progress_cb:
            progress_cb(1.0)
        return ExportResult(
            job_id=job.id,
            asset_id=job.asset_id,
            output_path=job.target_path or job.settings.output_dir / job.asset_name,
            success=success,
            error_message=None if success else "test failure",
        )


class _CancelableExportService:
    def __init__(self):
        self.started = threading.Event()

    def export_job(self, job, progress_cb=None, cancel_event=None):
        self.started.set()
        assert cancel_event is not None
        cancel_event.wait(timeout=3)
        return ExportResult(
            job_id=job.id,
            asset_id=job.asset_id,
            output_path=job.target_path or job.settings.output_dir / job.asset_name,
            success=False,
            cancelled=True,
            error_message="Export cancelled.",
        )


def _job(asset_id, output_dir):
    return ExportJob(
        asset_id=asset_id,
        asset_name=f"{asset_id}.jpg",
        source_path=output_dir / f"{asset_id}.jpg",
        settings=ExportSettings(format=ExportFormat.JPEG, output_dir=output_dir),
        edit_state=EditState(asset_id=asset_id),
    )


def _wait_for_status(manager, job_id, expected, timeout=3):
    deadline = time.monotonic() + timeout
    status = manager.get(job_id)
    while status["status"] not in expected and time.monotonic() < deadline:
        time.sleep(0.02)
        status = manager.get(job_id)
    return status


def test_batch_can_pause_and_resume_between_images(tmp_path):
    service = _BlockingExportService()
    manager = ExportJobManager(service)
    job_id = manager.start([_job("first", tmp_path), _job("second", tmp_path)])

    assert service.started.wait(timeout=2)
    manager.control(job_id, "pause")
    service.release.set()
    paused = _wait_for_status(manager, job_id, {"paused", "completed", "failed"})
    assert paused["status"] == "paused"
    assert paused["completed"] == 1

    manager.control(job_id, "resume")
    completed = _wait_for_status(manager, job_id, {"completed", "failed"})
    assert completed["status"] == "completed"
    assert completed["succeeded"] == 2


def test_batch_cancellation_stops_before_next_image(tmp_path):
    service = _BlockingExportService()
    manager = ExportJobManager(service)
    job_id = manager.start([_job("first", tmp_path), _job("second", tmp_path)])

    assert service.started.wait(timeout=2)
    manager.control(job_id, "cancel")
    service.release.set()
    cancelled = _wait_for_status(manager, job_id, {"cancelled", "failed"})

    assert cancelled["status"] == "cancelled"
    assert cancelled["completed"] == 1
    assert cancelled["succeeded"] == 1


def test_batch_cancel_propagates_to_current_export_without_counting_a_failure(tmp_path):
    service = _CancelableExportService()
    manager = ExportJobManager(service)
    job_id = manager.start([_job("slow", tmp_path)])

    assert service.started.wait(timeout=2)
    manager.control(job_id, "cancel")
    cancelled = _wait_for_status(manager, job_id, {"cancelled", "failed"})

    assert cancelled["status"] == "cancelled"
    assert cancelled["completed"] == 0
    assert cancelled["failed"] == 0
    assert cancelled["errors"] == []


def test_batch_reports_per_file_failures_and_continues(tmp_path):
    manager = ExportJobManager(_PartiallyFailingExportService())
    job_id = manager.start(
        [_job("first", tmp_path), _job("failed", tmp_path), _job("last", tmp_path)]
    )

    completed = _wait_for_status(manager, job_id, {"completed", "failed"})

    assert completed["status"] == "completed"
    assert completed["completed"] == 3
    assert completed["succeeded"] == 2
    assert completed["failed"] == 1
    assert completed["errors"] == ["failed.jpg: test failure"]
