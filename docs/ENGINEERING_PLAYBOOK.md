# KuroLight Engineering Playbook

This playbook defines KuroLight's core engineering practices across its native Python, React,
and pywebview architecture. KuroLight is built as an independent, local-first professional photo
library and non-destructive editing platform.

## Product direction

KuroLight is a local-first, non-destructive photo library and editing application. The original
image should remain unchanged while the catalog stores metadata and edit settings and the
processing engine produces previews and exports.

The long-term goal is a complete professional workflow: import and organize a library, cull
photos, develop and retouch them, compare edits, and deliver finished files. Reach that goal in
small, verified increments. A feature is not "complete" merely because it has a control in the
UI; its data model, processing, persistence, undo behavior, automation path, and tests must agree.

## Current KuroLight architecture

Keep the current technology choices unless a separately reviewed decision establishes a better
path. Maintain KuroLight's native modular Python architecture with clear service and domain boundaries.

```text
React + TypeScript UI
        ↕ typed bridge calls/events
PyWebView bridge and desktop startup
        ↓
Application state and services
   ↙        ↓         ↘
Library   Editing    Export / AI
   ↓        ↓           ↓
Domain models and validation
        ↓
SQLite, image codecs, caches, OS credential store

Processing pipeline: source → decoded buffer → edit operations → preview/export
```

Relevant current modules:

| Area | KuroLight location |
|---|---|
| React workspace composition and app state | `web/src/App.tsx` |
| Typed browser-to-Python API | `web/src/bridge.ts` |
| Python desktop bridge | `src/kurolight/ui/web_bridge.py` |
| Application and edit state | `src/kurolight/app/app_state.py` |
| Edit, asset, collection, export, and project models | `src/kurolight/domain/` |
| Processing graph and render pipeline | `src/kurolight/processing/` |
| Catalog persistence and migrations | `src/kurolight/infrastructure/database/` |
| Library, editing, export, and preset operations | `src/kurolight/services/` |
| Reversible edit history | `src/kurolight/app/command_dispatcher.py` |
| Kuro AI model/tool schemas | `src/kurolight/ai/` |

Today, UI bridge methods, the edit-history `CommandDispatcher`, and Kuro AI function tools are
separate concepts. The intended direction is to converge user-visible operations on a typed,
discoverable application-command layer. This should be an incremental migration: keep current
bridge calls working while routing them through commands, then expose the same commands to
automation. Do not replace working paths in one broad rewrite.

## Engineering principles

1. **Keep the domain independent of the UI.** React components present state and send intent.
   They should not implement image processing, persistence rules, or library business logic.
2. **One behavior, one implementation.** A user action, shortcut, Kuro AI tool, CLI action, or
   future MCP tool should call the same validated operation instead of duplicating its behavior.
3. **Preserve originals.** Edits are settings; previews and exports are derived outputs. Any
   workflow that moves, deletes, or overwrites files must be explicit, validated, and recoverable
   where practical.
4. **Make changes reversible.** User-visible edits and catalog mutations should have deliberate
   undo/history semantics. Group high-frequency slider updates into meaningful undo steps.
5. **Validate at boundaries.** Validate file paths, image sizes, edit values, serialized payloads,
   and external AI responses before they affect state or files.
6. **Fail visibly and accurately.** Return a structured error on failure. Do not silently default,
   swallow errors, or report success when persistence or export failed.
7. **Protect responsiveness.** Keep decoding, analysis, and full-resolution rendering off the UI
   thread; bound memory and work; support progress and cancellation for long jobs.
8. **Test behavior, not just controls.** Verify image output, persistence, undo, and file results,
   in addition to UI visibility and bridge responses.
9. **Track evidence and gaps.** Mark support as complete only after testing representative files,
   output, and edge cases. Keep unknown coverage distinct from unsupported behavior.
10. **Respect privacy and consent.** Explain when an image or prompt leaves the device. Store
    credentials in the OS credential store and require explicit approval for AI-proposed edits.
11. **Keep dependencies and assets reviewable.** Check licenses, provenance, maintenance, and
    platform implications before adding them. Use original KuroLight branding and product copy.
