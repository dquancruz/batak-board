"""Screen 1: title, mode + difficulty selectors, and the start button."""

from __future__ import annotations

import customtkinter as ctk

from batak_board import theme
from batak_board.config import DIFFICULTY_SETTINGS, Difficulty, GameMode
from batak_board.ui.components import neon_button

_MODE_LABELS = {
    "1 Player": GameMode.SINGLE,
    "2 Players (Turns)": GameMode.TWO_PLAYER,
}
_DIFFICULTY_LABELS = {settings.label: level for level, settings in DIFFICULTY_SETTINGS.items()}


class MainMenuScreen(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=theme.BG_PRIMARY)
        self.app = app

        center = ctk.CTkFrame(self, fg_color="transparent")
        center.place(relx=0.5, rely=0.5, anchor="center")

        ctk.CTkLabel(center, text="BATAK BOARD", font=theme.FONT_TITLE, text_color=theme.NEON_CYAN).pack(
            pady=(0, 4)
        )
        ctk.CTkLabel(
            center,
            text="REFLEX TRAINING SYSTEM",
            font=theme.FONT_LABEL,
            text_color=theme.TEXT_MUTED,
        ).pack(pady=(0, 40))

        ctk.CTkLabel(center, text="GAME MODE", font=theme.FONT_LABEL, text_color=theme.TEXT_MUTED).pack(
            anchor="w"
        )
        self.mode_selector = ctk.CTkSegmentedButton(
            center,
            values=list(_MODE_LABELS.keys()),
            command=self._on_mode_selected,
            font=theme.FONT_BODY,
            selected_color=theme.NEON_CYAN,
            selected_hover_color=theme.NEON_CYAN,
            unselected_color=theme.BG_SURFACE_ALT,
            fg_color=theme.BG_SURFACE,
            width=420,
            height=48,
        )
        self.mode_selector.set("1 Player")
        self.mode_selector.pack(pady=(4, 24))

        ctk.CTkLabel(center, text="DIFFICULTY", font=theme.FONT_LABEL, text_color=theme.TEXT_MUTED).pack(
            anchor="w"
        )
        self.difficulty_selector = ctk.CTkSegmentedButton(
            center,
            values=list(_DIFFICULTY_LABELS.keys()),
            command=self._on_difficulty_selected,
            font=theme.FONT_BODY,
            selected_color=theme.NEON_GREEN,
            selected_hover_color=theme.NEON_GREEN,
            unselected_color=theme.BG_SURFACE_ALT,
            fg_color=theme.BG_SURFACE,
            width=420,
            height=48,
        )
        self.difficulty_selector.set(DIFFICULTY_SETTINGS[Difficulty.EASY].label)
        self.difficulty_selector.pack(pady=(4, 40))

        neon_button(
            center, "START GAME", command=self._start, color=theme.NEON_GREEN, width=280, height=64
        ).pack()

        self._on_mode_selected(self.mode_selector.get())
        self._on_difficulty_selected(self.difficulty_selector.get())

    def _on_mode_selected(self, label: str) -> None:
        self.app.selected_mode = _MODE_LABELS[label]

    def _on_difficulty_selected(self, label: str) -> None:
        self.app.selected_difficulty = _DIFFICULTY_LABELS[label]

    def _start(self) -> None:
        self.app.show_screen("player_setup")
