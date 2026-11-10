"""Acceptance tests evaluating Print/PDF layouts, Contact Sheets, and Slideshows as separate features."""

import pytest

from kurolight.domain.presentation import (
    ContactSheetEngine,
    ContactSheetSpec,
    PageMargins,
    PaperSize,
    PrintLayoutCalculator,
    PrintLayoutSpec,
    SlideshowController,
    SlideshowSpec,
)


# ===========================================================================
# Feature 1: Print & PDF Layout Acceptance Tests
# ===========================================================================

def test_print_page_pixel_dimensions_match_standard_dpi():
    # Letter is 8.5 x 11.0 in -> at 300 DPI: 2550 x 3300 px
    letter_spec = PrintLayoutSpec(paper_size=PaperSize.LETTER, dpi=300)
    w, h = PrintLayoutCalculator.get_page_pixel_dimensions(letter_spec)
    assert w == 2550
    assert h == 3300

    # Letter in landscape: 3300 x 2550 px
    landscape_spec = PrintLayoutSpec(paper_size=PaperSize.LETTER, orientation="landscape", dpi=300)
    lw, lh = PrintLayoutCalculator.get_page_pixel_dimensions(landscape_spec)
    assert lw == 3300
    assert lh == 2550

    # 4x6 at 300 DPI: 1200 x 1800 px
    photo_spec = PrintLayoutSpec(paper_size=PaperSize.PHOTO_4X6, dpi=300)
    pw, ph = PrintLayoutCalculator.get_page_pixel_dimensions(photo_spec)
    assert pw == 1200
    assert ph == 1800

    # 8x10 at 300 DPI: 2400 x 3000 px
    spec_8x10 = PrintLayoutSpec(paper_size=PaperSize.PHOTO_8X10, dpi=300)
    w8, h8 = PrintLayoutCalculator.get_page_pixel_dimensions(spec_8x10)
    assert w8 == 2400
    assert h8 == 3000


def test_print_layout_rejects_unsupported_dpi_or_negative_margins():
    with pytest.raises(ValueError, match="Unsupported DPI"):
        PrintLayoutSpec(dpi=72)

    with pytest.raises(ValueError, match="Margins must be non-negative"):
        PageMargins(top=-0.5)


def test_print_layout_aspect_ratio_fit_mode_centers_without_cropping():
    # Printable area: 8.5 x 11 with 0.5 in margins -> 7.5 x 10.0 in -> 2250 x 3000 px
    spec = PrintLayoutSpec(
        paper_size=PaperSize.LETTER,
        margins=PageMargins(top=0.5, bottom=0.5, left=0.5, right=0.5),
        dpi=300,
        fill_mode="fit",
    )
    # Landscape 3:2 image (6000 x 4000) inside portrait area (2250 x 3000)
    rect = PrintLayoutCalculator.compute_image_placement(spec, 6000, 4000)

    # Width fits the usable area (2250 px); height is 2250 / 1.5 = 1500 px
    assert rect.width == 2250
    assert rect.height == 1500
    # Left aligns with left margin (0.5 * 300 = 150 px)
    assert rect.x == 150
    # Vertically centered in 3000 px height with 150 px top margin: 150 + (3000 - 1500) / 2 = 900 px
    assert rect.y == 900


def test_print_layout_fill_mode_fills_entire_printable_area():
    spec = PrintLayoutSpec(
        paper_size=PaperSize.LETTER,
        margins=PageMargins(top=0.5, bottom=0.5, left=0.5, right=0.5),
        dpi=300,
        fill_mode="fill",
    )
    # Landscape 3:2 image (6000 x 4000) inside portrait area (2250 x 3000)
    rect = PrintLayoutCalculator.compute_image_placement(spec, 6000, 4000)

    # In fill mode, image must completely cover the 3000 px height -> width is 3000 * 1.5 = 4500 px
    assert rect.height == 3000
    assert rect.width == 4500
    # Horizontally centered: 150 + (2250 - 4500) / 2 = -975 px
    assert rect.x == -975
    assert rect.y == 150


# ===========================================================================
# Feature 2: Contact Sheet Acceptance Tests
# ===========================================================================