12. **Prefer targeted changes.** Fix the root cause, add a focused regression test, and avoid
    unrelated rewrites.

## Command model target

The shared command layer is a high-priority foundation for parity and safe automation. A command
definition should eventually describe:

- Stable ID, display name, and short description.
- Typed and validated input schema with defaults and ranges.
- Preconditions and a useful disabled/refusal reason.
- Query versus mutation semantics.
- Whether it participates in edit history, and its undo behavior.
- A handler implemented by an application service.
- Tests for valid input, invalid input, side effects, and errors.

Use namespaced IDs such as `photo.rate`, `library.import`, `develop.set`, and `edit.undo`.
Commands should return typed/serializable results. Discovery should report the supported IDs and
their parameters rather than making clients guess. A generic command runner is not a substitute
for safe schemas or explicit authorization of file-writing operations.

### Automation evolution

1. Route existing bridge methods through shared service/command functions without changing UI
   behavior.
2. Make command descriptions and input schemas discoverable and testable.
3. Register Kuro AI tools against approved commands or safe read-only service functions.
4. Add a CLI only when the shared operations and error/result contracts are stable.
5. Add MCP or another external protocol as a separate transport over those same operations.
6. If connecting to a running desktop session, constrain it to loopback by default, bound message
   sizes, validate request IDs and payloads, and define retry behavior for unknown outcomes.

Kuro AI's existing function-calling tools are not equivalent to an MCP server. Keep that
distinction clear in product docs and feature status.

## Day-to-day implementation workflow

For each change:

1. Read the relevant KuroLight model, service, UI bridge, and tests before editing.
2. Identify one user-visible gap and describe an observable acceptance criterion.
3. Decide which layer owns the behavior. Keep the UI thin and reuse a service where possible.
4. Add or update a test that would fail if the required behavior regressed.
5. Implement the smallest complete change, including input validation and user-visible errors.
6. Run targeted Python tests (`python -m pytest tests/<focused_test>.py -q`), then the relevant
   broader tests if the change crosses layers.
7. For frontend changes, run `npm run lint` and `npm run build` in `web/`.
8. Inspect the final diff and confirm no unrelated or generated files changed.
9. Update the KuroLight feature matrix and user documentation in the same change.
10. Report exactly what changed and which checks actually ran.

For processing work, include a representative image fixture or synthetic pixel test and verify
numerical output, not merely that the operation returns an image. For import/export work, verify
the files and metadata on disk. For persistence work, test reopen/recovery and schema migration.
For bridge/automation work, test malformed requests and error paths as well as success.

## Development commands

From the project root:

```powershell
python -m pytest tests/ -q
```

For the web UI, from `web/`:

```powershell
npm run lint
npm run build
```

Use a focused test while iterating, and run all affected checks before considering a cross-layer
change finished. Do not claim a check passed unless it was run.

## Safety and product behavior

- Never edit an original photo as a side effect of changing develop settings.
- Require an explicit output destination and overwrite policy for destructive file operations.
- Apply AI proposals only after user approval, and reject proposals based on stale image/edit
  state.
- Do not log API keys, image contents, or unnecessary personal metadata.
- Bound decoded dimensions and allocations before processing untrusted files.
- Make optional format libraries and AI dependencies fail with an actionable explanation.
- Treat cancellation, partial batch success, disk errors, and duplicate imports as real outcomes.

## Feature status vocabulary

Use these labels consistently in `FEATURE_PARITY.md`:

- **Complete:** the user flow exists and has tests/evidence for the stated scope.
- **Present:** a code/UI foundation was found; end-to-end behavior is not implied.
- **Partial:** some of the flow exists; important behavior, coverage, or validation is missing.
- **Needs audit:** code or UI exists, but support/quality has not been verified against acceptance
  criteria.
- **Planned:** not implemented as a user-usable feature.
- **Not in scope:** an explicit product decision, not a temporary gap.

Do not use a checkmark to imply camera, codec, platform, or quality parity without evidence.
