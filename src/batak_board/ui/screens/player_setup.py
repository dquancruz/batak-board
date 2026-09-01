"""Screen 2: dynamic player name entry -- one field for 1P, two for 2P."""

from __future__ import annotations

import customtkinter as ctk

from batak_board import theme
from batak_board.config import GameMode
from batak_board.ui.components import neon_button


class PlayerSetupScreen(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=theme.BG_PRIMARY)
        self.app = app
        self._entries: list[ctk.CTkEntry] = []

        center = ctk.CTkFrame(self, fg_color="transparent")
        center.place(relx=0.5, rely=0.5, anchor="center")

        ctk.CTkLabel(center, text="PLAYER SETUP", font=theme.FONT_HEADING, text_color=theme.NEON_CYAN).pack(
            pady=(0, 32)
        )

        self._entries_frame = ctk.CTkFrame(center, fg_color="transparent")
        self._entries_frame.pack(pady=(0, 32))

        button_row = ctk.CTkFrame(center, fg_color="transparent")
        button_row.pack()
        neon_button(
            button_row,
            "BACK",
            command=lambda: self.app.show_screen("main_menu"),
            color=theme.BG_SURFACE_ALT,
            width=160,
        ).pack(side="left", padx=8)
        neon_button(
            button_row, "CONTINUE", command=self._continue, color=theme.NEON_GREEN, width=200
        ).pack(side="left", padx=8)

    def on_show(self) -> None:
        """Rebuild the name fields for the currently selected game mode."""
        for widget in self._entries_frame.winfo_children():
            widget.destroy()
        self._entries.clear()

        default_names = (
            ["Player 1", "Player 2"] if self.app.selected_mode == GameMode.TWO_PLAYER else ["Player"]
        )
        for default_name in default_names:
            ctk.CTkLabel(
                self._entries_frame, text=default_name.upper(), font=theme.FONT_LABEL, text_color=theme.TEXT_MUTED
            ).pack(anchor="w")
            entry = ctk.CTkEntry(
                self._entries_frame,
                width=380,
                height=48,
                font=theme.FONT_BODY,
                placeholder_text=default_name,
                fg_color=theme.BG_SURFACE_ALT,
                border_color=theme.BORDER,
                text_color=theme.TEXT_PRIMARY,
                placeholder_text_color=theme.TEXT_MUTED,
            )
            entry.pack(pady=(4, 16))
            self._entries.append(entry)

    def _continue(self) -> None:
        names = [entry.get() for entry in self._entries]
        self.app.start_new_game(names)