def test_contact_sheet_pagination_math():
    # 4 rows x 5 cols = 20 photos per page
    spec = ContactSheetSpec(rows=4, cols=5)

    assert ContactSheetEngine.calculate_total_pages(spec, 0) == 0
    assert ContactSheetEngine.calculate_total_pages(spec, 1) == 1
    assert ContactSheetEngine.calculate_total_pages(spec, 20) == 1
    assert ContactSheetEngine.calculate_total_pages(spec, 21) == 2
    assert ContactSheetEngine.calculate_total_pages(spec, 45) == 3


def test_contact_sheet_generates_correct_cell_counts_and_coordinates():
    spec = ContactSheetSpec(
        rows=2,
        cols=2,
        margins=PageMargins(0.5, 0.5, 0.5, 0.5),
        horizontal_gutter_in=0.1,
        vertical_gutter_in=0.1,
        caption_height_in=0.25,
        dpi=100,
    )
    # 5 assets with a 2x2 grid should generate 2 pages: 4 on page 1, 1 on page 2
    pages = ContactSheetEngine.generate_pages(spec, 5)

    assert len(pages) == 2
    assert pages[0].page_number == 1
    assert pages[0].total_pages == 2
    assert len(pages[0].cells) == 4
    assert [c.asset_index for c in pages[0].cells] == [0, 1, 2, 3]

    assert pages[1].page_number == 2
    assert len(pages[1].cells) == 1
    assert pages[1].cells[0].asset_index == 4

    # Verify cell geometry
    first_cell = pages[0].cells[0]
    assert first_cell.cell_rect.x == 50  # margin left = 0.5 * 100
    assert first_cell.cell_rect.y == 50  # margin top = 0.5 * 100
    assert first_cell.caption_rect.height == 25  # caption height = 0.25 * 100
    assert first_cell.image_rect.height == first_cell.cell_rect.height - 25


def test_contact_sheet_rejects_invalid_grid_parameters():
    with pytest.raises(ValueError, match="at least 1"):
        ContactSheetSpec(rows=0, cols=3)

    with pytest.raises(ValueError, match="Maximum 12"):
        ContactSheetSpec(rows=15, cols=4)


# ===========================================================================
# Feature 3: Slideshow Presentation Acceptance Tests
# ===========================================================================

def test_slideshow_initial_state_and_playback():
    controller = SlideshowController(asset_count=10)
    assert controller.current_index == 0
    assert controller.is_playing is False

    controller.play()
    assert controller.is_playing is True

    controller.pause()
    assert controller.is_playing is False

    # Empty slideshow cannot play
    empty_controller = SlideshowController(asset_count=0)
    empty_controller.play()
    assert empty_controller.is_playing is False


def test_slideshow_navigation_with_and_without_looping():
    # Looping enabled
    spec_loop = SlideshowSpec(loop=True)
    loop_controller = SlideshowController(asset_count=3, spec=spec_loop)

    assert loop_controller.next() == 1
    assert loop_controller.next() == 2
    assert loop_controller.next() == 0  # wraps around to start

    assert loop_controller.prev() == 2  # wraps backward to end
    assert loop_controller.prev() == 1

    # Looping disabled
    spec_no_loop = SlideshowSpec(loop=False)
    no_loop_controller = SlideshowController(asset_count=3, spec=spec_no_loop)
    no_loop_controller.play()

    assert no_loop_controller.next() == 1
    assert no_loop_controller.next() == 2
    assert no_loop_controller.next() == 2  # clamps at end
    assert no_loop_controller.is_playing is False  # pauses at end

    assert no_loop_controller.prev() == 1
    assert no_loop_controller.prev() == 0
    assert no_loop_controller.prev() == 0  # clamps at beginning


def test_slideshow_jump_clamps_to_valid_indices():
    controller = SlideshowController(asset_count=5)
    assert controller.jump_to(3) == 3
    assert controller.jump_to(-5) == 0
    assert controller.jump_to(99) == 4


def test_slideshow_spec_validation():
    with pytest.raises(ValueError, match="Slide duration"):
        SlideshowSpec(slide_duration_seconds=0.2)

    with pytest.raises(ValueError, match="Transition duration cannot exceed"):
        SlideshowSpec(slide_duration_seconds=2.0, transition_duration_ms=2500)
