"""A small pixel-art mascot that idles in a corner of every screen.

Purely decorative: it never touches ``GameEngine``, ``GameSession``, or any
button/LED state -- it only *reads* the same feedback events the game
already emits (via ``react()``, called alongside ``FeedbackBanner.pulse``
in ``GameScreen``) and never drives anything back. Safe to delete this
whole module without affecting gameplay.

Same pixel-grid sprite as the web dashboard's ``pet.js`` (an ellipse mask
read out as square pixels, plus a couple of antennae), redrawn here with
plain ``tk.Canvas`` rectangles instead of ``<canvas>`` so no image asset is
needed on either side. Besides reacting to hits/misses, it randomly plays a
little scripted "quirk" scene every 15-25s while otherwise idle (offered a
lollipop and licks it, or a balloon floats up and pops) -- see QUIRKS
below. Adding a new one is just adding another named entry there.
"""

from __future__ import annotations

import math
import random
import tkinter as tk
from typing import Optional

import customtkinter as ctk

from batak_board import theme

SCALE = 10
GRID_W, GRID_H = 11, 12
# Extra canvas room beyond the body grid: above for a floating prop (the
# balloon + its string), to the right for a held one (the lollipop).
# Coordinates below can go negative (above the head) or past GRID_W-1 (to
# the right) -- `_rect` re-bases everything into canvas space. This also
# doubles as the idle bob/reaction's headroom, so an upward hop never clips.
PROP_TOP_ROWS = 10
PROP_RIGHT_COLS = 6
PAD_TOP = PROP_TOP_ROWS * SCALE
PAD_BOTTOM = 2 * SCALE
CANVAS_W = (GRID_W + PROP_RIGHT_COLS) * SCALE
CANVAS_H = GRID_H * SCALE + PAD_TOP + PAD_BOTTOM

_REACT_MS = 450
_BLINK_MIN_MS, _BLINK_MAX_MS = 2800, 5000
_QUIRK_MIN_MS, _QUIRK_MAX_MS = 15000, 25000
_BOB_TICK_MS = 60
_BOB_PERIOD_TICKS = 24  # ~1.4s per full bob cycle
_BOB_AMPLITUDE = 5
_REACT_OFFSET = 16  # px of hop (hit, up) / droop (wrong-timeout, down)


def _resolve(pair: tuple[str, str]) -> str:
    """Pick the (light, dark) theme color matching the current appearance
    mode -- unlike CTk widgets, a plain ``tk.Canvas`` doesn't auto-recolor
    when ``ctk.set_appearance_mode()`` is called, so callers re-resolve on
    every redraw / on ``refresh_theme()``."""
    return pair[1] if ctk.get_appearance_mode() == "Dark" else pair[0]


def _body_pixels() -> list[tuple[int, int]]:
    """A rounded blob: an ellipse mask on the grid (rows 0-1 left clear for
    the antennae above it)."""
    cx, cy, rx, ry = 5.0, 7.5, 5.0, 4.3
    pixels = []
    for y in range(GRID_H):
        for x in range(GRID_W):
            dx, dy = (x - cx) / rx, (y - cy) / ry
            if dx * dx + dy * dy <= 1.0:
                pixels.append((x, y))
    return pixels


BODY = _body_pixels()
ANTENNA_STALK = [(3, 1), (7, 1)]
ANTENNA_TIP = [(3, 0), (7, 0)]

EYES = {
    "open": [(3, 6), (4, 6), (3, 7), (4, 7), (6, 6), (7, 6), (6, 7), (7, 7)],
    "blink": [(3, 7), (4, 7), (6, 7), (7, 7)],
    "happy": [(3, 6), (4, 6), (6, 6), (7, 6)],
    "sad": [(4, 7), (6, 7)],
    # "startled" -- open eyes plus a row above, for the balloon pop
    "wide": [(3, 5), (4, 5), (6, 5), (7, 5), (3, 6), (4, 6), (3, 7), (4, 7), (6, 6), (7, 6), (6, 7), (7, 7)],
}
MOUTHS = {
    "neutral": [(4, 9), (5, 9), (6, 9)],
    "happy": [(3, 9), (4, 9), (5, 9), (6, 9), (7, 9)],
    "sad": [(5, 9)],
    "o": [(5, 9), (5, 10)],  # surprised
}
SPARKLE = [(0, 5), (10, 5)]
TONGUE = [(8, 9)]

