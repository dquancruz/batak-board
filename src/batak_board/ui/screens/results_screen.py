"""Screen 4: score breakdown, winner celebration, and the local leaderboard."""

from __future__ import annotations

from typing import Optional

import customtkinter as ctk

from batak_board import theme
from batak_board.ui.components import neon_button

_WINNER_PULSE_COLORS = (theme.NEON_MAGENTA, theme.NEON_YELLOW)


class ResultsScreen(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=theme.BG_PRIMARY)
        self.app = app
        self._pulse_job: Optional[str] = None

        ctk.CTkLabel(self, text="RESULTS", font=theme.FONT_HEADING, text_color=theme.NEON_CYAN).pack(
            pady=(24, 4)
        )
        self.winner_label = ctk.CTkLabel(self, text="", font=theme.FONT_HEADING)
        self.winner_label.pack(pady=(0, 12))

        self.breakdown_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.breakdown_frame.pack(pady=(0, 20))

        ctk.CTkLabel(self, text="LEADERBOARD", font=theme.FONT_LABEL, text_color=theme.TEXT_MUTED).pack()
        self.leaderboard_frame = ctk.CTkFrame(
            self, fg_color=theme.BG_SURFACE, corner_radius=theme.CORNER_RADIUS
        )
        self.leaderboard_frame.pack(pady=(8, 24), padx=40, fill="x")

        neon_button(
            self, "PLAY AGAIN", command=self._restart, color=theme.NEON_GREEN, width=260
        ).pack()

    def on_show(self) -> None:
        self._cancel_pulse()
        session = self.app.session
        assert session is not None

        for player in session.players:
            self.app.leaderboard.add(player.name, player.score, session.difficulty)

        self._render_breakdown(session)
        self._render_winner(session)
        self._render_leaderboard()

    # -- sections ----------------------------------------------------

    def _render_breakdown(self, session) -> None:
        for widget in self.breakdown_frame.winfo_children():
            widget.destroy()
        for player in session.players:
            row = ctk.CTkFrame(self.breakdown_frame, fg_color="transparent")
            row.pack(pady=4)
            ctk.CTkLabel(row, text=player.name, font=theme.FONT_BODY, text_color=theme.TEXT_PRIMARY, width=160, anchor="w").pack(
                side="left"
            )
            ctk.CTkLabel(
                row,
                text=f"{player.score} pts  ({player.hits} hits / {player.misses} misses)",
                font=theme.FONT_BODY,
                text_color=theme.NEON_GREEN,
            ).pack(side="left")

    def _render_winner(self, session) -> None:
        if not session.is_two_player:
            self.winner_label.configure(text="")
            return
        winner = session.winner()
        if winner is None:
            self.winner_label.configure(text="IT'S A TIE!", text_color=theme.NEON_YELLOW)
            return
        self.winner_label.configure(text=f"{winner.name.upper()} WINS! \U0001f3c6", text_color=_WINNER_PULSE_COLORS[0])
        self._pulse(step=1)

    def _render_leaderboard(self) -> None:
        for widget in self.leaderboard_frame.winfo_children():
            widget.destroy()
        entries = self.app.leaderboard.top()
        if not entries:
            ctk.CTkLabel(self.leaderboard_frame, text="No scores yet", font=theme.FONT_BODY, text_color=theme.TEXT_MUTED).pack(
                pady=16
            )
            return
        for rank, entry in enumerate(entries, start=1):
            row = ctk.CTkFrame(self.leaderboard_frame, fg_color="transparent")
            row.pack(fill="x", padx=16, pady=4)
            ctk.CTkLabel(row, text=f"#{rank}", font=theme.FONT_LABEL, text_color=theme.NEON_CYAN, width=40).pack(side="left")
            ctk.CTkLabel(row, text=entry.name, font=theme.FONT_BODY, text_color=theme.TEXT_PRIMARY, width=200, anchor="w").pack(
                side="left"
            )
            ctk.CTkLabel(row, text=f"{entry.score} pts", font=theme.FONT_BODY, text_color=theme.NEON_GREEN, width=90).pack(
                side="left"
            )
            ctk.CTkLabel(
                row, text=entry.difficulty.capitalize(), font=theme.FONT_BODY, text_color=theme.TEXT_MUTED
            ).pack(side="left")

    # -- winner animation -------------------------------------------------

    def _pulse(self, step: int) -> None:
        self.winner_label.configure(text_color=_WINNER_PULSE_COLORS[step % len(_WINNER_PULSE_COLORS)])
        self._pulse_job = self.after(400, lambda: self._pulse(step + 1))

    def _cancel_pulse(self) -> None:
        if self._pulse_job is not None:
            self.after_cancel(self._pulse_job)
            self._pulse_job = None

    # -- navigation ----------------------------------------------------

    def _restart(self) -> None:
        self._cancel_pulse()
        self.app.session = None
        self.app.show_screen("main_menu")
