"""KuroLight Animated Splash Screen — Obsidian Dark design system.

A frameless, translucent-background splash screen that:
  - Displays the KuroLight brand identity (logo + wordmark + tagline)
  - Runs a smooth rotating arc spinner at 60 FPS via QPainter
  - Shows a segmented progress bar that fills as bootstrap stages complete
  - Surfaces human-readable stage messages in real-time
  - Fades out gracefully when initialization is done
"""

from __future__ import annotations

from pathlib import Path
from typing import Optional

from PySide6.QtCore import (
    QEasingCurve,
    QPropertyAnimation,
    QRectF,
    Qt,
    QTimer,
    Signal,
)
from PySide6.QtGui import (
    QColor,
    QFont,
    QLinearGradient,
    QPainter,
    QPainterPath,
    QPen,
    QPixmap,
)
from PySide6.QtWidgets import QApplication, QGraphicsOpacityEffect, QWidget


# ---------------------------------------------------------------------------
# Design tokens (mirror of Obsidian Dark palette)
# ---------------------------------------------------------------------------
_BG          = QColor(0x10, 0x11, 0x13)        # #101113  – main background
_SURFACE     = QColor(0x1A, 0x1C, 0x20)        # #1A1C20  – card surface
_ELEVATED    = QColor(0x22, 0x25, 0x2A)        # #22252A  – elevated surface
_BORDER      = QColor(0x35, 0x3A, 0x41)        # #353A41  – border
_BORDER_LT   = QColor(0x45, 0x4B, 0x54)        # #454B54  – lighter border
_TEXT_PRI    = QColor(0xF5, 0xF5, 0xF5)        # #F5F5F5  – primary text
_TEXT_SEC    = QColor(0xC0, 0xC4, 0xCA)        # #C0C4CA  – secondary text
_TEXT_MUT    = QColor(0x85, 0x8B, 0x94)        # #858B94  – muted text
_ACCENT_BLUE = QColor(0x00, 0x88, 0xFF)        # #0088FF  – deliver accent / progress

# Splash card dimensions
_W, _H = 560, 320
_CORNER = 16
_PAD    = 40


