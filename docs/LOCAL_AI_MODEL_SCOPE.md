# Local AI Models: Architectural Scope, Licensing, Consent, Integrity, and Offline Contract

This document scopes the integration of optional on-device local AI models in KuroLight,
focusing on the Real-ESRGAN x4 detail restoration and super-resolution engine.

---

## 1. Architectural Scope and Design Goals

KuroLight provides optional on-device deep learning restoration alongside classical photographic
enhancement tools. While cloud-based LLM assistants (Kuro AI) suggest slider adjustments, local
neural models perform pixel-level restoration directly on the host machine.

### Model Specification
- **Architecture**: Real-ESRGAN x4plus (Compact RRDBNet with 4x upsampling).
- **Format**: ONNX (Open Neural Network Exchange), opset 13.
- **Model Size**: 67,051,787 bytes (~63.9 MB).
- **Expected SHA-256 Digest**: `fa18ce70de3a55f3149d0cc898d335d2d69fca29edc0692cb362c856b2942c3f`.
- **Default Storage Path**: `AppConfig.get_data_dir() / "models" / "realesrgan-x4plus.onnx"`.

### Tiled Inference Engine
To guarantee bounded RAM/VRAM usage across varied user hardware (including integrated GPUs and
entry-level laptops), KuroLight performs inference using a tiled sliding-window approach:
- **Tile Dimension**: 64×64 pixels input tile.
- **Tile Overlap**: 8 pixels border overlap to eliminate tile seam artifacts and border distortions.
- **Blending**: Linear feathering across overlapping margins.
- **Output Dimension Scaling**: Produces 4x super-resolution per tile, which is then mapped to
  user-selected target heights (720p, 1080p, 1440p, 2160p/4K) using high-quality Lanczos resampling.

---

## 2. Licensing and Provenance

| Component | License / Provenance | Commercial Use & Redistribution Terms |
|---|---|---|
| **Real-ESRGAN Code** | BSD 3-Clause License (Copyright © 2021, Xintao Wang). | Permitted with preservation of copyright notice and disclaimer. |
| **Pre-Trained Weights** | Trained on synthetic degradations of DF2K (DIV2K + Flickr2K) and OST datasets. | Non-commercial restriction removed on standard weights; open for photo editing use. |
| **Distribution Policy** | **Not bundled in installer**. Model weights are downloaded on-demand from verified public repositories. | Avoids distributing large binary assets in source repos and ensures clean licensing isolation. |

---

## 3. Explicit User Consent and Opt-In Gating

Local neural models will never be downloaded silently or without prior user consent:

1. **Configuration Setting**: `AISettings.allow_local_model_downloads` defaults to `False`.
2. **Explicit Trigger**: Download is initiated only when the user explicitly clicks "Download Enhancement Model"
   in the Detail panel or enables the feature in Settings.
3. **Pre-Download Disclosure**: The UI presents:
   - Exact download size (~67 MB).
   - Target installation directory on disk.
   - Functional purpose: 4x neural super-resolution and fine detail reconstruction.
   - Resource requirements: High CPU/GPU utilization during export/render.

---

## 4. Download Integrity and Tamper Protection

To prevent corruption, incomplete downloads, or malicious binary tampering, the download pipeline
enforces a 4-stage integrity check:

```
[HTTP Request] 
      │
      ▼
[Streaming Chunks] ──(1MB chunks)──► Update SHA-256 Digest & Accumulate Size
      │
      ├─► Chunk size exceeds 67,051,787 bytes ──► ABORT & Delete .download
      ├─► User cancels download               ──► ABORT & Delete .download
      │
      ▼ (HTTP Read Complete)
[Verify Size == 67,051,787 bytes]
      │
      ▼
[Verify SHA-256 == fa18ce70...]
      │
      ├─► Mismatch ──► Raise ValueError & Delete .download
      │
      ▼ (Integrity Verified)
[Atomic File Replace] ──► .download renamed to realesrgan-x4plus.onnx
```

### Pre-Execution Integrity Verification
Before instantiating an ONNX runtime session or loading weights into memory, `ImageEnhancementEngine._get_model()`
re-verifies both the file size and the SHA-256 checksum on disk. If a file is modified, truncated, or
tampered with by an external process, KuroLight refuses to load it and instructs the user to re-download.

---

## 5. Cancellation Lifecycle

Long-running operations must respond promptly to user cancellation:

- **Download Cancellation**: The download loop checks `cancel_event.is_set()` between 1 MB chunks.
  Upon cancellation, the streaming response closes, the temporary `.onnx.download` file is immediately
  unlinked, and `ProcessingCancelled` is raised. No orphan files remain.
- **Inference Cancellation**: During image enhancement, `cancel_event` is checked between tile predictions.
  If the user navigates away, changes settings, or clicks Cancel, inference halts after completing the
  current 64×64 tile without blocking the application thread.

---

## 6. Offline Behavior and Graceful Degradation

KuroLight enforces a strict local execution policy:

1. **Zero Internet Requirement for Inference**: Once the model is installed, all inference runs 100%
   locally via DirectML, CUDA, or CPU fallback. Zero telemetry, pingbacks, or license validation calls
   are made.
2. **Offline Absence Handling**: If a user attempts to enable AI resolution enhancement when the model
   is not present and no internet connection is available:
   - KuroLight surfaces a clear notification: `"The local AI enhancement model is not installed. Download requires an active internet connection."`
   - Image rendering falls back gracefully to standard pipeline preview.
3. **Classical Controls Parity**: Conventional detail adjustments (bilateral filter noise reduction,
   unsharp mask sharpening, high-pass clarity, and texture) require no external models and remain 100%
   functional offline at all times.
