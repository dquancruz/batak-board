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

    Set ``BATAK_REQUIRE_HW=1`` to do the opposite: refuse to silently fall
    back to Simulation/Debug mode and raise instead. Use this on a deployed
    kiosk Pi so a missing ``gpiozero``/pin-factory-backend install (or any other
    reason real hardware couldn't be set up) fails loudly at startup
    instead of quietly serving a UI whose buttons/LEDs don't do anything.
    """
    if os.environ.get("BATAK_FORCE_SIM") == "1":
        return SimulatedButtonController()

    require_hw = os.environ.get("BATAK_REQUIRE_HW") == "1"

    if _looks_like_raspberry_pi():
        try:
            from batak_board.hardware.gpio_controller import GpioButtonController

            return GpioButtonController()
        except RuntimeError:
            if require_hw:
                raise
            pass  # looks like a Pi but gpiozero isn't installed - fall back
    elif require_hw:
        raise RuntimeError(
            "BATAK_REQUIRE_HW=1 is set but this doesn't look like a Raspberry "
            "Pi (/proc/device-tree/model didn't report one) -- refusing to "
            "silently fall back to Simulation/Debug mode."
        )

    return SimulatedButtonController()
