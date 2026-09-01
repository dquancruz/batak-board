"""Screen 1: title, mode + difficulty selectors, and the start button."""

from __future__ import annotations

import customtkinter as ctk

from batak_board import theme
from batak_board.config import DIFFICULTY_SETTINGS, Difficulty, GameMode
from batak_board.ui.components import SegmentedChoice, neon_button

_MODE_OPTIONS = [(GameMode.SINGLE.value, "1 Player"), (GameMode.TWO_PLAYER.value, "2 Players (Turns)")]
_DIFFICULTY_OPTIONS = [(level.value, settings.label) for level, settings in DIFFICULTY_SETTINGS.items()]


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
        self.mode_selector = SegmentedChoice(
            center,
            options=_MODE_OPTIONS,
            default=GameMode.SINGLE.value,
            on_change=self._on_mode_selected,
            accent=theme.NEON_CYAN,
            width=420,
        )
        self.mode_selector.pack(pady=(4, 24))

        ctk.CTkLabel(center, text="DIFFICULTY", font=theme.FONT_LABEL, text_color=theme.TEXT_MUTED).pack(
            anchor="w"
        )
        self.difficulty_selector = SegmentedChoice(
            center,
            options=_DIFFICULTY_OPTIONS,
            default=Difficulty.EASY.value,
            on_change=self._on_difficulty_selected,
            accent=theme.NEON_GREEN,
            width=420,
        )
        self.difficulty_selector.pack(pady=(4, 40))

        neon_button(
            center, "START GAME", command=self._start, color=theme.NEON_GREEN, width=280, height=64
        ).pack()

        self._on_mode_selected(self.mode_selector.value)
        self._on_difficulty_selected(self.difficulty_selector.value)

    def _on_mode_selected(self, value: str) -> None:
        self.app.selected_mode = GameMode(value)

    def _on_difficulty_selected(self, value: str) -> None:
        self.app.selected_difficulty = Difficulty(value)

    def _start(self) -> None:
        self.app.show_screen("player_setup")
