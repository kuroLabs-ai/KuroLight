"""Command dispatcher and non-destructive undo/redo history engine."""

import copy
import json
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, List, Optional

from PySide6.QtCore import QObject, Signal

from kurolight.domain.editing import EditState


@dataclass(frozen=True)
class CommandSpec:
    """Definition for a typed, discoverable command."""

    command_id: str
    title: str
    description: str
    input_schema: dict[str, Any]
    preconditions: tuple[str, ...] = ()
    undoable: bool = True
    read_only: bool = False
    category: str = "editing"
    shortcut: tuple[str, ...] = ()
    authorization: str = "none"
    read_write_hint: str = "write"
    payload_limit_bytes: int = 65536
    retry_policy: str = "none"
    usage_notes: tuple[str, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.command_id,
            "title": self.title,
            "description": self.description,
            "input_schema": self.input_schema,
            "preconditions": list(self.preconditions),
            "undoable": self.undoable,
            "read_only": self.read_only,
            "category": self.category,
            "shortcut": list(self.shortcut),
            "authorization": self.authorization,
            "read_write_hint": self.read_write_hint,
            "payload_limit_bytes": self.payload_limit_bytes,
            "retry_policy": self.retry_policy,
            "usage_notes": list(self.usage_notes),
        }


@dataclass
class CommandResult:
    """Typed result container returned by command dispatching."""

    ok: bool
    command_id: str
    result: Any = None
    error: Optional[str] = None
    error_code: Optional[str] = None
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "ok": self.ok,
            "command_id": self.command_id,
        }
        if self.result is not None:
            payload["result"] = self.result
        if self.error is not None:
            payload["error"] = self.error
        if self.error_code is not None:
            payload["error_code"] = self.error_code
        if self.warnings:
            payload["warnings"] = self.warnings
        return payload


class Command(ABC):
    """Abstract reversible editing command."""

    @abstractmethod
    def execute(self, state: EditState) -> EditState:
        """Apply command modifications and return updated state."""
        ...

    @abstractmethod
    def undo(self, state: EditState) -> EditState:
        """Reverse command modifications and return restored state."""
        ...

    @property
    @abstractmethod
    def description(self) -> str:
        """Human-readable description for UI undo/redo menus."""
        ...


class EditStateSnapshotCommand(Command):
    """Generic snapshot-based command for parameter groups."""

    def __init__(self, before_state: EditState, after_state: EditState, description: str):
        self._before_json = before_state.model_dump_json()
        self._after_json = after_state.model_dump_json()
        self._description = description

    def execute(self, state: EditState) -> EditState:
        return EditState.model_validate_json(self._after_json)

    def undo(self, state: EditState) -> EditState:
        return EditState.model_validate_json(self._before_json)

    @property
    def description(self) -> str:
        return self._description

    def to_dict(self) -> dict[str, str]:
        return {
            "before_state": self._before_json,
            "after_state": self._after_json,
            "description": self._description,
        }

    @classmethod
    def from_dict(cls, data: dict[str, str]) -> "EditStateSnapshotCommand":
        before_state = EditState.model_validate_json(data["before_state"])
        after_state = EditState.model_validate_json(data["after_state"])
        if before_state.asset_id != after_state.asset_id:
            raise ValueError("Edit history command refers to different photos.")
        return cls(before_state, after_state, data["description"])


