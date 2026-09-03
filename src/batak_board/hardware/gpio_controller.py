"""Real Raspberry Pi hardware backend, built on ``gpiozero``.

Each of the 12 buttons has an input pin (switch) and an output pin (LED),
mapped in :data:`batak_board.config.BUTTON_PIN_MAP`. ``gpiozero`` is only
imported inside :meth:`__init__` so this module can be imported on machines
without it installed (e.g. Windows/macOS dev boxes) -- they simply can't
instantiate :class:`GpioButtonController`.
"""

from __future__ import annotations

from batak_board.config import BUTTON_PIN_MAP
from batak_board.hardware.base import ButtonController


class GpioButtonController(ButtonController):
    def __init__(self, pin_map: dict[int, tuple[int, int]] | None = None) -> None:
        super().__init__()
        try:
            from gpiozero import LED, Button
        except ImportError as exc:  # pragma: no cover - only hit off a Pi
            raise RuntimeError(
                "gpiozero is required for real hardware mode. Install it with "
                "'pip install -r requirements-pi.txt' on the Raspberry Pi, or "
                "run with BATAK_FORCE_SIM=1 to use Simulation/Debug mode instead."
            ) from exc

        self._pin_map = pin_map or BUTTON_PIN_MAP
        self._buttons: dict[int, "Button"] = {}
        self._leds: dict[int, "LED"] = {}
        for index, (switch_pin, led_pin) in self._pin_map.items():
            button = Button(switch_pin, pull_up=True, bounce_time=0.05)
            button.when_pressed = self._make_handler(index)
            self._buttons[index] = button
            self._leds[index] = LED(led_pin)

    def _make_handler(self, index: int):
        # gpiozero calls this with no arguments on its own event thread;
        # report_press() is queue-based and safe to call from there.
        def _handler() -> None:
            self.report_press(index)

        return _handler

    @property
    def is_hardware(self) -> bool:
        return True

    def set_led(self, index: int, on: bool) -> None:
        led = self._leds.get(index)
        if led is None:
            return
        if on:
            led.on()
        else:
            led.off()

    def teardown(self) -> None:
        for button in self._buttons.values():
            button.close()
        for led in self._leds.values():
            led.close()
