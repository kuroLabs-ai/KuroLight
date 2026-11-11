#!/usr/bin/env python3
"""Builds the complete Inno Setup installer for KuroLight Professional.

Features:
- Packages both OneFile standalone executable and OneFolder directory bundle into the installer.
- Gives the end-user the choice of which format to install via Inno Setup components.
- Configures professional app branding ("KuroLight Professional" desktop and start menu shortcuts).
- Sets up project file associations (.kurolight, .klproj) and App Paths registration.

Usage:
    python scripts/build_installer.py              # Verifies/builds both formats and builds installer
    python scripts/build_installer.py --rebuild    # Forces rebuild of both executable formats
    python scripts/build_installer.py --skip-build # Skips executable build, compiles .iss only
"""

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
DIST_DIR = ROOT_DIR / "dist"
INSTALLER_DIR = DIST_DIR / "installer"
ISS_PATH = SCRIPTS_DIR / "kurolight_setup.iss"

DIST_ONEFILE_EXE = DIST_DIR / "onefile" / "KuroLight.exe"
DIST_ONEFOLDER_DIR = DIST_DIR / "onefolder"
DIST_ONEFOLDER_EXE = DIST_ONEFOLDER_DIR / "KuroLight.exe"


def find_iscc() -> Path:
    """Locate Inno Setup compiler executable (ISCC.exe)."""
    # 1. Check PATH
    which_path = shutil.which("ISCC") or shutil.which("ISCC.exe")
    if which_path:
        return Path(which_path)

    # 2. Standard Windows installation paths
    candidates = [
        Path(r"C:\Program Files\Inno Setup 7\ISCC.exe"),
        Path(r"C:\Program Files (x86)\Inno Setup 7\ISCC.exe"),
        Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
        Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 7" / "ISCC.exe",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 6" / "ISCC.exe",
    ]

    for cand in candidates:
        if cand.is_file():
            return cand

    raise FileNotFoundError(
        "Inno Setup Compiler (ISCC.exe) not found.\n"
        "Please install Inno Setup 6 or 7 from https://jrsoftware.org/isdl.php "
        "and ensure it is added to your PATH or installed in Program Files."
    )


def ensure_executable_bundles(force_rebuild: bool = False):
    """Ensure both OneFile and OneFolder distributions are built."""
    # Check fallback root locations as well
    root_onefile = DIST_DIR / "KuroLight.exe"
    root_onefolder = DIST_DIR / "KuroLight"

    has_onefile = DIST_ONEFILE_EXE.exists() or root_onefile.exists()
    has_onefolder = DIST_ONEFOLDER_EXE.exists() or (root_onefolder.exists() and (root_onefolder / "KuroLight.exe").exists())

    if force_rebuild or not (has_onefile and has_onefolder):
        print("[1/2] Building application packages (both OneFile & OneFolder)...")
        build_exe_script = SCRIPTS_DIR / "build_exe.py"
        cmd = [sys.executable, str(build_exe_script), "--mode", "both"]
        res = subprocess.run(cmd, cwd=ROOT_DIR)
        if res.returncode != 0:
            raise RuntimeError("Executable build failed during installer preparation.")
    else:
        print("[1/2] Application packages verified:")
        print(f"      - OneFile:   {DIST_ONEFILE_EXE if DIST_ONEFILE_EXE.exists() else root_onefile}")
        print(f"      - OneFolder: {DIST_ONEFOLDER_DIR if DIST_ONEFOLDER_DIR.exists() else root_onefolder}")


def compile_inno_setup(iscc_path: Path):
    """Compile Inno Setup script."""
    print(f"[2/2] Compiling Inno Setup installer via: {iscc_path}...")
    INSTALLER_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [str(iscc_path), str(ISS_PATH)]
    res = subprocess.run(cmd, cwd=SCRIPTS_DIR)
    if res.returncode != 0:
        raise RuntimeError("Inno Setup compilation failed.")

    # Locate generated installer
    expected_installer = INSTALLER_DIR / "KuroLight_Professional_Setup_v1.0.0.exe"
    if not expected_installer.exists():
        exes = sorted(INSTALLER_DIR.glob("*.exe"), key=lambda p: p.stat().st_mtime, reverse=True)
        if exes:
            expected_installer = exes[0]
        else:
            raise FileNotFoundError(f"Expected setup installer not found in {INSTALLER_DIR}")

    size_mb = expected_installer.stat().st_size / (1024 * 1024)
    print("\n" + "=" * 65)
    print(" SUCCESS: KuroLight Professional Installer Ready!")
    print("=" * 65)
    print(f"  Installer:  {expected_installer}")
    print(f"  Size:       {size_mb:.2f} MB")
    print(f"  Modes:      Choice of 'OneFile' or 'OneFolder' in setup wizard")
    print(f"  Shortcuts:  'KuroLight Professional' on Desktop & Start Menu")
    print("=" * 65 + "\n")


def parse_args():
    parser = argparse.ArgumentParser(description="Build Inno Setup installer for KuroLight Professional")
    parser.add_argument(
        "--rebuild",
        action="store_true",
        help="Force rebuilding both OneFile and OneFolder distributions before running Inno Setup",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip checking/building binaries and only run ISCC compiler on the existing dist/ files",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        iscc = find_iscc()
        if not args.skip_build:
            ensure_executable_bundles(force_rebuild=args.rebuild)
        compile_inno_setup(iscc)
    except Exception as exc:
        print(f"\nERROR: Installer creation failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