class CommandDispatcher(QObject):
    """Manages command execution and the undo/redo stack."""

    can_undo_changed = Signal(bool)
    can_redo_changed = Signal(bool)
    command_executed = Signal(str)  # command description
    history_updated = Signal(list, int)  # (descriptions, active_index)

    def __init__(self, undo_limit: int = 100, parent: Optional[QObject] = None):
        super().__init__(parent)
        self._undo_limit = undo_limit
        self._undo_stack: List[Command] = []
        self._redo_stack: List[Command] = []
        self._command_specs: dict[str, CommandSpec] = {}
        self._command_handlers: dict[str, Callable[[dict[str, Any], Optional[EditState]], Any]] = {}
        self._register_builtin_commands()

    def _register_builtin_commands(self) -> None:
        self.register_command(
            CommandSpec(
                command_id="undo",
                title="Undo",
                description="Rewind the previous edit snapshot.",
                input_schema={"type": "object", "additionalProperties": False},
                preconditions=("requires_current_state",),
                undoable=False,
                category="editing",
                shortcut=("Ctrl+Z", "⌘Z"),
                authorization="user",
                read_write_hint="write",
                payload_limit_bytes=4096,
                retry_policy="none",
                usage_notes=("Allowed for reversible photo adjustments only.",),
            ),
            lambda payload, state: self.undo(state) if state else state,
        )
        self.register_command(
            CommandSpec(
                command_id="redo",
                title="Redo",
                description="Replay the next edit snapshot.",
                input_schema={"type": "object", "additionalProperties": False},
                preconditions=("requires_current_state",),
                undoable=False,
                category="editing",
                shortcut=("Ctrl+Shift+Z", "⌘⇧Z"),
                authorization="user",
                read_write_hint="write",
                payload_limit_bytes=4096,
                retry_policy="none",
                usage_notes=("Only active after an undo step.",),
            ),
            lambda payload, state: self.redo(state) if state else state,
        )
        self.register_command(
            CommandSpec(
                command_id="edit_state_update",
                title="Apply edit-state patch",
                description="Validate and apply a structured edit-state patch.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "asset_id": {"type": "string"},
                        "patch": {"type": "object"},
                    },
                    "required": ["patch"],
                    "additionalProperties": False,
                },
                preconditions=("requires_current_state",),
                category="editing",
                shortcut=("Ctrl+E",),
                authorization="user",
                read_write_hint="write",
                payload_limit_bytes=131072,
                retry_policy="retry_on_validation_error",
                usage_notes=("Patch data must match the current photo and edit schema.",),
            ),
            self._apply_edit_state_patch,
        )
        self.register_command(
            CommandSpec(
                command_id="kuro_ai_apply_proposal",
                title="Apply Kuro AI proposal",
                description="Apply an approved Kuro AI edit proposal to the active photo.",
                input_schema={
                    "type": "object",
                    "properties": {
                        "asset_id": {"type": "string"},
                        "candidate_state": {"type": "object"},
                        "expected_base_fingerprint": {"type": "string"},
                    },
                    "required": ["asset_id", "candidate_state", "expected_base_fingerprint"],
                    "additionalProperties": False,
                },
                preconditions=("requires_current_state",),
                category="ai",
                shortcut=("Ctrl+K", "⌘K"),
                authorization="trusted_user",
                read_write_hint="write",
                payload_limit_bytes=262144,
                retry_policy="retry_on_stale_state",
                usage_notes=("Approved AI suggestions must match the current photo state before commit.",),
            ),
            lambda payload, state: {
                "accepted": True,
                "asset_id": payload.get("asset_id"),
                "expected_base_fingerprint": payload.get("expected_base_fingerprint"),
                "candidate_state": payload.get("candidate_state"),
            },
        )

    def register_command(
        self,
        spec: CommandSpec,
        handler: Callable[[dict[str, Any], Optional[EditState]], Any],
    ) -> None:
        if spec.command_id in self._command_specs:
            raise ValueError(f"Command {spec.command_id!r} is already registered.")
        self._command_specs[spec.command_id] = spec
        self._command_handlers[spec.command_id] = handler

    def get_command_catalog(self) -> list[dict[str, Any]]:
        return [spec.to_dict() for spec in self._command_specs.values()]

    def _validate_schema(self, schema: dict[str, Any], value: Any, path: str = "payload") -> Any:
        schema_type = schema.get("type")
        if "enum" in schema and value not in schema["enum"]:
            allowed = ", ".join(str(item) for item in schema["enum"])
            raise ValueError(f"{path} must be one of: {allowed}.")
        if schema_type == "object":
            if not isinstance(value, dict):
                raise TypeError(f"{path} must be an object.")
            for key, child_schema in schema.get("properties", {}).items():
                if key in value:
                    self._validate_schema(child_schema, value[key], f"{path}.{key}")
            required = schema.get("required", [])
            for key in required:
                if key not in value:
                    raise ValueError(f"Missing required field: {path}.{key}")
            return value
        if schema_type == "array":
            if not isinstance(value, list):
                raise TypeError(f"{path} must be a list.")
            item_schema = schema.get("items", {})
            for idx, item in enumerate(value):
                self._validate_schema(item_schema, item, f"{path}[{idx}]")
            return value
        if schema_type == "string":
            if not isinstance(value, str):
                raise TypeError(f"{path} must be a string.")
            return value
        if schema_type == "integer":
            if not isinstance(value, int) or isinstance(value, bool):
                raise TypeError(f"{path} must be an integer.")
            return value
        if schema_type == "number":
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                raise TypeError(f"{path} must be a number.")
            return value
        if schema_type == "boolean":
            if not isinstance(value, bool):
                raise TypeError(f"{path} must be a boolean.")
            return value
        return value

    def _check_preconditions(self, spec: CommandSpec, payload: dict[str, Any], state: Optional[EditState]) -> None:
        if "requires_current_state" in spec.preconditions and state is None:
            raise ValueError("This command requires the current edit state.")
        if "asset_id" in payload and state is not None and payload.get("asset_id") not in {None, state.asset_id}:
            raise ValueError("Command asset_id does not match the current edit state.")

    def _apply_edit_state_patch(
        self,
        payload: dict[str, Any],
        state: Optional[EditState],
    ) -> dict[str, Any]:
        if state is None:
            raise ValueError("Current edit state is required to apply a patch.")
        patch = payload.get("patch", {})
        if not isinstance(patch, dict):
            raise TypeError("Command patch must be an object.")
        if payload.get("asset_id") and payload["asset_id"] != state.asset_id:
            raise ValueError("Patch asset_id does not match the current photo.")

        merged = copy.deepcopy(state.model_dump(mode="python"))
        merged = self._deep_merge(merged, patch)
        try:
            updated = EditState.model_validate(merged)
        except Exception as exc:  # pragma: no cover - validation is driven by Pydantic
            raise ValueError(f"Invalid edit-state patch: {exc}") from exc
        return {"state": updated.model_dump(mode="json")}

    @staticmethod
    def _deep_merge(base: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
        merged = copy.deepcopy(base)
        for key, value in patch.items():
            if isinstance(value, dict) and isinstance(merged.get(key), dict):
                merged[key] = CommandDispatcher._deep_merge(merged[key], value)
            else:
                merged[key] = value
        return merged

    def dispatch(
        self,
        command_id: str,
        payload: Optional[dict[str, Any]] = None,
        state: Optional[EditState] = None,
    ) -> CommandResult:
        spec = self._command_specs.get(command_id)
        if spec is None:
            return CommandResult(False, command_id, error=f"Unknown command: {command_id}", error_code="unknown_command")

        if payload is None:
            payload = {}
        if not isinstance(payload, dict):
            return CommandResult(False, command_id, error="Command payload must be a JSON object.", error_code="invalid_input")

        payload_size = len(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
        if spec.payload_limit_bytes and payload_size > spec.payload_limit_bytes:
            return CommandResult(
                False,
                command_id,
                error=(
                    f"Payload exceeds the {spec.payload_limit_bytes} byte limit for {command_id}."
                ),
                error_code="payload_too_large",
            )

        try:
            validated = self._validate_schema(spec.input_schema, payload, path="payload")
            self._check_preconditions(spec, validated, state)
            handler = self._command_handlers[command_id]
            result = handler(validated, state)
            if command_id in {"undo", "redo"}:
                if isinstance(result, EditState):
                    return CommandResult(True, command_id, result={"state": result.model_dump(mode="json")})
                return CommandResult(True, command_id, result=result)
            return CommandResult(True, command_id, result=result)
        except (TypeError, ValueError) as exc:
            return CommandResult(False, command_id, error=str(exc), error_code="invalid_input")
        except Exception as exc:  # pragma: no cover - runtime safety for dispatch
            return CommandResult(False, command_id, error=f"Command failed: {exc}", error_code="execution_failed")

    @property
    def can_undo(self) -> bool:
        return len(self._undo_stack) > 0

    @property
    def can_redo(self) -> bool:
        return len(self._redo_stack) > 0

    @property
    def active_index(self) -> int:
        return len(self._undo_stack) - 1

    @property
    def undo_text(self) -> str:
        return self._undo_stack[-1].description if self.can_undo else ""

    @property
    def redo_text(self) -> str:
        return self._redo_stack[-1].description if self.can_redo else ""

    def get_history_list(self) -> List[str]:
        """Return descriptions of all commands in the timeline (undo + reversed redo)."""
        return [c.description for c in self._undo_stack] + [c.description for c in reversed(self._redo_stack)]

    def serialize_history(self) -> tuple[list[dict[str, str]], int]:
        """Return the complete serializable timeline and its active position."""
        commands = self._undo_stack + list(reversed(self._redo_stack))
        if any(not isinstance(command, EditStateSnapshotCommand) for command in commands):
            raise TypeError("Only edit-state snapshot commands can be persisted.")
        return (
            [command.to_dict() for command in commands],
            len(self._undo_stack) - 1,
        )

    def restore_history(
        self, commands_data: list[dict[str, str]], active_index: int
    ) -> None:
        """Restore a persisted edit timeline, validating it before changing dispatcher state."""
        if self._undo_limit <= 0:
            commands_data = []
            active_index = -1
        elif len(commands_data) > self._undo_limit:
            removed_count = len(commands_data) - self._undo_limit
            commands_data = commands_data[-self._undo_limit:]
            active_index = max(-1, active_index - removed_count)
        commands = [EditStateSnapshotCommand.from_dict(data) for data in commands_data]
        if active_index < -1 or active_index >= len(commands):
            raise ValueError("Persisted edit history has an invalid active position.")
        if commands:
            asset_id = EditState.model_validate_json(commands[0]._before_json).asset_id
            for command in commands:
                before = EditState.model_validate_json(command._before_json)
                after = EditState.model_validate_json(command._after_json)
                if before.asset_id != asset_id or after.asset_id != asset_id:
                    raise ValueError("Persisted edit history contains another photo.")

        self._undo_stack = commands[: active_index + 1]
        self._redo_stack = list(reversed(commands[active_index + 1:]))
        self._notify_state_change("Restore history")

    def execute_command(self, command: Command, state: EditState) -> EditState:
        """Execute command, push to undo stack, clear redo stack."""
        new_state = command.execute(state)
        self._undo_stack.append(command)
        if len(self._undo_stack) > self._undo_limit:
            self._undo_stack.pop(0)

        self._redo_stack.clear()
        self._notify_state_change(command.description)
        return new_state

    def undo(self, current_state: EditState) -> EditState:
        """Undo the last command."""
        if not self.can_undo:
            return current_state

        cmd = self._undo_stack.pop()
        restored_state = cmd.undo(current_state)
        self._redo_stack.append(cmd)
        self._notify_state_change(f"Undo {cmd.description}")
        return restored_state

    def redo(self, current_state: EditState) -> EditState:
        """Redo the previously undone command."""
        if not self.can_redo:
            return current_state

        cmd = self._redo_stack.pop()
        restored_state = cmd.execute(current_state)
        self._undo_stack.append(cmd)
        self._notify_state_change(f"Redo {cmd.description}")
        return restored_state

    def jump_to_step(self, target_index: int, current_state: EditState) -> EditState:
        """Rewind or fast-forward to a target command index in the current timeline."""
        current_idx = len(self._undo_stack) - 1
        state = current_state
        if target_index < -1:
            target_index = -1
        max_idx = len(self._undo_stack) + len(self._redo_stack) - 1
        if target_index > max_idx:
            target_index = max_idx

        while current_idx > target_index:
            state = self.undo(state)
            current_idx = len(self._undo_stack) - 1

        while current_idx < target_index:
            state = self.redo(state)
            current_idx = len(self._undo_stack) - 1

        return state

    def clear(self) -> None:
        """Reset history stacks."""
        self._undo_stack.clear()
        self._redo_stack.clear()
        self.can_undo_changed.emit(False)
        self.can_redo_changed.emit(False)
        self.history_updated.emit([], -1)

    def _notify_state_change(self, description: str) -> None:
        self.can_undo_changed.emit(self.can_undo)
        self.can_redo_changed.emit(self.can_redo)
        self.command_executed.emit(description)
        self.history_updated.emit(self.get_history_list(), self.active_index)
