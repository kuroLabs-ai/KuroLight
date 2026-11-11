"""KuroLight GUI entry point.

Launches the animated splash screen, runs the backend bootstrap on a worker
thread, then transitions into the main application window.

Usage
-----
    python -m kurolight.run_gui
    # or via pyproject.toml script:
    kurolight-gui
"""

from __future__ import annotations

import sys
from PySide6.QtGui import QColor, QFont, QIcon, QPalette
from PySide6.QtWidgets import QApplication, QMessageBox
from kurolight.config.defaults import get_app_icon_path


def _apply_obsidian_palette(app: QApplication) -> None:
    """Apply the Obsidian Dark system palette to the QApplication."""
    app.setStyle("Fusion")

    palette = QPalette()
    bg      = QColor(0x10, 0x11, 0x13)
    surface = QColor(0x1A, 0x1C, 0x20)
    elev    = QColor(0x22, 0x25, 0x2A)
    text    = QColor(0xF5, 0xF5, 0xF5)
    muted   = QColor(0x85, 0x8B, 0x94)
    border  = QColor(0x35, 0x3A, 0x41)
    accent  = QColor(0x00, 0x88, 0xFF)

    palette.setColor(QPalette.ColorRole.Window,          bg)
    palette.setColor(QPalette.ColorRole.WindowText,      text)
    palette.setColor(QPalette.ColorRole.Base,            surface)
    palette.setColor(QPalette.ColorRole.AlternateBase,   elev)
    palette.setColor(QPalette.ColorRole.ToolTipBase,     elev)
    palette.setColor(QPalette.ColorRole.ToolTipText,     text)
    palette.setColor(QPalette.ColorRole.Text,            text)
    palette.setColor(QPalette.ColorRole.Button,          elev)
    palette.setColor(QPalette.ColorRole.ButtonText,      text)
    palette.setColor(QPalette.ColorRole.BrightText,      text)
    palette.setColor(QPalette.ColorRole.Link,            accent)
    palette.setColor(QPalette.ColorRole.Highlight,       accent)
    palette.setColor(QPalette.ColorRole.HighlightedText, QColor(0xFF, 0xFF, 0xFF))
    palette.setColor(QPalette.ColorRole.PlaceholderText, muted)
    palette.setColor(QPalette.ColorRole.Mid,             border)
    palette.setColor(QPalette.ColorRole.Dark,            bg)
    palette.setColor(QPalette.ColorRole.Shadow,          QColor(0, 0, 0))

    # Disabled group
    palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.WindowText, muted)
    palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.Text,       muted)
    palette.setColor(QPalette.ColorGroup.Disabled, QPalette.ColorRole.ButtonText, muted)

    app.setPalette(palette)
    app.setFont(QFont("Segoe UI", 10))


def run() -> int:
    """Run the PySide6 splash screen, then the pywebview application."""

    # Prevent white flash before the dark window loads
    app = QApplication.instance() or QApplication(sys.argv)
    _apply_obsidian_palette(app)
    app.setApplicationName("KuroLight")
    app.setOrganizationName("KuroLabs")
    app.setApplicationVersion("1.0.0")
    icon_path = get_app_icon_path()
    if icon_path.exists():
        app.setWindowIcon(QIcon(str(icon_path)))

    # ── Splash screen ──────────────────────────────────────────────────────
    from kurolight.ui.splash_screen import SplashScreen
    splash = SplashScreen()
    splash.show()
    app.processEvents()          # ensure the splash renders before blocking work

    # ── Bootstrap worker ───────────────────────────────────────────────────
    from kurolight.app.bootstrap_worker import BootstrapWorker
    worker = BootstrapWorker()

    main_window = None
    startup_error = False

    def _on_stage(index: int) -> None:
        splash.advance_stage(index)
        app.processEvents()

    def _on_ready(services: dict) -> None:
        nonlocal main_window

        # Stage 6 shown briefly, then transition
        splash.advance_stage(6)
        app.processEvents()

        # Prepare the pywebview window while the splash is still visible.
        try:
            from kurolight.ui.web_window import WebWindow

            dev_url = "http://localhost:5173" if "--dev" in sys.argv else None
            main_window = WebWindow(
                app_state=services["app_state"],
                project_service=services["project_service"],
                library_service=services["library_service"],
                editing_service=services["editing_service"],
                command_dispatcher=services["command_dispatcher"],
                preset_service=services["preset_service"],
                export_service=services["export_service"],
                dev_url=dev_url,
            )
        except Exception as exc:
            _on_error(str(exc))
            return

        # Fade splash → show main window in one smooth sequence
        def _show_main() -> None:
            splash.close()
            app.quit()

        splash.finished.connect(_show_main)
        splash.finish()

    def _on_error(message: str) -> None:
        nonlocal startup_error
        startup_error = True
        splash.close()
        QMessageBox.critical(
            None,
            "KuroLight — Startup Error",
            f"Failed to initialise the application:\n\n{message}\n\n"
            "Please check your installation and try again.",
        )
        app.quit()

    worker.stage_changed.connect(_on_stage)
    worker.services_ready.connect(_on_ready)
    worker.error_occurred.connect(_on_error)
    worker.start()

    result = app.exec()
    if startup_error or main_window is None:
        return result

    try:
        main_window.start(debug="--dev" in sys.argv)
    except Exception as exc:
        QMessageBox.critical(
            None,
            "KuroLight — Startup Error",
            f"Failed to start the webview:\n\n{exc}\n\n"
            "Please install Microsoft Edge WebView2 Runtime and try again.",
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(run())
