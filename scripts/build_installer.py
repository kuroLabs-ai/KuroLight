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
import re
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ROOT_DIR / "scripts"
DIST_DIR = ROOT_DIR / "dist"
INSTALLER_DIR = DIST_DIR / "installer"
INSTALLER_ASSETS_DIR = DIST_DIR / "installer-assets"
ISS_PATH = SCRIPTS_DIR / "kurolight_setup.iss"


def read_app_version() -> str:
    """Read the numeric application version from project metadata."""
    project_metadata = (ROOT_DIR / "pyproject.toml").read_text(encoding="utf-8")
    match = re.search(r'(?m)^version\s*=\s*"(\d+\.\d+\.\d+)"\s*$', project_metadata)
    if match is None:
        raise ValueError("pyproject.toml must define a numeric MAJOR.MINOR.PATCH version.")
    return match.group(1)


APP_VERSION = read_app_version()


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


def verify_executable_bundles(dist_dir: Path = DIST_DIR) -> tuple[Path, Path]:
    """Validate the normalized one-file and one-folder build outputs."""
    onefile_exe = dist_dir / "onefile" / "KuroLight.exe"
    onefolder_exe = dist_dir / "onefolder" / "KuroLight.exe"
    missing = [path for path in (onefile_exe, onefolder_exe) if not path.is_file()]
    if missing:
        paths = "\n".join(f"  - {path}" for path in missing)
        raise FileNotFoundError(
            "Required application bundles are missing. Build both targets first:\n" + paths
        )
    return onefile_exe, onefolder_exe


def ensure_executable_bundles(force_rebuild: bool = False) -> tuple[Path, Path]:
    """Ensure both normalized OneFile and OneFolder distributions are built."""
    try:
        bundles = verify_executable_bundles()
    except FileNotFoundError:
        bundles = None

    if force_rebuild or bundles is None:
        print("[1/2] Building application packages (both OneFile & OneFolder)...")
        build_exe_script = SCRIPTS_DIR / "build_exe.py"
        cmd = [sys.executable, str(build_exe_script), "--mode", "both"]
        res = subprocess.run(cmd, check=False, cwd=ROOT_DIR)
        if res.returncode != 0:
            raise RuntimeError("Executable build failed during installer preparation.")
        bundles = verify_executable_bundles()
    else:
        print("[1/2] Application packages verified:")
        print(f"      - OneFile:   {bundles[0]}")
        print(f"      - OneFolder: {bundles[1].parent}")
    return bundles


def ensure_installer_artwork(output_dir: Path = INSTALLER_ASSETS_DIR) -> tuple[Path, Path]:
    """Create branded Inno Setup wizard bitmaps from the shipped KuroLight logos."""
    output_dir.mkdir(parents=True, exist_ok=True)
    banner_path = output_dir / "kurolight-wizard.bmp"
    small_path = output_dir / "kurolight-wizard-small.bmp"
    icon_path = ROOT_DIR / "assets" / "icons" / "logo.png"
    wordmark_path = ROOT_DIR / "assets" / "icons" / "KuroLight-wordmark.png"

    for path in (icon_path, wordmark_path):
        if not path.is_file():
            raise FileNotFoundError(f"Required installer branding asset is missing: {path}")

    def make_background(size: tuple[int, int]) -> Image.Image:
        width, height = size
        background = Image.new("RGB", size)
        pixels = background.load()
        for y in range(height):
            vertical = y / max(1, height - 1)
            for x in range(width):
                horizontal = x / max(1, width - 1)
                pixels[x, y] = (
                    int(9 + 5 * vertical),
                    int(14 + 4 * vertical),
                    int(29 + 10 * vertical + 8 * horizontal),
                )

        glow = Image.new("RGBA", size, (0, 0, 0, 0))
        draw_glow = ImageDraw.Draw(glow)
        draw_glow.ellipse(
            (-width * 0.6, height * 0.08, width * 0.85, height * 0.72),
            fill=(0, 174, 255, 88),
        )
        draw_glow.ellipse(
            (width * 0.28, height * 0.2, width * 1.3, height * 0.86),
            fill=(177, 66, 255, 68),
        )
        glow = glow.filter(ImageFilter.GaussianBlur(max(8, width // 8)))
        return Image.alpha_composite(background.convert("RGBA"), glow)

    def alpha_crop(path: Path) -> Image.Image:
        image = Image.open(path).convert("RGBA")
        bounds = image.getchannel("A").getbbox()
        if bounds is None:
            raise ValueError(f"Branding image contains no visible pixels: {path}")
        return image.crop(bounds)

    banner = make_background((164, 314))
    icon = alpha_crop(icon_path)
    icon.thumbnail((122, 132), Image.Resampling.LANCZOS)
    banner.alpha_composite(icon, ((164 - icon.width) // 2, 55))

    wordmark = alpha_crop(wordmark_path)
    wordmark.thumbnail((142, 38), Image.Resampling.LANCZOS)
    banner.alpha_composite(wordmark, ((164 - wordmark.width) // 2, 203))

    draw = ImageDraw.Draw(banner)
    draw.rounded_rectangle((14, 14, 149, 299), radius=13, outline=(112, 145, 190, 90), width=1)
    for index in range(72):
        ratio = index / 71
        color = (int(0 + 74 * ratio), int(203 - 112 * ratio), int(255 - 4 * ratio), 230)
        draw.line((46 + index, 259, 46 + index, 261), fill=color)
    banner.convert("RGB").save(banner_path, format="BMP")

    small = make_background((55, 55))
    small_icon = alpha_crop(icon_path)
    small_icon.thumbnail((43, 43), Image.Resampling.LANCZOS)
    small.alpha_composite(
        small_icon,
        ((55 - small_icon.width) // 2, (55 - small_icon.height) // 2),
    )
    small.convert("RGB").save(small_path, format="BMP")
    return banner_path, small_path


def compile_inno_setup(iscc_path: Path) -> Path:
    """Compile Inno Setup script."""
    print(f"[2/2] Compiling Inno Setup installer via: {iscc_path}...")
    INSTALLER_DIR.mkdir(parents=True, exist_ok=True)

    cmd = [str(iscc_path), f"/DMyAppVersion={APP_VERSION}", str(ISS_PATH)]
    res = subprocess.run(cmd, check=False, cwd=SCRIPTS_DIR)
    if res.returncode != 0:
        raise RuntimeError("Inno Setup compilation failed.")

    expected_installer = INSTALLER_DIR / f"KuroLight-Setup-v{APP_VERSION}-x64.exe"
    if not expected_installer.is_file():
        raise FileNotFoundError(f"Expected setup installer not found: {expected_installer}")

    size_mb = expected_installer.stat().st_size / (1024 * 1024)
    print("\n" + "=" * 65)
    print(" SUCCESS: KuroLight Installer Ready!")
    print("=" * 65)
    print(f"  Installer:  {expected_installer}")
    print(f"  Size:       {size_mb:.2f} MB")
    print("  Modes:      Choice of 'OneFile' or 'OneFolder' in setup wizard")
    print("  Shortcuts:  KuroLight on Desktop & Start Menu")
    print("=" * 65 + "\n")
    return expected_installer


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
        help="Skip executable builds and compile existing dist/onefile and dist/onefolder bundles",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        iscc = find_iscc()
        if not args.skip_build:
            ensure_executable_bundles(force_rebuild=args.rebuild)
        else:
            verify_executable_bundles()
        ensure_installer_artwork()
        compile_inno_setup(iscc)
    except (FileNotFoundError, OSError, RuntimeError, subprocess.SubprocessError, ValueError) as exc:
        print(f"\nERROR: Installer creation failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
