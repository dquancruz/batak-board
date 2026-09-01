"""Plain data models shared by the engine, leaderboard, and UI."""

from __future__ import annotations

from dataclasses import dataclass, field

from batak_board.config import Difficulty, GameMode


@dataclass
class Player:
    name: str
    score: int = 0
    hits: int = 0
    misses: int = 0


@dataclass
class GameSession:
    """State for a full game: mode, difficulty and the participating players."""

    mode: GameMode
    difficulty: Difficulty
    players: list[Player] = field(default_factory=list)
    active_player_index: int = 0

    @property
    def active_player(self) -> Player:
        return self.players[self.active_player_index]

    @property
    def is_two_player(self) -> bool:
        return self.mode == GameMode.TWO_PLAYER

    def advance_player(self) -> bool:
        """Move to the next player's turn. Returns False if the game is over."""
        if self.active_player_index + 1 >= len(self.players):
            return False
        self.active_player_index += 1
        return True

    def winner(self) -> Player | None:
        """Highest score wins; ``None`` for a tie or single-player mode."""
        if not self.is_two_player or len(self.players) < 2:
            return None
        p1, p2 = self.players[0], self.players[1]
        if p1.score == p2.score:
            return None
        return p1 if p1.score > p2.score else p2