INK = "#0b0e14"  # fixed dark ink for eyes/mouth so they read against any neon body fill, in both themes
STICK_COLOR = "#e8dcc0"  # lollipop stick -- fixed, doesn't need to track theme
TONGUE_COLOR = "#ff6f91"

# mood -> (body color, antenna-tip color, eye shape, mouth shape, sparkle?, hop direction)
_MOODS = {
    "idle": (theme.NEON_CYAN, theme.TEXT_MUTED, "open", "neutral", False, 0),
    "hit": (theme.NEON_GREEN, theme.NEON_YELLOW, "happy", "happy", True, -1),
    "wrong": (theme.NEON_RED, theme.TEXT_MUTED, "sad", "sad", False, 1),
    "timeout": (theme.NEON_YELLOW, theme.TEXT_MUTED, "sad", "sad", False, 1),
}


# -- idle-quirk props: small extra pixel layers drawn on top of the base
# sprite, in the same local coordinate space (negative/large values are
# fine -- see PROP_TOP_ROWS/PROP_RIGHT_COLS above). Each returns a list of
# (pixels, color) layers; `color` here is a plain hex or a theme (light,
# dark) pair, resolved at draw time same as everything else.


def _lollipop_props(dx: int) -> list[tuple[list[tuple[int, int]], object]]:
    stick = [(11 + dx, 7), (11 + dx, 8), (11 + dx, 9)]
    # a little two-tone swirl candy, checkerboarded across a 2x2 block
    return [
        (stick, STICK_COLOR),
        ([(10 + dx, 6), (11 + dx, 7)], theme.NEON_MAGENTA),
        ([(11 + dx, 6), (10 + dx, 7)], theme.NEON_YELLOW),
    ]


def _tongue_props() -> list[tuple[list[tuple[int, int]], object]]:
    return [(TONGUE, TONGUE_COLOR)]


_BALLOON_COLS = (4, 5, 6)


def _balloon_props(dy: int) -> list[tuple[list[tuple[int, int]], object]]:
    body = [(x, y + dy) for y in (-7, -6, -5) for x in _BALLOON_COLS]
    knot = (5, -4 + dy)
    string = [(5, -3 + dy), (5, -2 + dy), (5, -1 + dy)]
    return [
        (body + [knot], theme.NEON_MAGENTA),
        (string, theme.TEXT_MUTED),
    ]


def _burst_props(dy: int) -> list[tuple[list[tuple[int, int]], object]]:
    cx, cy = 5, -6 + dy
    pts = [
        (cx, cy - 2), (cx, cy + 2), (cx - 2, cy), (cx + 2, cy),
        (cx - 2, cy - 2), (cx + 2, cy - 2), (cx - 2, cy + 2), (cx + 2, cy + 2),
    ]
    return [(pts, theme.NEON_YELLOW)]


# -- idle quirks: ordered lists of (duration_ms, eyes, mouth, props) frames,
# played back-to-back by `_play_quirk()`. Body stays in the idle (cyan)
# mood throughout -- only eyes/mouth/props change per frame, and (unlike
# the idle bob/hit-hop/miss-droop) a quirk holds still rather than bobbing,
# to keep the prop positions above simple and clipping-free.
_QUIRKS = {
    "lollipop": [
        (300, "open", "neutral", _lollipop_props(4)),
        (250, "happy", "neutral", _lollipop_props(0)),
        (260, "happy", "neutral", _lollipop_props(0) + _tongue_props()),
        (220, "happy", "neutral", _lollipop_props(0)),
        (260, "happy", "neutral", _lollipop_props(0) + _tongue_props()),
        (220, "happy", "neutral", _lollipop_props(0)),
        (260, "happy", "neutral", _lollipop_props(0) + _tongue_props()),
        (280, "open", "neutral", _lollipop_props(0)),
        (300, "open", "neutral", _lollipop_props(4)),
    ],
    "balloon": [
        (280, "open", "neutral", _balloon_props(2)),
        (500, "open", "neutral", _balloon_props(0)),
        (450, "open", "neutral", _balloon_props(-1)),
        (450, "open", "neutral", _balloon_props(0)),
        (450, "open", "neutral", _balloon_props(-1)),
        (90, "wide", "o", _burst_props(-1)),
        (260, "wide", "o", []),
        (300, "open", "neutral", []),
    ],
}


