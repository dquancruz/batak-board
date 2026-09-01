"""Framework-agnostic game engine: round timing, scoring, and feedback.

Driven entirely by an external :meth:`GameEngine.tick` call (from the UI's
`root.after()` loop), so this module never touches Tkinter and never spawns
its own thread. Hardware press events arrive through
``ButtonController.poll_presses()``, keeping all game logic -- and every UI
callback it triggers -- on the caller's thread.
"""

from __future__ import annotations

import random
import time
from typing import Callable, Optional

from batak_board.config import NUM_BUTTONS, DifficultySettings
from batak_board.game.models import Player
from batak_board.hardware.base import ButtonController

# Feedback kinds passed to on_feedback: "hit" (correct press), "wrong"
# (incorrect button pressed), "timeout" (lit button expired unpressed).
FeedbackKind = str


class GameEngine:
    def __init__(
        self,
        controller: ButtonController,
        clock: Optional[Callable[[], float]] = None,
    ) -> None:
        self.controller = controller
        self._clock = clock or time.monotonic

        self._settings: Optional[DifficultySettings] = None
        self._player: Optional[Player] = None
        self._active_button: Optional[int] = None
        self._round_start: Optional[float] = None
        self._button_lit_at: Optional[float] = None
        self._running = False

        # UI hooks - assign whichever you need before calling start_round().
        self.on_active_button_change: Optional[Callable[[Optional[int]], None]] = None
        self.on_score_change: Optional[Callable[[Player], None]] = None
        self.on_time_left_change: Optional[Callable[[float], None]] = None
        self.on_feedback: Optional[Callable[[FeedbackKind], None]] = None
        self.on_round_end: Optional[Callable[[Player], None]] = None

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def active_button(self) -> Optional[int]:
        return self._active_button

    def start_round(self, player: Player, settings: DifficultySettings) -> None:
        """Begin a timed round for `player` under the given difficulty."""
        self._player = player
        self._settings = settings
        self._running = True
        self._round_start = self._clock()
        self.controller.poll_presses()  # drop any stale presses from before the round
        self.controller.set_all_leds(False)
        self._light_random_button()

    def stop_round(self) -> None:
        """End the round early (or naturally, once time runs out)."""
        if not self._running:
            return
        self._running = False
        self.controller.set_all_leds(False)
        self._active_button = None
        self._notify_active_button()
        if self.on_round_end and self._player is not None:
            self.on_round_end(self._player)

    def tick(self) -> None:
        """Call periodically (e.g. every ~50ms) from the UI's main loop."""
        if not self._running or self._settings is None or self._round_start is None:
            return

        for index in self.controller.poll_presses():
            self._handle_press(index)
            if not self._running:
                return  # round ended (time ran out) while draining presses

        now = self._clock()
        time_left = max(0.0, self._settings.round_duration - (now - self._round_start))
        if self.on_time_left_change:
            self.on_time_left_change(time_left)
        if time_left <= 0:
            self.stop_round()
            return

        if self._button_timed_out(now):
            self._register_miss("timeout")

    def _button_timed_out(self, now: float) -> bool:
        timeout = self._settings.button_timeout if self._settings else None
        return (
            timeout is not None
            and self._active_button is not None
            and self._button_lit_at is not None
            and now - self._button_lit_at >= timeout
        )

    def _handle_press(self, index: int) -> None:
        if index == self._active_button:
            self._register_hit()
        else:
            self._register_miss("wrong")

    def _register_hit(self) -> None:
        assert self._player is not None and self._active_button is not None
        self.controller.set_led(self._active_button, False)
        self._player.score += 1
        self._player.hits += 1
        if self.on_score_change:
            self.on_score_change(self._player)
        if self.on_feedback:
            self.on_feedback("hit")
        self._light_random_button()

    def _register_miss(self, reason: FeedbackKind) -> None:
        assert self._player is not None
        if self._active_button is not None:
            self.controller.set_led(self._active_button, False)
        self._player.misses += 1
        if self.on_feedback:
            self.on_feedback(reason)
        self._light_random_button()

    def _light_random_button(self) -> None:
        if not self._running:
            return
        next_index = random.randrange(NUM_BUTTONS)
        if NUM_BUTTONS > 1:
            while next_index == self._active_button:
                next_index = random.randrange(NUM_BUTTONS)
        self._active_button = next_index
        self._button_lit_at = self._clock()
        self.controller.set_led(next_index, True)
        self._notify_active_button()

    def _notify_active_button(self) -> None:
        if self.on_active_button_change:
            self.on_active_button_change(self._active_button)
