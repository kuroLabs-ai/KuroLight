# AI and privacy

KuroLight has two distinct AI paths. Local restoration runs on the computer;
Kuro AI assistant requests may send image context to an external provider.

## Kuro AI assistant

Kuro AI can analyze the current photo and prompt and return a proposed edit
state. The app renders a comparison and requires the user to approve the
proposal. Applying a proposal is rejected if the active asset or base edit
state changed after the proposal was prepared.

Provider availability depends on the configured provider, model, credentials,
and network. The user must accept the privacy disclosure before a provider
request is allowed. API credentials are stored through `keyring` and are not
saved in the project database.

When Kuro AI is opened, the app prepares the current photo/edit context locally.
The assistant request is initiated when the user submits a prompt. If image
context is enabled and accepted, the current image preview and prompt are sent
to the configured provider. Do not send sensitive images unless the user has
reviewed the provider's data policy and intends to share that context.

## Local AI restoration

Local restoration uses the configured local enhancement model and the selected
execution backend where available. Supported backends can include DirectML,
CUDA, and CPU, subject to installed runtime packages and hardware. A selected
GPU backend can fall back to CPU when acceleration is unavailable.

The Lightbox offers a local preview with progress and cancellation. The chosen
resolution target is also applied by the export pipeline. AI restoration can
invent or alter fine details; inspect results at full size.

The model must be present locally before inference. Model downloads are
separate from inference and require network access unless the model was
provided locally.

## Strict Offline mode

Strict Offline mode blocks application-initiated network operations covered by
the bridge, including Kuro AI requests/model discovery, model downloads, and
opening external URLs. It does not uninstall a model or remove stored
credentials. Keep Strict Offline enabled when the application must not contact
remote services.

## Data boundaries

- Source photos are read locally for normal import, editing, and local
  restoration.
- The catalog stores asset references, metadata, edit state, and project data.
- Provider credentials are held by the operating system credential store.
- A Kuro AI request can disclose the submitted prompt and the current image
  context to the selected provider.
- Local restoration inference runs on-device; obtaining the model may require a
  separate download.

Review the provider's terms and the app's privacy disclosure before enabling
cloud requests. Do not treat offline local processing and provider-backed
assistant requests as equivalent privacy paths.