class PetWidget(ctk.CTkFrame):
    """Floats above every screen, same idea as ``App``'s theme-toggle
    button. Idles with a gentle bob + occasional blink (and, every so
    often, a little scripted quirk -- see ``_QUIRKS``); ``react(kind)``
    briefly swaps its expression for a "hit"/"wrong"/"timeout" mood (a
    happy hop or a sad droop) before settling back to idle.
    """

    def __init__(self, parent, **kwargs):
        super().__init__(parent, fg_color="transparent", **kwargs)
        self.canvas = tk.Canvas(
            self,
            width=CANVAS_W,
            height=CANVAS_H,
            highlightthickness=0,
            bg=_resolve(theme.BG_PRIMARY),
        )
        self.canvas.pack()

        self._mood = "idle"
        self._bob_tick = 0
        self._react_offset = 0.0  # extra px on top of the idle bob, decaying back to 0 after a reaction
        self._run_id = 0  # bumped on every new animation; stale `after` callbacks check this and no-op
        self._bob_job: Optional[str] = None
        self._blink_job: Optional[str] = None
        self._revert_job: Optional[str] = None
        self._decay_job: Optional[str] = None
        self._quirk_job: Optional[str] = None

        self._render()
        self._bob_loop()
        self._schedule_blink()
        self._schedule_quirk()

    # -- public API ----------------------------------------------------

    def react(self, kind: str, duration_ms: int = _REACT_MS) -> None:
        """Called from ``GameScreen`` on the same hit/wrong/timeout events
        that already pulse the feedback banner. Unknown kinds are ignored
        so a future feedback kind can never raise here."""
        if kind not in _MOODS or not self.winfo_exists():
            return
        self._run_id += 1  # abort any in-flight quirk frame -- gameplay feedback wins
        self._cancel(self._blink_job)
        self._cancel(self._revert_job)
        self._cancel(self._decay_job)
        self._cancel(self._quirk_job)
        self._mood = kind
        _, _, _, _, _, hop_dir = _MOODS[kind]
        self._react_offset = hop_dir * _REACT_OFFSET  # hit (-1) hops up, wrong/timeout (+1) droop down
        self._render()
        self._decay_react_offset()
        self._revert_job = self.after(duration_ms, self._settle)

    def celebrate(self, duration_ms: int = 1800) -> None:
        """A longer happy beat for the results screen when there's a winner."""
        self.react("hit", duration_ms=duration_ms)

    def refresh_theme(self) -> None:
        """Called by ``App._toggle_theme`` -- a plain ``tk.Canvas`` doesn't
        auto-recolor the way CTk widgets do."""
        if not self.winfo_exists():
            return
        self.canvas.configure(bg=_resolve(theme.BG_PRIMARY))
        self._render()

    def destroy(self) -> None:  # pragma: no cover - defensive cleanup
        self._cancel(self._bob_job)
        self._cancel(self._blink_job)
        self._cancel(self._revert_job)
        self._cancel(self._decay_job)
        self._cancel(self._quirk_job)
        super().destroy()

    # -- mood lifecycle --------------------------------------------------

    def _settle(self) -> None:
        self._mood = "idle"
        self._render()
        self._schedule_blink()
        self._schedule_quirk()

    def _decay_react_offset(self) -> None:
        if not self.winfo_exists():
            return
        self._react_offset *= 0.6
        if abs(self._react_offset) < 0.5:
            self._react_offset = 0.0
        else:
            self._decay_job = self.after(40, self._decay_react_offset)
        self._render()

    # -- idle animation: gentle bob + occasional blink --------------------

    def _bob_loop(self) -> None:
        if not self.winfo_exists():
            return
        self._bob_tick = (self._bob_tick + 1) % _BOB_PERIOD_TICKS
        self._render()
        self._bob_job = self.after(_BOB_TICK_MS, self._bob_loop)

    def _schedule_blink(self) -> None:
        delay = random.randint(_BLINK_MIN_MS, _BLINK_MAX_MS)
        self._blink_job = self.after(delay, self._blink)

    def _blink(self) -> None:
        if self._mood != "idle" or not self.winfo_exists():
            return
        self._render(eyes_override="blink")
        self._blink_job = self.after(150, self._after_blink)

    def _after_blink(self) -> None:
        self._render()
        self._schedule_blink()

    # -- idle quirks: little scripted scenes (lollipop, balloon, ...) ------

    def _schedule_quirk(self) -> None:
        delay = random.randint(_QUIRK_MIN_MS, _QUIRK_MAX_MS)
        self._quirk_job = self.after(delay, self._start_quirk)

    def _start_quirk(self) -> None:
        if self._mood != "idle" or not self.winfo_exists():
            return
        frames = random.choice(list(_QUIRKS.values()))
        self._run_id += 1
        self._cancel(self._blink_job)
        self._play_quirk_frame(frames, 0, self._run_id)

    def _play_quirk_frame(self, frames: list, index: int, run_id: int) -> None:
        if run_id != self._run_id or not self.winfo_exists():
            return  # superseded by a react() or a later quirk
        if index >= len(frames):
            self._render()
            self._schedule_blink()
            self._schedule_quirk()
            return
        duration_ms, eyes, mouth, props = frames[index]
        self._render_quirk_frame(eyes, mouth, props)
        self._quirk_job = self.after(duration_ms, lambda: self._play_quirk_frame(frames, index + 1, run_id))

    # -- drawing ---------------------------------------------------------

    def _bob_offset(self) -> float:
        phase = self._bob_tick / _BOB_PERIOD_TICKS
        return -_BOB_AMPLITUDE * abs(math.sin(math.pi * phase))

    def _render(self, eyes_override: Optional[str] = None) -> None:
        if not self.winfo_exists():
            return
        body, tip, eyes_shape, mouth_shape, sparkle, _ = _MOODS[self._mood]
        dy = PAD_TOP + self._bob_offset() + self._react_offset

        c = self.canvas
        c.delete("all")
        body_color = _resolve(body)
        for x, y in BODY + ANTENNA_STALK:
            self._rect(x, y, dy, body_color)
        tip_color = _resolve(tip)
        for x, y in ANTENNA_TIP:
            self._rect(x, y, dy, tip_color)
        for x, y in EYES[eyes_override or eyes_shape]:
            self._rect(x, y, dy, INK)
        for x, y in MOUTHS[mouth_shape]:
            self._rect(x, y, dy, INK)
        if sparkle:
            sparkle_color = _resolve(theme.NEON_YELLOW)
            for x, y in SPARKLE:
                self._rect(x, y, dy, sparkle_color)

    def _render_quirk_frame(self, eyes: str, mouth: str, props: list) -> None:
        """Like ``_render()``, but always the idle body/colors plus an
        explicit eyes/mouth/props layer -- and no bob, so the hand-placed
        prop coordinates above never need to account for it."""
        if not self.winfo_exists():
            return
        body, tip, _, _, _, _ = _MOODS["idle"]
        dy = float(PAD_TOP)

        c = self.canvas
        c.delete("all")
        body_color = _resolve(body)
        for x, y in BODY + ANTENNA_STALK:
            self._rect(x, y, dy, body_color)
        tip_color = _resolve(tip)
        for x, y in ANTENNA_TIP:
            self._rect(x, y, dy, tip_color)
        for x, y in EYES[eyes]:
            self._rect(x, y, dy, INK)
        for x, y in MOUTHS[mouth]:
            self._rect(x, y, dy, INK)
        for pixels, color in props:
            resolved = _resolve(color) if isinstance(color, tuple) else color
            for x, y in pixels:
                self._rect(x, y, dy, resolved)

    def _rect(self, x: int, y: int, dy: float, color: str) -> None:
        top = y * SCALE + dy
        self.canvas.create_rectangle(x * SCALE, top, x * SCALE + SCALE, top + SCALE, fill=color, outline="")

    def _cancel(self, job_id: Optional[str]) -> None:
        if job_id is not None and self.winfo_exists():
            self.after_cancel(job_id)
