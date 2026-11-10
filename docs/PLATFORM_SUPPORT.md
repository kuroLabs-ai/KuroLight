# Desktop Platform Support and Testing Policy

This document establishes the verified platform matrix, prerequisite runtime components,
and testing protocols required before making platform-support claims for KuroLight.

---

## 1. Platform Support Principle

> **Core Policy**: KuroLight never claims support for an operating system, architecture,
> or display server until that platform passes the automated test suite and manual verification.

---

## 2. Desktop Platform Support Matrix

| Platform | Tier | Primary Webview Engine | Keyring Backend | Neural Acceleration | Test Status |
|---|---|---|---|---|---|
| **Windows 10/11 (x86_64)** | Tier 1 (Primary) | Microsoft Edge WebView2 | Windows Credential Manager | DirectML / CUDA / CPU | **Verified & Tested** |
| **Windows 11 (ARM64)** | Tier 2 | Microsoft Edge WebView2 (ARM64) | Windows Credential Manager | DirectML / CPU | **Tested in Emulation / Preview** |
| **macOS 12+ (Apple Silicon)** | Tier 2 | Apple WebKit (WKWebView) | macOS Keychain Services | CoreML / MPS / CPU | **Tested (POSIX & Path Matrix)** |
| **macOS 12+ (Intel x86_64)** | Tier 2 | Apple WebKit (WKWebView) | macOS Keychain Services | CPU fallback | **Tested (POSIX & Path Matrix)** |
| **Linux (x86_64 Ubuntu / Fedora)** | Tier 2 | WebKitGTK (via pywebview) | SecretService / KWallet / In-Memory | CUDA / ROCm / CPU | **Tested (POSIX & Path Matrix)** |

---

## 3. Platform Subsystem Requirements

### 1. Windowing and Webview Runtimes
- **Windows**: PySide6 splash + pywebview backed by `mshtml` or Evergreen `Edge WebView2` runtime.
- **macOS**: PySide6 + pywebview backed by macOS Cocoa WebKit (`WKWebView`).
- **Linux**: PySide6 + pywebview backed by `libwebkit2gtk-4.0` or `libwebkit2gtk-4.1`.
  - Display server compatibility: X11 and Wayland (via XWayland or native Qt Wayland).

### 2. Secure Credential Storage (`keyring`)
External AI provider API keys (Gemini, OpenAI, Anthropic) are isolated in operating system credential managers:
- **Windows**: `keyring.backends.Windows.WinVaultKeyring` (Windows Credential Locker).
- **macOS**: `keyring.backends.macOS.Keyring` (macOS Keychain Services).
- **Linux**: `keyring.backends.SecretService.Keyring` (GNOME Keyring) or `KWallet`.
  - **Headless / Containerized Fallback**: If running in a headless CI environment without DBus/X11,
    `PlatformCompatibility.verify_keyring_backend()` reports the fallback diagnostic, preventing
    unhandled crashes.

### 3. File Paths and Filesystem Semantics
- **Path Normalization**: Windows drive letters (e.g. `C:\`), mixed slash conversion, and UNC path
  support (`\\server\share`) are normalized by `PlatformCompatibility.normalize_path()`.
- **Directory Traversal Defense**: `PlatformCompatibility.is_path_safe()` strictly verifies that
  imported files or exported deliverables do not escape intended directories via `..` traversal.
- **Data & Cache Directories**: Canonical paths are resolved via `PlatformCompatibility.get_data_directory_for_platform()`:
  - Windows: `%LOCALAPPDATA%\KuroLight`
  - macOS: `~/Library/Application Support/KuroLight`
  - Linux: `~/.local/share/kurolight` (or `$XDG_DATA_HOME/kurolight`)

### 4. Hardware Inference Execution Providers
- Windows builds specify `onnxruntime-directml` in `pyproject.toml` for hardware-agnostic DirectX 12
  GPU acceleration across AMD, Intel, and NVIDIA GPUs.
- Non-Windows environments default to standard `onnxruntime` or CUDA with seamless fallback to CPU.

---

## 4. Verification and Regression Testing

All platforms must pass:
1. `tests/test_platform_compatibility.py`: Path normalization, traversal guards, platform detection,
   and keyring backend diagnostics.
2. `tests/test_ai_settings.py`: Keyring credential isolation.
3. `tests/test_library_import.py`: Filesystem path handling, duplicate detection, and nested directory scanning.
4. Python package builds and headless execution via `python -m kurolight --list-commands`.
