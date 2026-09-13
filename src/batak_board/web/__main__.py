"""`python -m batak_board.web` -- run the browser dashboard.

Binds to 0.0.0.0 by default so any device on the same network can open
http://<pi-ip-or-hostname>:8000/ . Override with BATAK_WEB_HOST /
BATAK_WEB_PORT.
"""

from __future__ import annotations

import logging
import os

import uvicorn


def main() -> None:
    # INFO here surfaces batak_board.hardware.gpio_controller's per-press/
    # per-LED logs (bench-testing wiring) alongside uvicorn's own request
    # logs, without needing a separate logging.conf. Quiet with
    # BATAK_LOG_LEVEL=WARNING if it's too noisy for a long-running kiosk.
    logging.basicConfig(
        level=os.environ.get("BATAK_LOG_LEVEL", "INFO"),
        format="%(asctime)s %(name)s: %(message)s",
    )
    host = os.environ.get("BATAK_WEB_HOST", "0.0.0.0")
    port = int(os.environ.get("BATAK_WEB_PORT", "8000"))
    uvicorn.run("batak_board.web.server:app", host=host, port=port)


if __name__ == "__main__":
    main()
