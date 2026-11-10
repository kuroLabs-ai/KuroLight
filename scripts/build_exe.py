#!/usr/bin/env python3
"""Automated build script for KuroLight desktop application.

Steps:
1. Compiles React frontend to web/dist via Vite.
2. Ensures multi-resolution app.ico exists from KuroLight-combined_vertical.png.
3. Invokes PyInstaller to build standalone distribution in dist/KuroLight/.
4. Verifies the output executable.
"""

import os
import shutil
import subprocess
import sys
from pathlib import Path
from PIL import Image

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"
WEB_DIR = ROOT_DIR / "web"
ASSETS_DIR = ROOT_DIR / "assets" / "icons"


def ensure_app_icon():
    """Generate multi-resolution app.ico from KuroLight-combined_vertical.png."""
    src_icon = ASSETS_DIR / "KuroLight-combined_vertical.png"
    if not src_icon.exists():
        src_icon = ASSETS_DIR / "logo.png"

    ico_path = ASSETS_DIR / "app.ico"
    print(f"[1/4] Generating application icon from {src_icon.name}...")

    with Image.open(src_icon) as img:
        img = img.convert("RGBA")
        w, h = img.size
        side = max(w, h)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(img, ((side - w) // 2, (side - h) // 2))

        sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
        square.save(ico_path, format="ICO", sizes=sizes)

    print(f"      Created: {ico_path} ({ico_path.stat().st_size:,} bytes)")


def build_frontend():
    """Compile React 19 / TypeScript / Vite frontend into web/dist."""
    print("[2/4] Compiling React frontend...")
    npm_cmd = "npm.cmd" if sys.platform == "win32" else "npm"

    # Verify npm is installed
    if not shutil.which(npm_cmd):
        raise RuntimeError(f"Could not find '{npm_cmd}'. Please install Node.js and npm.")

    res = subprocess.run([npm_cmd, "--prefix", str(WEB_DIR), "run", "build"], cwd=ROOT_DIR, shell=(sys.platform == "win32"))
    if res.returncode != 0:
        raise RuntimeError("Frontend build failed. Please check TypeScript and Vite errors above.")

    index_html = WEB_DIR / "dist" / "index.html"
    if not index_html.exists():
        raise FileNotFoundError(f"Expected build output not found: {index_html}")

    print("      Frontend build complete (web/dist ready).")


def build_executable():
    """Run PyInstaller with kurolight.spec."""
    print("[3/4] Running PyInstaller packaging...")
    spec_file = ROOT_DIR / "scripts" / "kurolight.spec"

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        str(spec_file),
    ]

    res = subprocess.run(cmd, cwd=ROOT_DIR)
    if res.returncode != 0:
        raise RuntimeError("PyInstaller build failed.")

    exe_onefile = DIST_DIR / ("KuroLight.exe" if sys.platform == "win32" else "KuroLight")
    exe_onedir = DIST_DIR / "KuroLight" / ("KuroLight.exe" if sys.platform == "win32" else "KuroLight")
    if not exe_onefile.exists() and not exe_onedir.exists():
        raise FileNotFoundError(f"Expected executable not found at {exe_onefile} or {exe_onedir}")

    target_exe = exe_onefile if exe_onefile.exists() else exe_onedir
    print(f"      Executable generated: {target_exe}")


def verify_build():
    """Verify built executable and assets."""
    print("[4/4] Verifying distribution bundle...")
    exe_onefile = DIST_DIR / ("KuroLight.exe" if sys.platform == "win32" else "KuroLight")
    bundle_dir = DIST_DIR / "KuroLight"
    exe_onedir = bundle_dir / ("KuroLight.exe" if sys.platform == "win32" else "KuroLight")

    if exe_onefile.exists():
        size_mb = exe_onefile.stat().st_size / (1024 * 1024)
        print(f"\nSUCCESS: KuroLight standalone onefile executable ready!")
        print(f"  Binary: {exe_onefile}")
        print(f"  Size:   {size_mb:.1f} MB\n")
    elif exe_onedir.exists():
        total_size = sum(f.stat().st_size for f in bundle_dir.rglob("*") if f.is_file())
        print(f"\nSUCCESS: KuroLight standalone folder bundle ready!")
        print(f"  Location: {bundle_dir}")
        print(f"  Binary:   {exe_onedir}")
        print(f"  Size:     {total_size / (1024 * 1024):.1f} MB\n")
    else:
        raise FileNotFoundError("Neither single-file nor directory bundle was found in dist/")


def main():
    try:
        ensure_app_icon()
        build_frontend()
        build_executable()
        verify_build()
    except Exception as exc:
        print(f"\nERROR: Build failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
