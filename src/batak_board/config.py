"""
Central configuration: button count, GPIO pin mapping, difficulty tuning,
and file paths. Kept dependency-free (no gpiozero/customtkinter imports)
so it can be imported from anywhere, including tests.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path

# --------------------------------------------------------------------------
# Board layout
# --------------------------------------------------------------------------

NUM_BUTTONS = 12

# BCM pin numbers for each of the 12 buttons: (switch_input_pin, led_output_pin).
# Adjust to match your wiring. Only used by the real GPIO controller.
BUTTON_PIN_MAP: dict[int, tuple[int, int]] = {
    0: (5, 6),
    1: (13, 19),
    2: (26, 21),
    3: (20, 16),
    4: (12, 25),
    5: (24, 23),
    6: (18, 15),
    7: (14, 4),
    8: (17, 27),
    9: (22, 10),
    10: (9, 11),
    11: (8, 7),
}

# --------------------------------------------------------------------------
# Difficulty
# --------------------------------------------------------------------------


class Difficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


@dataclass(frozen=True)
class DifficultySettings:
    """Tuning for one difficulty level.

    button_timeout: how long (seconds) a lit button stays on before it
        counts as a miss and a new one is lit. ``None`` means it stays lit
        until pressed (no per-button timeout) -- Easy mode.
    round_duration: total length (seconds) of a single player's round.
    """

    label: str
    button_timeout: float | None
    round_duration: float


DIFFICULTY_SETTINGS: dict[Difficulty, DifficultySettings] = {
    Difficulty.EASY: DifficultySettings("Easy", button_timeout=None, round_duration=60.0),
    Difficulty.MEDIUM: DifficultySettings("Medium", button_timeout=1.5, round_duration=45.0),
    Difficulty.HARD: DifficultySettings("Hard", button_timeout=0.8, round_duration=30.0),
}

# --------------------------------------------------------------------------
# Game modes
# --------------------------------------------------------------------------


class GameMode(str, Enum):
    SINGLE = "single"
    TWO_PLAYER = "two_player"


# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
LEADERBOARD_PATH = DATA_DIR / "leaderboard.json"
LEADERBOARD_MAX_ENTRIES = 10

# --------------------------------------------------------------------------
# Timing
# --------------------------------------------------------------------------

# How often (seconds) the UI polls the engine/hardware queue.
ENGINE_TICK_INTERVAL = 0.05

# How long (seconds) the web dashboard holds before a round's timer/LEDs go
# live, to cover its Fase 2 "entrada al juego" sequence (menu-exit + grid
# entrance + 3-2-1-¡YA! countdown -- see prompt-animaciones-batak.md). The
# round genuinely doesn't start until this elapses (see GameServer's
# awaiting_intro), so the on-screen countdown is never a lie the physical
# LED/timeout contradicts underneath. Keep in sync with the total of
# anim.js's DURATIONS.intro / DELAYS.intro constants. Desktop app has no
# such intro; this is web-only.
ROUND_INTRO_DURATION = 2.6
