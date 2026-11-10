"""KuroLight application primary entry point.

Launches the full KuroLight graphical application by default (with animated
splash screen and Obsidian Dark theme). Also supports `--headless` for CLI
status verification or automation.

Usage
-----
    python -m kurolight.main
    python -m kurolight
    kurolight
    # or for engine diagnostics:
    python -m kurolight.main --headless
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Ensure src directory is on sys.path when executed directly as `python main.py`
_src_dir = Path(__file__).resolve().parent.parent
if str(_src_dir) not in sys.path:
    sys.path.insert(0, str(_src_dir))


def _print_command_catalog() -> int:
    from kurolight.app.command_dispatcher import CommandDispatcher

    dispatcher = CommandDispatcher()
    print(json.dumps(dispatcher.get_command_catalog(), indent=2))
    return 0


def _dispatch_cli_command(command_id: str, payload: str | None) -> int:
    from kurolight.app.command_dispatcher import CommandDispatcher
    from kurolight.domain.editing import EditState

    dispatcher = CommandDispatcher()
    parsed_payload = {}
    if payload:
        try:
            parsed_payload = json.loads(payload)
        except json.JSONDecodeError as exc:
            print(f"Invalid JSON payload: {exc}", file=sys.stderr)
            return 2
    if not isinstance(parsed_payload, dict):
        parsed_payload = {"value": parsed_payload}

    state = None
    if command_id in {"undo", "redo", "edit_state_update", "kuro_ai_apply_proposal"}:
        asset_id = parsed_payload.get("asset_id") if isinstance(parsed_payload, dict) else "cli-command"
        state = EditState(asset_id=str(asset_id or "cli-command"))

    result = dispatcher.dispatch(command_id, parsed_payload, state)
    print(json.dumps(result.to_dict(), indent=2))
    return 0 if result.ok else 1


def main() -> int:
    """Initialize and run KuroLight."""
    parser = argparse.ArgumentParser(
        description="KuroLight — Intelligent Visual Creation & Photo Editing Environment"
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run KuroLight engine in headless mode without GUI",
    )
    parser.add_argument(
        "--db-path",
        type=Path,
        default=None,
        help="Custom path to project vault (.kurolight)",
    )
    parser.add_argument(
        "--list-commands",
        action="store_true",
        help="List the discovered typed command catalog for automation and CLI usage.",
    )
    parser.add_argument(
        "--command",
        help="Run a registered command by ID in headless mode.",
    )
    parser.add_argument(
        "--payload",
        help="JSON payload passed to the dispatched command.",
    )
    args, _ = parser.parse_known_args()

    if args.list_commands:
        return _print_command_catalog()

    if args.command:
        return _dispatch_cli_command(args.command, args.payload)

    if args.headless:
        from kurolight.app.bootstrap import bootstrap_services

        services = bootstrap_services(db_path=args.db_path)
        print("KuroLight engine ready (headless).")
        print(f"  Project: {services['project_service']}")
        return 0

    from kurolight.run_gui import run

    return run()


if __name__ == "__main__":
    sys.exit(main())
