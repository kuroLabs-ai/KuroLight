"""Central application state representation."""

from typing import List, Optional
from PySide6.QtCore import QObject, Signal

from kurolight.domain.assets import ImageAsset
from kurolight.domain.editing import EditState
from kurolight.domain.projects import Project


class AppState(QObject):
    """Observable reactive application state."""

    project_changed = Signal(object)           # Optional[Project]
    active_asset_changed = Signal(object)      # Optional[ImageAsset]
    edit_state_changed = Signal(object)        # EditState
    workspace_changed = Signal(str)            # workspace name
    assets_updated = Signal()
    is_dirty_changed = Signal(bool)

    def __init__(self, parent: Optional[QObject] = None):
        super().__init__(parent)
        self._current_project: Optional[Project] = None
        self._active_asset: Optional[ImageAsset] = None
        self._current_edit_state: Optional[EditState] = None
        self._active_workspace: str = "library"
        self._assets: List[ImageAsset] = []
        self._is_dirty: bool = False

    @property
    def current_project(self) -> Optional[Project]:
        return self._current_project

    def set_current_project(self, project: Optional[Project]) -> None:
        self._current_project = project
        self.project_changed.emit(project)

    @property
    def active_asset(self) -> Optional[ImageAsset]:
        return self._active_asset

    def set_active_asset(self, asset: Optional[ImageAsset]) -> None:
        if self._active_asset != asset:
            self._active_asset = asset
            self.active_asset_changed.emit(asset)

    @property
    def current_edit_state(self) -> Optional[EditState]:
        return self._current_edit_state

    def set_current_edit_state(self, state: Optional[EditState]) -> None:
        self._current_edit_state = state
        self.edit_state_changed.emit(state)

    @property
    def active_workspace(self) -> str:
        return self._active_workspace

    def set_active_workspace(self, workspace: str) -> None:
        if self._active_workspace != workspace:
            self._active_workspace = workspace
            self.workspace_changed.emit(workspace)

    @property
    def assets(self) -> List[ImageAsset]:
        return self._assets

    def set_assets(self, assets: List[ImageAsset]) -> None:
        self._assets = assets
        self.assets_updated.emit()

    @property
    def is_dirty(self) -> bool:
        return self._is_dirty

    def set_dirty(self, dirty: bool) -> None:
        if self._is_dirty != dirty:
            self._is_dirty = dirty
            self.is_dirty_changed.emit(dirty)
