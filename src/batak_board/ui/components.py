"""Reusable widgets shared across screens."""

from __future__ import annotations

from typing import Callable, Optional, Union

import customtkinter as ctk

from batak_board import theme
from batak_board.config import NUM_BUTTONS

# Every theme color is (light_hex, dark_hex); CTk resolves the pair against
# the current appearance mode on its own. A few widgets still occasionally
# take a plain single-mode hex string, so helpers here accept either.
ColorType = Union[str, tuple[str, str]]


def neon_button(
    parent,
    text: str,
    command: Optional[Callable[[], None]] = None,
    color: ColorType = theme.NEON_CYAN,
    width: int = 220,
    height: int = 56,
    font=theme.FONT_BUTTON,
) -> ctk.CTkButton:
    """A bright, high-contrast button matching the dashboard theme."""
    return ctk.CTkButton(
        parent,
        text=text,
        command=command,
        width=width,
        height=height,
        corner_radius=theme.CORNER_RADIUS,
        font=font,
        fg_color=color,
        hover_color=_darken(color),
        text_color=theme.BG_PRIMARY,
    )


def _darken(color: ColorType, factor: float = 0.75) -> ColorType:
    if isinstance(color, tuple):
        return tuple(_darken(c, factor) for c in color)  # type: ignore[return-value]
    hex_color = color.lstrip("#")
    r, g, b = (int(hex_color[i : i + 2], 16) for i in (0, 2, 4))
    return f"#{int(r * factor):02x}{int(g * factor):02x}{int(b * factor):02x}"


class LedGrid(ctk.CTkFrame):
    """A grid mirroring the 10 physical buttons.

    In Simulation/Debug mode (``on_press`` provided) each cell is clickable,
    letting the game be played with the mouse. On real hardware the grid is
    still shown/updated live as a visual mirror of the physical LEDs, but
    clicks are ignored.
    """

    COLUMNS = 5

    def __init__(self, parent, on_press: Optional[Callable[[int], None]] = None, **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        self._on_press = on_press
        self._cells: dict[int, ctk.CTkButton] = {}

        for index in range(NUM_BUTTONS):
            row, col = divmod(index, self.COLUMNS)
            cell = ctk.CTkButton(
                self,
                text=str(index + 1),
                width=72,
                height=72,
                corner_radius=36,
                font=theme.FONT_HEADING,
                fg_color=theme.LED_OFF,
                hover_color=theme.LED_OFF if on_press is None else theme.BG_SURFACE_ALT,
                text_color=theme.TEXT_MUTED,
                border_width=2,
                border_color=theme.BORDER,
                state="normal" if on_press is not None else "disabled",
                command=(lambda i=index: self._handle_click(i)) if on_press else None,
            )
            cell.grid(row=row, column=col, padx=8, pady=8)
            self._cells[index] = cell

    def _handle_click(self, index: int) -> None:
        if self._on_press:
            self._on_press(index)

    def set_active(self, index: Optional[int]) -> None:
        """Light exactly one button (or none), matching the hardware LEDs."""
        for i, cell in self._cells.items():
            cell.configure(fg_color=theme.NEON_CYAN if i == index else theme.LED_OFF)


class FeedbackBanner(ctk.CTkLabel):
    """Transient hit/miss/timeout feedback text.

    A separate widget rather than a per-cell flash on :class:`LedGrid`: the
    engine relights the next button in the same synchronous call that
    reports feedback, so a flash-then-revert on the same cell would be
    overwritten before Tk ever draws it. This banner has no such race.
    """

    _MESSAGES = {
        "hit": ("+1", theme.NEON_GREEN),
        "wrong": ("MISS", theme.NEON_RED),
        "timeout": ("TOO SLOW", theme.NEON_YELLOW),
    }

    def __init__(self, parent, **kwargs):
        super().__init__(parent, text="", font=theme.FONT_HEADING, text_color=theme.BG_PRIMARY, **kwargs)
        self._pending_clear: Optional[str] = None

    def pulse(self, kind: str, duration_ms: int = 450) -> None:
        text, color = self._MESSAGES.get(kind, ("", theme.TEXT_MUTED))
        self.configure(text=text, text_color=color)
        if self._pending_clear:
            self.after_cancel(self._pending_clear)
        self._pending_clear = self.after(duration_ms, lambda: self.configure(text=""))


class SegmentedChoice(ctk.CTkFrame):
    """A row of selectable chips, used for the mode/difficulty pickers.

    Built instead of using ``CTkSegmentedButton`` directly: that widget only
    exposes a single ``text_color`` shared by every chip, selected or not,
    so there's no way to keep label text readable against both a bright
    accent fill (selected) and a neutral fill (unselected) at the same
    time. Each chip here is its own button, styled independently -- same
    trick :func:`neon_button` uses for contrast against an accent color.
    """

    def __init__(
        self,
        parent,
        options: list[tuple[str, str]],
        default: str,
        on_change: Optional[Callable[[str], None]] = None,
        accent: ColorType = theme.NEON_CYAN,
        **kwargs,
    ):
        super().__init__(parent, fg_color=theme.BG_SURFACE, corner_radius=theme.CORNER_RADIUS, **kwargs)
        self._on_change = on_change
        self._accent = accent
        self._value = default
        self._buttons: dict[str, ctk.CTkButton] = {}

        for col, (value, label) in enumerate(options):
            self.grid_columnconfigure(col, weight=1)
            button = ctk.CTkButton(
                self,
                text=label,
                font=theme.FONT_BODY,
                corner_radius=max(theme.CORNER_RADIUS - 4, 0),
                height=44,
                command=lambda v=value: self._select(v),
            )
            button.grid(row=0, column=col, padx=4, pady=4, sticky="nsew")
            self._buttons[value] = button

        self._refresh()

    @property
    def value(self) -> str:
        return self._value

    def _select(self, value: str) -> None:
        if value == self._value:
            return
        self._value = value
        self._refresh()
        if self._on_change:
            self._on_change(value)

    def _refresh(self) -> None:
        for value, button in self._buttons.items():
            selected = value == self._value
            button.configure(
                fg_color=self._accent if selected else theme.BG_SURFACE_ALT,
                hover_color=_darken(self._accent) if selected else theme.BORDER,
                text_color=theme.BG_PRIMARY if selected else theme.TEXT_PRIMARY,
            )


class ProgressTimerBar(ctk.CTkFrame):
    """Countdown bar + numeric readout for the round timer."""

    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        self._total = 1.0

        self.bar = ctk.CTkProgressBar(
            self,
            width=480,
            height=22,
            corner_radius=11,
            progress_color=theme.NEON_GREEN,
            fg_color=theme.BG_SURFACE_ALT,
        )
        self.bar.set(1.0)
        self.bar.pack(fill="x", expand=True)

        self.label = ctk.CTkLabel(self, text="0s", font=theme.FONT_LABEL, text_color=theme.TEXT_MUTED)
        self.label.pack(pady=(6, 0))

    def start(self, total_seconds: float) -> None:
        self._total = max(total_seconds, 0.001)
        self.update_time(total_seconds)

    def update_time(self, time_left: float) -> None:
        fraction = max(0.0, min(1.0, time_left / self._total))
        self.bar.set(fraction)
        color = theme.NEON_GREEN
        if fraction < 0.15:
            color = theme.NEON_RED
        elif fraction < 0.4:
            color = theme.NEON_YELLOW
        self.bar.configure(progress_color=color)
        self.label.configure(text=f"{time_left:0.1f}s")
