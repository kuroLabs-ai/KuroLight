# KuroLight — Documentation Suite

Welcome to the documentation suite for **KuroLight**, a high-performance desktop photo editing and library management application built with **Python 3.13**, **PySide6 / pywebview**, and **React 19 / Vite / Tailwind CSS**.

---

## 1. Core Architecture & API Reference

| Document | Description |
|:---|:---|
| [**System Architecture & Lifecycle**](ARCHITECTURE_AND_LIFECYCLE.md) | High-level system design, bootstrap sequence, splash screen, hybrid Python-to-Web IPC bridge, and reactive state sync. |
| [**Backend Services & Methods Reference**](SERVICES_AND_METHODS.md) | Complete API reference for all core services: `EditingService`, `LibraryService`, `ExportService`, `PresetService`, `ProjectService`, `KuroAIService`, and `PyBridge`. |
| [**Image Processing Pipeline**](IMAGE_PROCESSING_PIPELINE.md) | 32-bit float `ImageBuffer`, DAG processing graph, 3-way color grading, 3D LUT trilinear evaluation, lens distortion correction, RAW decoding, and ICC sRGB color management. |
| [**Presets Catalog & Reference**](PRESETS_REFERENCE.md) | Comprehensive catalog of all 54 built-in style recipes (Film, Portrait, Cinematic, Landscape, Urban, Monochrome), parameter schema, and custom recipe persistence. |
| [**Kuro AI Assistant & Tool Registry**](AI_SYSTEM.md) | AI Assistant architecture, offline heuristic intent parsing, function calling schema, cloud LLM providers (Gemini, OpenAI, Anthropic), and parameter proposal workflows. |
| [**Frontend Workspaces & UI Components**](FRONTEND_AND_WORKSPACES.md) | Frontend architecture, workspace modes (Gallery, Lightbox, Color Studio, Deliver, Visual Flow), custom components, dynamic CSS variable accent theming, and keyboard shortcuts. |
| [**Developer Guide & CLI Reference**](DEVELOPER_AND_CLI_GUIDE.md) | Installation, running in development vs production mode, SQLite schema & WAL persistence, running the test suite, and packaging for distribution. |

---

## 2. Engineering Playbooks & Roadmap

| Document | Description |
|:---|:---|
| [**Engineering Playbook**](ENGINEERING_PLAYBOOK.md) | Product direction, engineering practices, incremental verification standards, and architecture guardrails. |
| [**Feature Parity Tracker**](FEATURE_PARITY.md) | Detailed parity matrix against benchmark professional desktop photo applications across Library, Develop, Color, and Deliver workspaces. |
| [**KuroLight Architecture Guide**](KUROLIGHT_ARCHITECTURE_GUIDE.md) | Comprehensive architectural blueprint, component boundaries, data model, and engineering patterns. |

---

## 3. Architecture Policies & Standards

| Document | Description |
|:---|:---|
| [**Metadata & Sidecar Policy**](METADATA_POLICY.md) | Rules for EXIF/IPTC extraction, XMP sidecar synchronization, conflict resolution, and non-destructive image preservation. |
| [**Desktop Platform Support Policy**](PLATFORM_SUPPORT.md) | Platform compatibility standards across Windows (WebView2), macOS (WebKit), and Linux (WebKitGTK), path normalization, and credential keychain backends. |
| [**GPU Acceleration Policy**](GPU_ACCELERATION_POLICY.md) | Benchmark-driven GPU acceleration discovery, graceful CPU fallback, and out-of-memory tolerance. |
| [**Local AI Model Scope**](LOCAL_AI_MODEL_SCOPE.md) | Licensing, consent, architectural footprint, and execution boundaries for local vs cloud machine learning models. |
| [**AI Audit, Privacy & Settings Contract**](AI_AUDIT_AND_SETTINGS_CONTRACT.md) | Audit of AI assistant endpoints, telemetry boundaries, privacy disclosure dialogs, and settings schema. |

---

## 4. Technical Audits & Evaluations

| Document | Description |
|:---|:---|
| [**Library Scaling & Recovery Audit**](LIBRARY_SCALING_AUDIT.md) | Benchmark analysis for 10,000+ photo catalogs, thumbnail cache invalidation, SQLite WAL performance, and index tuning. |
| [**Export Behavior Audit**](EXPORT_AUDIT.md) | Color management validation, sRGB profile embedding, watermark positioning, format transcoding, and thread scaling. |
| [**RAW & Codec Support Inventory**](RAW_SUPPORT.md) | Camera RAW format compatibility matrix (`rawpy` / LibRaw vs Pillow raster fallback) and decoder benchmarks. |
| [**Enhancement Model Evaluation**](ENHANCEMENT_EVALUATION.md) | Architectural criteria, memory requirements, and visual quality evaluation for super-resolution and tone enhancement models. |
| [**Print, PDF & Slideshow Evaluation**](PRINT_AND_PRESENTATION_EVALUATION.md) | Architectural specifications for multi-up contact sheets, print-ready PDF generation, and fullscreen presentation playback. |
