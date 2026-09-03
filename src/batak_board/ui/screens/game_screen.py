"""Screen 3: the live round -- score, timer, turn indicator, and LED grid."""

from __future__ import annotations

from typing import Optional

import customtkinter as ctk

from batak_board import theme
from batak_board.config import DIFFICULTY_SETTINGS
from batak_board.ui.components import FeedbackBanner, LedGrid, ProgressTimerBar, neon_button


class GameScreen(ctk.CTkFrame):
    def __init__(self, parent, app):
        super().__init__(parent, fg_color=theme.BG_PRIMARY)
        self.app = app

        self.turn_label = ctk.CTkLabel(self, text="", font=theme.FONT_HEADING, text_color=theme.NEON_CYAN)
        self.turn_label.pack(pady=(28, 0))

        self.score_label = ctk.CTkLabel(self, text="0", font=theme.FONT_SCORE, text_color=theme.NEON_GREEN)
        self.score_label.pack(pady=(0, 4))

        self.feedback_banner = FeedbackBanner(self)
        self.feedback_banner.pack(pady=(0, 12))

        self.timer_bar = ProgressTimerBar(self)
        self.timer_bar.pack(pady=(0, 28))

        # In Simulation/Debug mode the grid is clickable; on real hardware it
        # is a read-only mirror of the physical LEDs (clicks disabled).
        on_press = self._on_grid_press if not self.app.controller.is_hardware else None
        self.led_grid = LedGrid(self, on_press=on_press)
        self.led_grid.pack()

        if not self.app.controller.is_hardware:
            ctk.CTkLabel(
                self,
                text="Simulation mode: click a button or press keys 0-9",
                font=theme.FONT_LABEL,
                text_color=theme.TEXT_MUTED,
            ).pack(pady=(12, 0))

        self._ready_overlay = ctk.CTkFrame(
            self, fg_color=theme.BG_SURFACE, corner_radius=theme.CORNER_RADIUS, border_width=2, border_color=theme.NEON_CYAN
        )
        self._ready_label = ctk.CTkLabel(self._ready_overlay, text="", font=theme.FONT_HEADING, text_color=theme.TEXT_PRIMARY)
        self._ready_label.pack(padx=48, pady=(36, 20))
        neon_button(
            self._ready_overlay, "READY!", command=self._dismiss_ready_overlay, color=theme.NEON_GREEN, width=220
        ).pack(pady=(0, 12))
        ctk.CTkLabel(
            self._ready_overlay,
            text="or press any button on the board",
            font=theme.FONT_LABEL,
            text_color=theme.TEXT_MUTED,
        ).pack(pady=(0, 32))
        self._ready_poll_job: Optional[str] = None

    def _on_grid_press(self, index: int) -> None:
        self.app.controller.press(index)

    # -- lifecycle -------------------------------------------------------

    def on_show(self) -> None:
        engine = self.app.engine
        engine.on_score_change = self._on_score_change
        engine.on_time_left_change = self.timer_bar.update_time
        engine.on_active_button_change = self.led_grid.set_active
        engine.on_feedback = self.feedback_banner.pulse
        engine.on_round_end = self._on_round_end
        self._begin_turn()

    def _begin_turn(self) -> None:
        session = self.app.session
        assert session is not None
        player = session.active_player

        self.turn_label.configure(text=f"TURN OF: {player.name.upper()}" if session.is_two_player else "")
        self.score_label.configure(text="0")
        self.led_grid.set_active(None)

        settings = DIFFICULTY_SETTINGS[session.difficulty]
        self.timer_bar.start(settings.round_duration)
        self.app.engine.start_round(player, settings)

    def _on_score_change(self, player) -> None:
        self.score_label.configure(text=str(player.score))

    def _on_round_end(self, _player) -> None:
        session = self.app.session
        assert session is not None
        # Only single-player's one turn, or the second player's turn, ends
        # the game; the first of two turns hands off via the ready overlay.
        if session.is_two_player and session.active_player_index == 0:
            session.advance_player()
            self._show_ready_overlay()
        else:
            self.app.show_screen("results")

    def _show_ready_overlay(self) -> None:
        session = self.app.session
        assert session is not None
        next_player = session.active_player
        self._ready_label.configure(text=f"Ready, {next_player.name}!")
        self._ready_overlay.place(relx=0.5, rely=0.5, anchor="center")
        self._poll_ready_dismiss()

    def _poll_ready_dismiss(self) -> None:
        """While the ready overlay is up, any button press dismisses it too
        -- not just clicking READY. The engine's own tick() never drains the
        press queue while a round isn't running (i.e. exactly during this
        overlay), so it's safe for us to drain it here instead: this is a
        physical-button device first, and requiring a mouse click here would
        strand a kiosk with no mouse/touchscreen attached."""
        if not self.winfo_exists():
            return  # app closed while the overlay was still up
        if self.app.controller.poll_presses():
            self._dismiss_ready_overlay()
            return
        self._ready_poll_job = self.after(50, self._poll_ready_dismiss)

    def _dismiss_ready_overlay(self) -> None:
        if self._ready_poll_job is not None:
            self.after_cancel(self._ready_poll_job)
            self._ready_poll_job = None
        self._ready_overlay.place_forget()
        self._begin_turn()
