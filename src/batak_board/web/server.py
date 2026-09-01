"""FastAPI app: serves the dashboard page and pushes live game state to
every connected browser over a WebSocket.

The tick loop and every WebSocket handler here run on the same asyncio
event loop/thread, so `GameServer.on_state_change` can schedule a broadcast
with a plain `asyncio.create_task` -- no cross-thread handoff is needed for
state pushed *out*. The one path that does cross threads is a press event
arriving from real GPIO hardware (gpiozero's own callback thread), and
that's handled by `ButtonController`'s thread-safe queue, same as the
desktop app.
"""

from __future__ import annotations

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from batak_board.config import ENGINE_TICK_INTERVAL
from batak_board.web.game_server import GameServer

STATIC_DIR = Path(__file__).resolve().parent / "static"


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    def add(self, websocket: WebSocket) -> None:
        self._connections.add(websocket)

    def remove(self, websocket: WebSocket) -> None:
        self._connections.discard(websocket)

    async def broadcast(self, payload: str) -> None:
        dead = []
        for websocket in list(self._connections):
            try:
                await websocket.send_text(payload)
            except Exception:
                dead.append(websocket)
        for websocket in dead:
            self._connections.discard(websocket)


manager = ConnectionManager()
game_server = GameServer()
game_server.on_state_change = lambda state: asyncio.create_task(manager.broadcast(json.dumps(state)))


async def _tick_loop() -> None:
    while True:
        game_server.tick()
        await asyncio.sleep(ENGINE_TICK_INTERVAL)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    tick_task = asyncio.create_task(_tick_loop())
    try:
        yield
    finally:
        tick_task.cancel()
        game_server.teardown()


app = FastAPI(title="Batak Board", lifespan=lifespan)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    manager.add(websocket)
    await websocket.send_text(json.dumps(game_server.state()))  # initial snapshot
    try:
        while True:
            message = await websocket.receive_json()
            game_server.handle_command(message)
    except WebSocketDisconnect:
        pass
    finally:
        manager.remove(websocket)


# Registered after /ws so the websocket route is matched first; this mount
# serves index.html, style.css, and app.js from web/static/.
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
