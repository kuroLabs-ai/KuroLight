# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller specification file for KuroLight Desktop Application.

Optimized for:
1. Single standalone .exe (onefile mode).
2. Minimal size by strictly excluding unused massive Qt modules (QtWebEngine, QtQml, QtQuick, Qt3D).
3. NumPy 2.x full c-extension hook collection.
"""

import os
import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_all

PROJECT_ROOT = Path(os.path.abspath(SPECPATH)).parent

# Collect full NumPy 2.x data, binaries, and hidden imports (fixes numpy._core._exceptions)
numpy_datas, numpy_binaries, numpy_hidden = collect_all("numpy")

# Core hidden imports
hidden_imports = [
    # Essential PySide6 modules only
    "PySide6.QtCore",
    "PySide6.QtGui",
    "PySide6.QtWidgets",
    # pywebview Windows backends
    "webview.platforms.winforms",
    "webview.platforms.edgechromium",
    "clr",
    # Data & Image processing
    "sqlite3",
    "pydantic",
    "PIL",
    "PIL.Image",
    "PIL.ImageCms",
    "PIL.ImageOps",
    "keyring",
    "keyring.backends.Windows",
    "httpx",
    "platformdirs",
    # Packaging / keyring dependencies
    "jaraco.text",
    "jaraco.functools",
    "jaraco.context",
    "more_itertools",
    "pkg_resources",
] + numpy_hidden + collect_submodules("kurolight")

# Bundled data files
datas = [
    (str(PROJECT_ROOT / "web" / "dist"), "web/dist"),
    (str(PROJECT_ROOT / "assets" / "icons"), "assets/icons"),
] + numpy_datas

binaries = numpy_binaries

# Strict exclusion list to drastically shrink PySide6 bundle size (drops ~600+ MB)
excludes = [
    # Massive unused Qt modules (KuroLight uses Edge WebView2 via pywebview, NOT QtWebEngine)
    "PySide6.QtWebEngineCore",
    "PySide6.QtWebEngineWidgets",
    "PySide6.QtWebEngineQuick",
    "PySide6.QtQml",
    "PySide6.QtQuick",
    "PySide6.QtQuickWidgets",
    "PySide6.Qt3DCore",
    "PySide6.Qt3DRender",
    "PySide6.Qt3DInput",
    "PySide6.Qt3DAnimation",
    "PySide6.Qt3DExtras",
    "PySide6.QtDesigner",
    "PySide6.QtMultimedia",
    "PySide6.QtMultimediaWidgets",
    "PySide6.QtSpatialAudio",
    "PySide6.QtBluetooth",
    "PySide6.QtNfc",
    "PySide6.QtSensors",
    "PySide6.QtSerialPort",
    "PySide6.QtPositioning",
    "PySide6.QtLocation",
    "PySide6.QtTest",
    "PySide6.QtPdf",
    "PySide6.QtPdfWidgets",
    "PySide6.QtVirtualKeyboard",
    "PySide6.QtCharts",
    "PySide6.QtScxml",
    "PySide6.QtRemoteObjects",
    "PySide6.QtNetworkAuth",
    # Unused developer/test modules
    "tkinter",
    "unittest",
    "pytest",
    "_pytest",
    "pyflakes",
    "IPython",
    "jupyter",
    "notebook",
    "pip",
    "wheel",
]

a = Analysis(
    [str(PROJECT_ROOT / "src" / "kurolight" / "run_gui.py")],
    pathex=[str(PROJECT_ROOT / "src"), str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

# ONEFILE executable: All dependencies, Python runtime, and web assets bundled into a single file
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="KuroLight",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,  # Windowed desktop application (no console window)
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(PROJECT_ROOT / "assets" / "icons" / "app.ico"),
)
