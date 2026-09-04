"""Entry point: `python -m batak_board.main`."""

from __future__ import annotations

import logging
import os

from batak_board.ui.app import run

if __name__ == "__main__":
    # See web/__main__.py's identical setup for why: surfaces
    # batak_board.hardware.gpio_controller's per-press/per-LED logs.
    logging.basicConfig(
        level=os.environ.get("BATAK_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(name)s: %(message)s",
    )
    run()
