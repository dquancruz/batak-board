"""Local JSON-backed leaderboard."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path

from batak_board.config import LEADERBOARD_MAX_ENTRIES, LEADERBOARD_PATH, Difficulty


@dataclass(frozen=True)
class ScoreEntry:
    name: str
    score: int
    difficulty: str
    timestamp: str

    @classmethod
    def new(cls, name: str, score: int, difficulty: Difficulty) -> "ScoreEntry":
        return cls(
            name=name,
            score=score,
            difficulty=difficulty.value,
            timestamp=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        )


class Leaderboard:
    """Reads/writes a JSON file of :class:`ScoreEntry` rows, best score first.

    Corrupt or missing files are treated as an empty leaderboard rather than
    raising, so a bad `data/leaderboard.json` never blocks the app.
    """

    def __init__(self, path: Path | str = LEADERBOARD_PATH, max_entries: int = LEADERBOARD_MAX_ENTRIES):
        self.path = Path(path)
        self.max_entries = max_entries
        self._entries: list[ScoreEntry] = self._load()

    def _load(self) -> list[ScoreEntry]:
        if not self.path.exists():
            return []
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return []
        entries = []
        for row in raw:
            try:
                entries.append(ScoreEntry(**row))
            except TypeError:
                continue  # skip malformed rows instead of failing the whole file
        return entries

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = [asdict(entry) for entry in self._entries]
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    def add(self, name: str, score: int, difficulty: Difficulty) -> ScoreEntry:
        entry = ScoreEntry.new(name=name or "Player", score=score, difficulty=difficulty)
        self._entries.append(entry)
        self._entries.sort(key=lambda e: e.score, reverse=True)
        del self._entries[self.max_entries :]
        self._save()
        return entry

    def top(self, n: int | None = None) -> list[ScoreEntry]:
        return list(self._entries[: n or self.max_entries])
