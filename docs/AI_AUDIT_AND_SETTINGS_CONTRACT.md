# Kuro AI Audit, Privacy Disclosure, and Settings UI Contract

This specification documents the privacy disclosure, user consent flow, credential management,
and review lifecycle governing Kuro AI in KuroLight.

---

## 1. Privacy Boundary and Local-First Architecture

KuroLight is a local-first photo management and raw development application. All cataloging,
image decoding, thumbnail caching, adjustments, and exports operate locally on the user's
machine without sending telemetry, metrics, or image data over the network.

Kuro AI provides optional, provider-backed visual analysis and non-destructive edit suggestions
powered by vision-capable large language models (Google Gemini, OpenAI, or Anthropic Claude).
Because calling these models requires transmitting data to third-party cloud infrastructure,
strict technical and contractual boundaries are enforced:

1. **Strictly Opt-In**: Kuro AI is disabled until the user explicitly accepts the Privacy Disclosure
   in Settings.
2. **Consent Gating**: All remote AI requests (`propose_ai_edits`, CLI AI dispatch) check
   `privacy_disclosure_accepted`. If `False`, execution is blocked immediately with a descriptive
   error.
3. **Selective Image Transmission**: Users can toggle `send_image_context`. When disabled, only
   textual prompts and numeric settings are transmitted; image pixels remain local.
4. **Versioned Disclosure**: Acceptance is tied to `privacy_disclosure_version` (currently `2026-11`).
   If disclosure terms change, a version increment resets consent and prompts re-approval.

---

## 2. Secure Credential Handling Contract

API credentials for external model providers are subject to strict security invariants:

| Requirement | Implementation Detail | Guarantee |
|---|---|---|
| **Storage Location** | Operating system credential locker (`keyring` library): Windows Credential Manager, macOS Keychain, Linux Secret Service / Keyring. | Keys are protected by OS login encryption; not plaintext. |
| **No Disk Persistence** | `AppConfig` (`config.json`), project SQLite files, sidecars, and logs NEVER store API keys. | Configuration backups or version control commits cannot leak credentials. |
| **Key Service Namespace** | Service name `"KuroLight"`, usernames `"kuro-ai:gemini"`, `"kuro-ai:openai"`, `"kuro-ai:anthropic"`. | Predictable isolation from other installed tools. |
| **Log & Error Redaction** | `KuroAIService._redact_sensitive_detail()` strips `Authorization: Bearer <key>` and `api-key=<key>` patterns from error messages and debug logs. | Stack traces and HTTP failure alerts never reveal keys. |
| **Key Revocation** | Settings UI provides a "Remove the saved key" checkbox per provider. Calling `save_ai_settings` with `remove_api_key=true` invokes `keyring.delete_password()`. | Immediate local credential purging. |

---

## 3. Proposal Approval and Stale-Result Protection

Kuro AI operates strictly as an advisory assistant. It is technically incapable of modifying
an asset's edit state directly:

```
[User Request] 
     │
     ▼
[Consent Check] ──(Not accepted)──► [Block with ValueError]
     │ (Accepted)
     ▼
[Kuro AI Provider Request] (Sends downsampled preview + prompt + metadata)
     │
     ▼
[Candidate Generation] ──► Returns { message, edits, base_state_fingerprint }
     │
     ▼
[UI Side-by-Side Review] ──► Shows Current vs Proposed preview + parameter diff
     │
     ├─────────► User clicks "Reject" ──► Discards proposal; no state change
     │
     └─────────► User clicks "Approve & Apply"
                       │
                       ▼
                 [Fingerprint Validation]
                       │
       ┌───────────────┴───────────────┐
  (Fingerprints Match)          (Fingerprints Differ)
       │                               │
       ▼                               ▼
[Apply Edit State]             [Reject Proposal]
[Record Undo Snapshot]         "Active photo settings changed while Kuro AI
                                was preparing an edit; proposal rejected."
```

### Stale Result Protection Algorithm
1. When generating a proposal, KuroLight computes `base_state_fingerprint = sha256(current_edit_state.json())`.
2. The proposal is returned with `base_state_fingerprint`.
3. When the user approves the edit, the bridge receives `(candidate_state, asset_id, base_state_fingerprint)`.
4. The bridge recomputes the fingerprint of `app_state.current_edit_state`.
5. If the user adjusted any slider (e.g. tweaked exposure, white balance, or crop) while waiting for
   the AI response, the fingerprints do not match.
6. The bridge rejects the application, preserving the user's manual in-flight edits from being
   overwritten by stale suggestions.

---

## 4. User-Facing AI Settings UI Specification

The Settings modal exposes the **Kuro AI / LLM** tab with the following UI components and behavior:

### UI Components
1. **Privacy & Security Contract Card**:
   - Outlines keychain storage, review before apply, and stale edit protection.
2. **Consent & Context Controls**:
   - Checkbox: `I acknowledge and accept the Kuro AI privacy disclosure (v2026-11).`
   - Checkbox: `Send active photo preview with AI requests.`
3. **Provider Selection**:
   - Dropdown: Google Gemini, OpenAI, Anthropic Claude.
4. **Model Discovery & Selection**:
   - Model search input.
   - Action buttons: "Refresh models" and "Test connection" (validates active or input credentials).
   - Dropdown of filtered vision-capable models.
5. **API Key Entry**:
   - Password field (masked).
   - Saved key indicator (`key saved securely in OS Keychain`).
   - "Remove the saved key for this provider from OS Keychain" checkbox.

### Bridge API Contract

#### `get_ai_settings() -> str`
Returns a JSON object:
```json
{
  "provider": "gemini",
  "model": "gemini-2.5-flash",
  "has_api_key": true,
  "saved_keys": {
    "gemini": true,
    "openai": false,
    "anthropic": false
  },
  "privacy_disclosure_accepted": true,
  "privacy_disclosure_version": "2026-11",
  "send_image_context": true
}
```

#### `save_ai_settings(settings_json: str) -> str`
Payload:
```json
{
  "provider": "openai",
  "model": "gpt-4o",
  "api_key": "sk-...",
  "remove_api_key": false,
  "privacy_disclosure_accepted": true,
  "privacy_disclosure_version": "2026-11",
  "send_image_context": true
}
```
Behavior:
- Validates provider and model.
- If `api_key` is provided, stores in `keyring` under `kuro-ai:{provider}`.
- If `remove_api_key` is true, deletes key from `keyring`.
- Updates `AppConfig.ai` settings and saves config.
- Returns updated `get_ai_settings()`.

#### `propose_ai_edits(prompt: str, history_json: str) -> str`
Pre-conditions:
- `config.ai.privacy_disclosure_accepted` must be `True`.
- Valid active asset and source buffer must be available.
- Provider API key must be present in `keyring`.
Returns proposal including `candidate_state`, `current_preview`, `proposed_preview`, `edits`, and `base_state_fingerprint`.

#### `apply_ai_proposal(candidate_json: str, asset_id: str, base_fingerprint: str) -> str`
Pre-conditions:
- Asset ID matches active asset.
- `base_fingerprint` matches current edit state fingerprint.
- `candidate_state` contains only valid `EditState` fields.
Effect:
- Applies candidate edit state, records undo history, triggers preview render, notifies UI.
