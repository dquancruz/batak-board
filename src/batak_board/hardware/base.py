"""Abstract interface every button/LED backend implements."""

from __future__ import annotations

import queue
from abc import ABC, abstractmethod

from batak_board.config import NUM_BUTTONS


class ButtonController(ABC):
    """Abstraction over the 12 button/LED pairs.

    Concrete implementations (the real GPIO controller or the Simulation/
    Debug controller) only need to drive LEDs and report presses. All game
    timing and scoring logic lives in :mod:`batak_board.game.engine`.

    Presses are handed off through a thread-safe queue rather than a direct
    callback: on real hardware, ``gpiozero`` fires press events on its own
    background thread, and funneling them into a queue that the engine
    drains from the UI's main-loop ``tick()`` keeps every bit of game logic
    (and every UI update it triggers) on a single thread.
    """

    num_buttons: int = NUM_BUTTONS

    def __init__(self) -> None:
        self._press_queue: "queue.Queue[int]" = queue.Queue()

    @property
    @abstractmethod
    def is_hardware(self) -> bool:
        """True for the real GPIO controller, False for the simulator."""

    def setup(self) -> None:
        """Acquire pins / bindings. Default no-op; override if needed."""

    def teardown(self) -> None:
        """Release pins / bindings. Default no-op; override if needed."""

    @abstractmethod
    def set_led(self, index: int, on: bool) -> None:
        """Turn a single button's LED on or off."""

    def set_all_leds(self, on: bool) -> None:
        for i in range(self.num_buttons):
            self.set_led(i, on)

    def report_press(self, index: int) -> None:
        """Subclasses call this (from any thread) when a button is pressed."""
        if 0 <= index < self.num_buttons:
            self._press_queue.put(index)

    def poll_presses(self) -> list[int]:
        """Drain and return every button press queued since the last call."""
        presses: list[int] = []
        while True:
            try:
                presses.append(self._press_queue.get_nowait())
            except queue.Empty:
                break
        return presses
