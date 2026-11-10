#!/usr/bin/env python3
"""Builds the complete Inno Setup installer for KuroLight.

Prerequisites:
- Inno Setup 6 or 7 installed (ISCC compiler).
- Python 3.10+ with PyInstaller.
- Node.js and npm for frontend assets.

Workflow:
1. Verifies/Builds dist/KuroLight bundle via build_exe.py.
2. Locates Inno Setup command-line compiler (ISCC.exe).
3. Compiles scripts/kurolight_setup.iss.
4. Generates dist/installer/KuroLight_Setup_v1.0.0.exe.
"""

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


def find_iscc() -> Path:
    """Locate Inno Setup compiler executable."""
    # 1. Check PATH
    which_path = shutil.which("ISCC") or shutil.which("ISCC.exe")
    if which_path:
        return Path(which_path)

    # 2. Check standard Windows installation directories
    candidates = [
        Path(r"C:\Program Files\Inno Setup 7\ISCC.exe"),
        Path(r"C:\Program Files (x86)\Inno Setup 7\ISCC.exe"),
        Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
        Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
        Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Inno Setup 7" / "ISCC.exe",
    ]

    for cand in candidates:
        if cand.is_file():
            return cand

    raise FileNotFoundError(
        "Inno Setup Compiler (ISCC.exe) not found.\n"
        "Please install Inno Setup 7 from https://jrsoftware.org/isdl.php "
        "and ensure it is added to your PATH."
    )


def ensure_executable_bundle():
    """Ensure dist/KuroLight.exe or dist/KuroLight/KuroLight.exe is built and up to date."""
    exe_onefile = DIST_DIR / ("KuroLight.exe" if sys.platform == "win32" else "KuroLight")
    exe_onedir = DIST_DIR / "KuroLight" / ("KuroLight.exe" if sys.platform == "win32" else "KuroLight")
    if not exe_onefile.exists() and not exe_onedir.exists():
        print("[1/2] Standalone executable not found. Building executable first...")
        build_exe_script = SCRIPTS_DIR / "build_exe.py"
        res = subprocess.run([sys.executable, str(build_exe_script)], cwd=ROOT_DIR)
        if res.returncode != 0:
            raise RuntimeError("Executable build failed.")
    else:
        found = exe_onefile if exe_onefile.exists() else exe_onedir
        print(f"[1/2] Standalone executable found: {found}")


def compile_inno_setup(iscc_path: Path):
    """Compile Inno Setup script."""
    print(f"[2/2] Compiling Inno Setup installer using: {iscc_path}...")
    INSTALLER_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [str(iscc_path), str(ISS_PATH)]
    res = subprocess.run(cmd, cwd=SCRIPTS_DIR)
    if res.returncode != 0:
        raise RuntimeError("Inno Setup compilation failed.")

    installer_exe = INSTALLER_DIR / "KuroLight_Setup_v1.0.0.exe"
    if not installer_exe.exists():
        # Check any .exe in INSTALLER_DIR
        exes = list(INSTALLER_DIR.glob("*.exe"))
        if exes:
            installer_exe = exes[0]
        else:
            raise FileNotFoundError(f"Expected setup installer not found in {INSTALLER_DIR}")

    size_mb = installer_exe.stat().st_size / (1024 * 1024)
    print("\n" + "=" * 60)
    print("SUCCESS: KuroLight Windows Installer Ready!")
    print(f"  Installer: {installer_exe}")
    print(f"  Size:      {size_mb:.2f} MB")
    print("=" * 60 + "\n")


def main():
    try:
        iscc = find_iscc()
        ensure_executable_bundle()
        compile_inno_setup(iscc)
    except Exception as exc:
        print(f"\nERROR: Installer creation failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
