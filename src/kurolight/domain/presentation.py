"""Domain models and layout computation engines for Print, Contact Sheets, and Slideshows."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class PaperSize(str, Enum):
    LETTER = "Letter"          # 8.5 x 11.0 in
    LEGAL = "Legal"            # 8.5 x 14.0 in
    A4 = "A4"                  # 210 x 297 mm (~8.27 x 11.69 in)
    A3 = "A3"                  # 297 x 420 mm (~11.69 x 16.54 in)
    PHOTO_4X6 = "4x6"          # 4.0 x 6.0 in
    PHOTO_5X7 = "5x7"          # 5.0 x 7.0 in
    PHOTO_8X10 = "8x10"        # 8.0 x 10.0 in


# Dimensions in inches (width, height) in portrait orientation
PAPER_DIMENSIONS_INCHES: dict[PaperSize, tuple[float, float]] = {
    PaperSize.LETTER: (8.5, 11.0),
    PaperSize.LEGAL: (8.5, 14.0),
    PaperSize.A4: (8.2677, 11.6929),
    PaperSize.A3: (11.6929, 16.5354),
    PaperSize.PHOTO_4X6: (4.0, 6.0),
    PaperSize.PHOTO_5X7: (5.0, 7.0),
    PaperSize.PHOTO_8X10: (8.0, 10.0),
}


@dataclass(frozen=True)
class PageMargins:
    top: float = 0.5       # inches
    bottom: float = 0.5    # inches
    left: float = 0.5      # inches
    right: float = 0.5     # inches

    def __post_init__(self) -> None:
        if self.top < 0 or self.bottom < 0 or self.left < 0 or self.right < 0:
            raise ValueError("Margins must be non-negative.")


@dataclass(frozen=True)
class Rect:
    x: float
    y: float
    width: float
    height: float


# ---------------------------------------------------------------------------
# Feature 1: Print & PDF Layout Engine
# ---------------------------------------------------------------------------

@dataclass
class PrintLayoutSpec:
    paper_size: PaperSize = PaperSize.LETTER
    orientation: Literal["portrait", "landscape"] = "portrait"
    margins: PageMargins = field(default_factory=PageMargins)
    dpi: int = 300
    fill_mode: Literal["fit", "fill"] = "fit"
    stroke_width_pt: float = 0.0

    def __post_init__(self) -> None:
        if self.dpi not in {150, 300, 600}:
            raise ValueError(f"Unsupported DPI: {self.dpi}. Expected 150, 300, or 600.")
        if self.stroke_width_pt < 0:
            raise ValueError("Stroke width must be non-negative.")


class PrintLayoutCalculator:
    """Calculates printable canvas dimensions and image placement rectangles."""

    @staticmethod
    def get_page_pixel_dimensions(spec: PrintLayoutSpec) -> tuple[int, int]:
        base_w, base_h = PAPER_DIMENSIONS_INCHES[spec.paper_size]
        if spec.orientation == "landscape":
            base_w, base_h = base_h, base_w
        pixel_w = int(round(base_w * spec.dpi))
        pixel_h = int(round(base_h * spec.dpi))
        return pixel_w, pixel_h

    @staticmethod
    def get_printable_area_rect(spec: PrintLayoutSpec) -> Rect:
        page_w, page_h = PrintLayoutCalculator.get_page_pixel_dimensions(spec)
        margin_left_px = spec.margins.left * spec.dpi
        margin_top_px = spec.margins.top * spec.dpi
        margin_right_px = spec.margins.right * spec.dpi
        margin_bottom_px = spec.margins.bottom * spec.dpi

        usable_w = page_w - (margin_left_px + margin_right_px)
        usable_h = page_h - (margin_top_px + margin_bottom_px)
        if usable_w <= 0 or usable_h <= 0:
            raise ValueError("Margins exceed paper dimensions.")

        return Rect(x=margin_left_px, y=margin_top_px, width=usable_w, height=usable_h)

    @staticmethod
    def compute_image_placement(
        spec: PrintLayoutSpec,
        image_width: int,
        image_height: int,
    ) -> Rect:
        if image_width <= 0 or image_height <= 0:
            raise ValueError("Image dimensions must be positive.")

        area = PrintLayoutCalculator.get_printable_area_rect(spec)
        img_aspect = image_width / image_height
        area_aspect = area.width / area.height

        if spec.fill_mode == "fit":
            # Scale to fit completely inside area without cropping
            if img_aspect > area_aspect:
                target_w = area.width
                target_h = target_w / img_aspect
            else:
                target_h = area.height
                target_w = target_h * img_aspect
        else:
            # Scale to completely fill area (center-cropped)
            if img_aspect > area_aspect:
                target_h = area.height
                target_w = target_h * img_aspect
            else:
                target_w = area.width
                target_h = target_w / img_aspect

        # Centered placement
        placed_x = area.x + (area.width - target_w) / 2.0
        placed_y = area.y + (area.height - target_h) / 2.0
        return Rect(x=placed_x, y=placed_y, width=target_w, height=target_h)


# ---------------------------------------------------------------------------
# Feature 2: Contact Sheet Generator
# ---------------------------------------------------------------------------

@dataclass
class ContactSheetSpec:
    paper_size: PaperSize = PaperSize.LETTER
    orientation: Literal["portrait", "landscape"] = "portrait"
    rows: int = 4
    cols: int = 5
    margins: PageMargins = field(default_factory=PageMargins)
    horizontal_gutter_in: float = 0.2
    vertical_gutter_in: float = 0.3
    caption_height_in: float = 0.3
    caption_fields: list[str] = field(default_factory=lambda: ["file_name", "date_captured"])
    header_title: str = ""
    footer_text: str = ""
    dpi: int = 300

    def __post_init__(self) -> None:
        if self.rows < 1 or self.cols < 1:
            raise ValueError("Rows and columns must be at least 1.")
        if self.rows > 12 or self.cols > 12:
            raise ValueError("Maximum 12 rows or columns allowed.")
        if self.horizontal_gutter_in < 0 or self.vertical_gutter_in < 0:
            raise ValueError("Gutters must be non-negative.")


@dataclass
class ContactSheetCell:
    asset_index: int
    cell_rect: Rect
    image_rect: Rect
    caption_rect: Rect


@dataclass
class ContactSheetPage:
    page_number: int
    total_pages: int
    cells: list[ContactSheetCell]


class ContactSheetEngine:
    """Computes pagination and layout geometry for multi-photo contact sheets."""

    @staticmethod
    def calculate_total_pages(spec: ContactSheetSpec, asset_count: int) -> int:
        if asset_count <= 0:
            return 0
        items_per_page = spec.rows * spec.cols
        return math.ceil(asset_count / items_per_page)

    @staticmethod
    def generate_pages(
        spec: ContactSheetSpec,
        asset_count: int,
    ) -> list[ContactSheetPage]:
        total_pages = ContactSheetEngine.calculate_total_pages(spec, asset_count)
        if total_pages == 0:
            return []

        base_w, base_h = PAPER_DIMENSIONS_INCHES[spec.paper_size]
        if spec.orientation == "landscape":
            base_w, base_h = base_h, base_w

        dpi = spec.dpi
        page_w = base_w * dpi
        page_h = base_h * dpi

        margin_left = spec.margins.left * dpi
        margin_top = spec.margins.top * dpi
        margin_right = spec.margins.right * dpi
        margin_bottom = spec.margins.bottom * dpi

        usable_w = page_w - (margin_left + margin_right)
        usable_h = page_h - (margin_top + margin_bottom)
        if usable_w <= 0 or usable_h <= 0:
            raise ValueError("Contact sheet margins exceed paper bounds.")

        h_gutter = spec.horizontal_gutter_in * dpi
        v_gutter = spec.vertical_gutter_in * dpi
        caption_h = spec.caption_height_in * dpi

        total_h_gutters = h_gutter * (spec.cols - 1)
        total_v_gutters = v_gutter * (spec.rows - 1)

        cell_w = (usable_w - total_h_gutters) / spec.cols
        cell_h = (usable_h - total_v_gutters) / spec.rows
        if cell_w <= 0 or cell_h <= 0 or cell_h <= caption_h:
            raise ValueError("Grid rows, columns, and margins result in unusable cell sizes.")

        image_area_h = cell_h - caption_h
        items_per_page = spec.rows * spec.cols
        pages: list[ContactSheetPage] = []

        for p in range(total_pages):
            page_cells: list[ContactSheetCell] = []
            start_index = p * items_per_page
            end_index = min(asset_count, start_index + items_per_page)

            for i in range(start_index, end_index):
                slot = i - start_index
                row = slot // spec.cols
                col = slot % spec.cols

                cell_x = margin_left + col * (cell_w + h_gutter)
                cell_y = margin_top + row * (cell_h + v_gutter)

                cell_rect = Rect(x=cell_x, y=cell_y, width=cell_w, height=cell_h)
                img_rect = Rect(x=cell_x, y=cell_y, width=cell_w, height=image_area_h)
                cap_rect = Rect(
                    x=cell_x,
                    y=cell_y + image_area_h,
                    width=cell_w,
                    height=caption_h,
                )

                page_cells.append(
                    ContactSheetCell(
                        asset_index=i,
                        cell_rect=cell_rect,
                        image_rect=img_rect,
                        caption_rect=cap_rect,
                    )
                )

            pages.append(
                ContactSheetPage(
                    page_number=p + 1,
                    total_pages=total_pages,
                    cells=page_cells,
                )
            )

        return pages


# ---------------------------------------------------------------------------
# Feature 3: Slideshow Presentation & Playback
# ---------------------------------------------------------------------------

@dataclass
class SlideshowSpec:
    slide_duration_seconds: float = 4.0
    transition_type: Literal["cut", "fade", "dissolve"] = "fade"
    transition_duration_ms: int = 500
    loop: bool = True
    show_hud_info: bool = True

    def __post_init__(self) -> None:
        if self.slide_duration_seconds < 1.0 or self.slide_duration_seconds > 60.0:
            raise ValueError("Slide duration must be between 1.0 and 60.0 seconds.")
        if self.transition_duration_ms < 0 or self.transition_duration_ms > 5000:
            raise ValueError("Transition duration must be between 0 and 5000 ms.")
        if self.transition_duration_ms / 1000.0 >= self.slide_duration_seconds:
            raise ValueError("Transition duration cannot exceed or equal slide duration.")


class SlideshowController:
    """State machine governing fullscreen slideshow playback, transitions, and navigation."""

    def __init__(self, asset_count: int, spec: SlideshowSpec | None = None) -> None:
        self.asset_count = max(0, asset_count)
        self.spec = spec or SlideshowSpec()
        self.current_index = 0
        self.is_playing = False
        self.is_fullscreen = False

    def play(self) -> None:
        if self.asset_count > 0:
            self.is_playing = True

    def pause(self) -> None:
        self.is_playing = False

    def toggle_playback(self) -> bool:
        if self.is_playing:
            self.pause()
        else:
            self.play()
        return self.is_playing

    def next(self) -> int:
        if self.asset_count <= 1:
            return self.current_index
        if self.current_index < self.asset_count - 1:
            self.current_index += 1
        elif self.spec.loop:
            self.current_index = 0
        else:
            self.pause()
        return self.current_index

    def prev(self) -> int:
        if self.asset_count <= 1:
            return self.current_index
        if self.current_index > 0:
            self.current_index -= 1
        elif self.spec.loop:
            self.current_index = self.asset_count - 1
        return self.current_index

    def jump_to(self, index: int) -> int:
        if self.asset_count == 0:
            self.current_index = 0
            return 0
        self.current_index = max(0, min(index, self.asset_count - 1))
        return self.current_index
