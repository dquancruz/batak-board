"""Simulation/Debug mode: no Raspberry Pi required.

Used automatically when no GPIO hardware is detected. The UI wires this up
to on-screen button clicks and the number keys 0-9; :attr:`led_states` lets
the UI mirror the (simulated) LEDs on screen so the whole app is testable
on a regular dev machine.
"""

from __future__ import annotations

from batak_board.hardware.base import ButtonController


class SimulatedButtonController(ButtonController):
    def __init__(self) -> None:
        super().__init__()
        self.led_states: dict[int, bool] = {i: False for i in range(self.num_buttons)}

    @property
    def is_hardware(self) -> bool:
        return False

    def set_led(self, index: int, on: bool) -> None:
        if 0 <= index < self.num_buttons:
            self.led_states[index] = on

    def press(self, index: int) -> None:
        """Simulate a physical press of button `index` (click or keypress)."""
        self.report_press(index)
