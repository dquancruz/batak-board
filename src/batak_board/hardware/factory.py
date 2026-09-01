"""Picks the real GPIO controller on a Raspberry Pi, the simulator elsewhere."""

from __future__ import annotations

import os
import platform
from pathlib import Path

from batak_board.hardware.base import ButtonController
from batak_board.hardware.simulator import SimulatedButtonController


def _looks_like_raspberry_pi() -> bool:
    if platform.system() != "Linux":
        return False
    try:
        model = Path("/proc/device-tree/model").read_text(errors="ignore").lower()
    except OSError:
        return False
    return "raspberry pi" in model


def create_button_controller() -> ButtonController:
    """Return a real :class:`GpioButtonController` on a Pi with gpiozero
    available, or a :class:`SimulatedButtonController` otherwise.

    Set ``BATAK_FORCE_SIM=1`` to force Simulation/Debug mode even on a Pi
    (handy for UI development/demos without wiring buttons up).
    """
    if os.environ.get("BATAK_FORCE_SIM") == "1":
        return SimulatedButtonController()

    if _looks_like_raspberry_pi():
        try:
            from batak_board.hardware.gpio_controller import GpioButtonController

            return GpioButtonController()
        except RuntimeError:
            pass  # looks like a Pi but gpiozero isn't installed - fall back

    return SimulatedButtonController()