class SplashScreen(QWidget):
    """Animated KuroLight splash screen widget.

    Signals
    -------
    finished :
        Emitted after the fade-out animation completes – connect this to
        ``main_window.show()`` and ``self.close()``.
    """

    finished = Signal()

    # Boot stage definitions: (display label, cumulative progress 0-100)
    STAGES = [
        ("Initializing logging & configuration…",   8),
        ("Opening project vault…",                  28),
        ("Loading asset library…",                  48),
        ("Preparing editing engine…",               65),
        ("Preparing export service…",               80),
        ("Building interface…",                     94),
        ("Ready.",                                  100),
    ]

    def __init__(self, parent: Optional[QWidget] = None) -> None:
        super().__init__(parent)

        # ── Window chrome ──────────────────────────────────────────────────
        self.setWindowFlags(
            Qt.WindowType.FramelessWindowHint
            | Qt.WindowType.WindowStaysOnTopHint
            | Qt.WindowType.SplashScreen
        )
        self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground)
        self.setFixedSize(_W, _H)
        self._center_on_screen()

        # ── State ──────────────────────────────────────────────────────────
        self._spinner_angle: float = 0.0
        self._progress: float = 0.0           # 0.0 – 100.0
        self._target_progress: float = 0.0
        self._stage_text: str = "Initializing…"
        self._logo_pix: Optional[QPixmap] = self._load_logo()
        self._stage_index: int = 0

        # ── Spinner animation (60 fps) ─────────────────────────────────────
        self._spin_timer = QTimer(self)
        self._spin_timer.timeout.connect(self._tick)
        self._spin_timer.start(16)

        # ── Progress easing timer ──────────────────────────────────────────
        self._ease_timer = QTimer(self)
        self._ease_timer.timeout.connect(self._ease_progress)
        self._ease_timer.start(16)

        # ── Fade-in via opacity effect ─────────────────────────────────────
        self._opacity_effect = QGraphicsOpacityEffect(self)
        self._opacity_effect.setOpacity(0.0)
        self.setGraphicsEffect(self._opacity_effect)

        self._fade_in = QPropertyAnimation(self._opacity_effect, b"opacity", self)
        self._fade_in.setDuration(400)
        self._fade_in.setStartValue(0.0)
        self._fade_in.setEndValue(1.0)
        self._fade_in.setEasingCurve(QEasingCurve.Type.OutCubic)

        self._fade_out = QPropertyAnimation(self._opacity_effect, b"opacity", self)
        self._fade_out.setDuration(500)
        self._fade_out.setStartValue(1.0)
        self._fade_out.setEndValue(0.0)
        self._fade_out.setEasingCurve(QEasingCurve.Type.InCubic)
        self._fade_out.finished.connect(self.finished)

    # ── Public API ─────────────────────────────────────────────────────────

    def show(self) -> None:  # type: ignore[override]
        super().show()
        self._fade_in.start()

    def advance_stage(self, index: int) -> None:
        """Move progress to stage *index* (0-based).  Called by the boot worker."""
        if 0 <= index < len(self.STAGES):
            label, progress = self.STAGES[index]
            self._stage_text = label
            self._target_progress = float(progress)
            self._stage_index = index
            self.update()

    def finish(self) -> None:
        """Trigger fade-out; ``finished`` signal fires when animation ends."""
        self._stage_text = "Ready."
        self._target_progress = 100.0
        self._spin_timer.stop()
        self._ease_timer.stop()
        self._progress = 100.0
        self.update()
        QTimer.singleShot(380, self._fade_out.start)

    # ── Internal ───────────────────────────────────────────────────────────

    def _center_on_screen(self) -> None:
        screen = QApplication.primaryScreen()
        if screen:
            sg = screen.availableGeometry()
            self.move(
                sg.x() + (sg.width() - _W) // 2,
                sg.y() + (sg.height() - _H) // 2,
            )

    @staticmethod
    def _load_logo() -> Optional[QPixmap]:
        """Find logo.png by walking up from this file's directory."""
        for parent in Path(__file__).resolve().parents:
            cand = parent / "assets" / "icons" / "logo.png"
            if cand.exists():
                return QPixmap(str(cand))
        return None

    def _tick(self) -> None:
        self._spinner_angle = (self._spinner_angle + 4.5) % 360.0
        self.update()

    def _ease_progress(self) -> None:
        diff = self._target_progress - self._progress
        if abs(diff) < 0.1:
            self._progress = self._target_progress
        else:
            self._progress += diff * 0.12
        self.update()

    # ── Rendering ──────────────────────────────────────────────────────────

    def paintEvent(self, _event) -> None:  # noqa: N802
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setRenderHint(QPainter.RenderHint.TextAntialiasing)

        self._draw_card(painter)
        self._draw_logo_wordmark(painter)
        self._draw_divider(painter)
        self._draw_bottom_section(painter)

        painter.end()

    def _draw_card(self, p: QPainter) -> None:
        """Dark card with a very subtle radial highlight at top-left."""
        # Drop shadow (simulated via layered semi-transparent rects)
        for i in range(4, 0, -1):
            shadow = QColor(0, 0, 0, 25 * i)
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(shadow)
            p.drawRoundedRect(
                QRectF(i * 2, i * 2, _W - i * 2, _H - i * 2),
                _CORNER + i, _CORNER + i
            )

        # Main card body
        card = QRectF(0, 0, _W, _H)
        p.setBrush(_SURFACE)
        p.setPen(QPen(_BORDER, 1.0))
        p.drawRoundedRect(card, _CORNER, _CORNER)

        # Top-left radial glow (very subtle blue)
        glow = QLinearGradient(0, 0, _W * 0.6, _H * 0.4)
        glow.setColorAt(0.0, QColor(0, 136, 255, 10))
        glow.setColorAt(1.0, QColor(0, 136, 255, 0))
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(glow)
        p.drawRoundedRect(card, _CORNER, _CORNER)

    def _draw_logo_wordmark(self, p: QPainter) -> None:
        """Logo image (or ● fallback) + app name + tagline, centered vertically."""
        top_section_h = 190

        logo_size = 54
        logo_x = _PAD
        logo_y = (top_section_h - logo_size) // 2 - 10

        if self._logo_pix and not self._logo_pix.isNull():
            scaled = self._logo_pix.scaled(
                logo_size, logo_size,
                Qt.AspectRatioMode.KeepAspectRatio,
                Qt.TransformationMode.SmoothTransformation,
            )
            p.drawPixmap(logo_x, logo_y, scaled)
        else:
            # Fallback: rendered circle
            p.setBrush(_BORDER_LT)
            p.setPen(Qt.PenStyle.NoPen)
            p.drawEllipse(logo_x, logo_y, logo_size, logo_size)
            p.setPen(_TEXT_PRI)
            f = QFont("Segoe UI", 22, QFont.Weight.Bold)
            p.setFont(f)
            p.drawText(
                QRectF(logo_x, logo_y, logo_size, logo_size),
                Qt.AlignmentFlag.AlignCenter, "K"
            )

        # App name
        text_x = logo_x + logo_size + 18
        name_font = QFont("Segoe UI", 26, QFont.Weight.Bold)
        name_font.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 1.2)
        p.setFont(name_font)
        p.setPen(_TEXT_PRI)
        name_rect = QRectF(text_x, logo_y, _W - text_x - _PAD, 38)
        p.drawText(name_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter, "KuroLight")

        # Tagline
        tag_font = QFont("Segoe UI", 10)
        tag_font.setLetterSpacing(QFont.SpacingType.AbsoluteSpacing, 0.5)
        p.setFont(tag_font)
        p.setPen(_TEXT_MUT)
        tag_rect = QRectF(text_x, logo_y + 42, _W - text_x - _PAD, 20)
        p.drawText(tag_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                   "Intelligent Visual Creation  •  by KuroLabs")

        # Version badge
        badge_font = QFont("Segoe UI", 8)
        p.setFont(badge_font)
        p.setPen(QColor(0x45, 0x4B, 0x54))
        ver_rect = QRectF(_W - _PAD - 60, logo_y, 60, 20)
        p.drawText(ver_rect, Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignTop, "v1.1.1")

    def _draw_divider(self, p: QPainter) -> None:
        """Thin 1px horizontal separator between brand and progress zone."""
        y = 142
        pen = QPen(_BORDER, 1)
        p.setPen(pen)
        p.drawLine(_PAD, y, _W - _PAD, y)

    def _draw_bottom_section(self, p: QPainter) -> None:
        """Progress bar + spinner + stage label."""
        section_top = 158
        bar_y       = section_top + 20
        bar_x       = _PAD + 42        # leave room for spinner on the left
        bar_w       = _W - _PAD - bar_x - _PAD // 2
        bar_h       = 4

        # ── Spinner ────────────────────────────────────────────────────────
        cx = _PAD + 16
        cy = bar_y + bar_h // 2
        r  = 11

        # Track ring
        track_pen = QPen(QColor(0x22, 0x25, 0x2A), 2.5)
        track_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(track_pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawEllipse(QRectF(cx - r, cy - r, r * 2, r * 2))

        # Spinning arc
        arc_pen = QPen(_ACCENT_BLUE, 2.5)
        arc_pen.setCapStyle(Qt.PenCapStyle.RoundCap)
        p.setPen(arc_pen)
        start_angle = int((90 - self._spinner_angle) * 16)
        span_angle  = -270 * 16
        p.drawArc(QRectF(cx - r, cy - r, r * 2, r * 2), start_angle, span_angle)

        # ── Progress bar track ─────────────────────────────────────────────
        track_path = QPainterPath()
        track_path.addRoundedRect(QRectF(bar_x, bar_y - 1, bar_w, bar_h + 2), 2, 2)
        p.setPen(Qt.PenStyle.NoPen)
        p.setBrush(QColor(0x22, 0x25, 0x2A))
        p.drawPath(track_path)

        # ── Progress fill ──────────────────────────────────────────────────
        fill_w = max(0.0, bar_w * (self._progress / 100.0))
        if fill_w > 0:
            fill_grad = QLinearGradient(bar_x, 0, bar_x + fill_w, 0)
            fill_grad.setColorAt(0.0, QColor(0x00, 0x66, 0xCC))
            fill_grad.setColorAt(1.0, _ACCENT_BLUE)
            fill_path = QPainterPath()
            fill_path.addRoundedRect(QRectF(bar_x, bar_y - 1, fill_w, bar_h + 2), 2, 2)
            p.setBrush(fill_grad)
            p.drawPath(fill_path)

        # ── Percentage label ───────────────────────────────────────────────
        pct_font = QFont("Segoe UI", 8, QFont.Weight.Medium)
        p.setFont(pct_font)
        p.setPen(_TEXT_MUT)
        pct_text = f"{int(self._progress)}%"
        pct_rect = QRectF(bar_x + bar_w + 6, bar_y - 8, 32, 20)
        p.drawText(pct_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter, pct_text)

        # ── Stage label ────────────────────────────────────────────────────
        label_font = QFont("Segoe UI", 9)
        p.setFont(label_font)
        p.setPen(_TEXT_SEC)
        label_rect = QRectF(bar_x, bar_y + 14, bar_w + 40, 20)
        p.drawText(label_rect, Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter,
                   self._stage_text)

        # ── Stage dots (mini progress indicators) ─────────────────────────
        n = len(self.STAGES)
        dot_y = _H - 28
        total_dots_w = n * 6 + (n - 1) * 5
        dot_x_start = (_W - total_dots_w) // 2

        for i in range(n):
            dot_x = dot_x_start + i * 11
            if i < self._stage_index:
                color = _ACCENT_BLUE
                dot_r = 3
            elif i == self._stage_index:
                color = _TEXT_SEC
                dot_r = 3
            else:
                color = QColor(0x35, 0x3A, 0x41)
                dot_r = 2

            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(color)
            p.drawEllipse(dot_x - dot_r, dot_y - dot_r, dot_r * 2, dot_r * 2)

        # ── Copyright footer ───────────────────────────────────────────────
        footer_font = QFont("Segoe UI", 8)
        p.setFont(footer_font)
        p.setPen(QColor(0x45, 0x4B, 0x54))
        footer_rect = QRectF(_PAD, _H - 22, _W - _PAD * 2, 16)
        p.drawText(footer_rect,
                   Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter,
                   "© 2026 KuroLabs. All rights reserved.")
