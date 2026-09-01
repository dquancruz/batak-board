"""Shared, framework-agnostic game/session state for the web dashboard.

Mirrors what `ui/app.py` + its screens do for the desktop GUI, but as a
single server-side session broadcast to every connected browser instead of
Tkinter widgets on one screen -- multiple devices can watch the same round
live. Deliberately has no FastAPI/asyncio import: `web/server.py` is the
only module that knows about WebSockets, which keeps this class unit
testable like the rest of `game/` and `hardware/`.
"""

from __future__ import annotations

from typing import Callable, Optional

from batak_board.config import DIFFICULTY_SETTINGS, Difficulty, GameMode
from batak_board.game.engine import GameEngine
from batak_board.game.leaderboard import Leaderboard
from batak_board.game.models import GameSession, Player
from batak_board.hardware.base import ButtonController
from batak_board.hardware.factory import create_button_controller

Screen = str  # "menu" | "player_setup" | "game" | "results"


class GameServer:
    def __init__(self, controller: Optional[ButtonController] = None, leaderboard: Optional[Leaderboard] = None):
        self.controller = controller or create_button_controller()
        self.controller.setup()
        self.engine = GameEngine(self.controller)
        self.leaderboard = leaderboard or Leaderboard()

        self.selected_mode: GameMode = GameMode.SINGLE
        self.selected_difficulty: Difficulty = Difficulty.EASY
        self.session: Optional[GameSession] = None

        self.screen: Screen = "menu"
        self.awaiting_ready = False  # 2P "Ready, Player 2!" overlay is showing
        self.time_left = 0.0
        self.round_duration = 0.0
        self.last_feedback: Optional[str] = None  # "hit" | "wrong" | "timeout"
        self.feedback_seq = 0  # bumped on every feedback event so the client
        #                        can detect a repeat (e.g. two hits in a row)

        # Called (synchronously) with the fresh state dict after every
        # engine tick and every handled command. The web layer subscribes
        # here to push updates out over WebSockets.
        self.on_state_change: Optional[Callable[[dict], None]] = None

        self.engine.on_time_left_change = self._on_time_left_change
        self.engine.on_feedback = self._on_feedback
        self.engine.on_round_end = self._on_round_end
        # on_score_change / on_active_button_change need no handler here --
        # state() always reads current score/active_button straight off the
        # engine and session, so there's nothing extra to cache.

    # -- driven by the web layer's tick loop -----------------------------

    def tick(self) -> None:
        self.engine.tick()
        self._notify()

    def teardown(self) -> None:
        self.controller.teardown()

    # -- commands from a connected browser -------------------------------

    def handle_command(self, message: dict) -> None:
        action = message.get("action")
        handler = {
            "set_mode": self._set_mode,
            "set_difficulty": self._set_difficulty,
            "goto_player_setup": self._goto_player_setup,
            "back_to_menu": self._back_to_menu,
            "start_game": self._start_game,
            "ready_next": self._ready_next,
            "press_button": self._press_button,
            "restart": self._restart,
        }.get(action)
        if handler:
            handler(message)
        self._notify()

    def _set_mode(self, message: dict) -> None:
        if self.screen != "menu":
            return
        try:
            self.selected_mode = GameMode(message.get("value"))
        except ValueError:
            pass

    def _set_difficulty(self, message: dict) -> None:
        if self.screen != "menu":
            return
        try:
            self.selected_difficulty = Difficulty(message.get("value"))
        except ValueError:
            pass

    def _goto_player_setup(self, _message: dict) -> None:
        if self.screen == "menu":
            self.screen = "player_setup"

    def _back_to_menu(self, _message: dict) -> None:
        if self.screen == "player_setup":
            self.screen = "menu"

    def _start_game(self, message: dict) -> None:
        if self.screen != "player_setup":
            return
        raw_names = message.get("names") or []
        expected = 2 if self.selected_mode == GameMode.TWO_PLAYER else 1
        players = [
            Player(name=(raw_names[i].strip() if i < len(raw_names) and raw_names[i].strip() else f"Player {i + 1}"))
            for i in range(expected)
        ]
        self.session = GameSession(mode=self.selected_mode, difficulty=self.selected_difficulty, players=players)
        self.screen = "game"
        self._begin_turn()

    def _ready_next(self, _message: dict) -> None:
        if self.awaiting_ready:
            self._begin_turn()

    def _press_button(self, message: dict) -> None:
        if self.screen != "game" or self.awaiting_ready:
            return
        # In Simulation/Debug mode this is the only way to press a button;
        # on real hardware it doubles as a remote-control input alongside
        # the physical buttons (handy for demoing without touching the board).
        index = message.get("index")
        if isinstance(index, int):
            self.controller.report_press(index)

    def _restart(self, _message: dict) -> None:
        self.session = None
        self.screen = "menu"
        self.awaiting_ready = False
        self.last_feedback = None

    # -- turn flow ---------------------------------------------------

    def _begin_turn(self) -> None:
        assert self.session is not None
        self.awaiting_ready = False
        settings = DIFFICULTY_SETTINGS[self.session.difficulty]
        self.round_duration = settings.round_duration
        self.time_left = settings.round_duration
        self.engine.start_round(self.session.active_player, settings)

    def _on_time_left_change(self, time_left: float) -> None:
        self.time_left = time_left

    def _on_feedback(self, kind: str) -> None:
        self.last_feedback = kind
        self.feedback_seq += 1

    def _on_round_end(self, _player: Player) -> None:
        assert self.session is not None
        if self.session.is_two_player and self.session.active_player_index == 0:
            self.session.advance_player()
            self.awaiting_ready = True
        else:
            for player in self.session.players:
                self.leaderboard.add(player.name, player.score, self.session.difficulty)
            self.screen = "results"

    # -- state serialization ------------------------------------------

    def state(self) -> dict:
        session = self.session
        players = []
        winner_name: Optional[str] = None
        tie = False
        if session:
            for i, player in enumerate(session.players):
                players.append(
                    {
                        "name": player.name,
                        "score": player.score,
                        "hits": player.hits,
                        "misses": player.misses,
                        "active": i == session.active_player_index,
                    }
                )
            if self.screen == "results" and session.is_two_player:
                winner = session.winner()
                winner_name = winner.name if winner else None
                tie = winner is None

        return {
            "screen": self.screen,
            "mode": self.selected_mode.value,
            "difficulty": self.selected_difficulty.value,
            "is_hardware": self.controller.is_hardware,
            "players": players,
            "active_button": self.engine.active_button,
            "time_left": round(self.time_left, 2),
            "round_duration": self.round_duration,
            "awaiting_ready": self.awaiting_ready,
            "next_player_name": session.active_player.name if (session and self.awaiting_ready) else None,
            "last_feedback": self.last_feedback,
            "feedback_seq": self.feedback_seq,
            "winner_name": winner_name,
            "tie": tie,
            "leaderboard": [
                {"name": e.name, "score": e.score, "difficulty": e.difficulty} for e in self.leaderboard.top()
            ],
        }

    def _notify(self) -> None:
        if self.on_state_change:
            self.on_state_change(self.state())
