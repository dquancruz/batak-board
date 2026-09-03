# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Batak Board is a reflex-training game (inspired by the "Batak Board" arcade
trainer) built for a Raspberry Pi driving 12 physical arcade buttons, each
with an integrated LED. A desktop GUI and a browser dashboard both run the
game, show score/timers, and share a local JSON leaderboard.

## Tech stack

- **Python 3** for everything (hardware control + both UIs).
- **`gpiozero`** (preferred over raw `RPi.GPIO`) for the 12 button/LED pairs
  on the Pi — one input pin (switch) and one output pin (LED) per button.
- **`customtkinter`** for the desktop GUI.
- **`FastAPI` + WebSockets** (`uvicorn`) for the web dashboard.
- Local leaderboard persisted as JSON (no external DB).

## Architecture

Clear separation between hardware I/O and the UI layer(s) so neither view
ever blocks on pin reads, and so the same game logic drives both:

- `src/batak_board/hardware/` — `ButtonController` abstraction.
  - `gpio_controller.py`: real implementation using `gpiozero`, event-driven
    (`when_pressed` callbacks), imports `gpiozero` lazily so non-Pi machines
    don't need it installed.
  - `simulator.py`: **Simulation/Debug mode** — used automatically when no
    Raspberry Pi GPIO is available (e.g. developing on Windows/Mac). Button
    presses are driven by on-screen clicks or number keys `0`–`9`.
  - `factory.py`: picks the real or simulated controller at startup
    (override with `BATAK_FORCE_SIM=1`).
- `src/batak_board/game/` — engine/model layer (framework-agnostic, callback
  driven): difficulty rules, scoring, round/turn state, leaderboard I/O.
- `src/batak_board/ui/` — CustomTkinter desktop screens (Main Menu → Player
  Setup → Game → Results), driven purely by the game engine's callbacks.
- `src/batak_board/web/` — browser dashboard.
  - `game_server.py`: `GameServer` — the same role as `ui/app.py` (owns the
    engine/controller/leaderboard and the screen/session state machine) but
    framework-agnostic (no FastAPI/asyncio import), so it's unit tested the
    same way as `game/`.
  - `server.py`: FastAPI app; the only place that touches asyncio/WebSockets
    — drives `GameServer.tick()` in a loop and broadcasts `GameServer.state()`
    (JSON) to every connected browser.
  - `static/`: vanilla HTML/CSS/JS single-page client, no build step.

This is effectively MVC, twice over: `hardware/` + `game/` = Model/
Controller logic, shared by two Views (`ui/` and `web/`). Both views poll
the engine on a loop (`root.after()` for Tk, an `asyncio` loop for the web
server) and hardware events arrive off a thread-safe queue — never call
GPIO/gpiozero code directly from a UI callback, and never block either
loop.

## Difficulty levels

| Level  | LED window       | Round length |
|--------|-------------------|--------------|
| Easy   | Until pressed (no timeout) | 60s |
| Medium | 1.5s              | 45s |
| Hard   | 0.8s              | 30s |

A missed/expired or wrong-button press gives feedback and advances to the
next random LED; a correct press scores a point immediately.

## Theming

`theme.py` constants are `(light_hex, dark_hex)` tuples — CustomTkinter
resolves a 2-tuple against the current appearance mode automatically and
re-colors already-built widgets when `ctk.set_appearance_mode()` is called
(wired to the toggle button in `ui/app.py`). When adding a new desktop
widget, always reference a `theme.*` constant rather than a literal hex, and
never assume a widget's default text color contrasts against a custom fill
— set it explicitly (see `SegmentedChoice` in `ui/components.py`, added
because `CTkSegmentedButton` only exposes one `text_color` for both
selected/unselected chips, which can't contrast against both at once).

The web dashboard mirrors the same two palettes as CSS custom properties in
`web/static/style.css` (`:root` = dark, `:root[data-theme="light"]` =
light); `app.js` toggles `<html data-theme>` and persists the choice in
`localStorage`.

## Commands

```bash
pip install -r requirements.txt && pip install -e .   # once, per venv (src/ layout needs the editable install)
python -m batak_board.main          # desktop app (auto-detects sim vs. real GPIO)
BATAK_FORCE_SIM=1 python -m batak_board.main   # force simulation mode

pip install -r requirements-web.txt
python -m batak_board.web           # web dashboard at http://0.0.0.0:8000

pytest                              # run tests (engine/leaderboard/simulator/web; no GPIO or GUI needed)
```

## Conventions

- Keep `game/` and `web/game_server.py` importable and testable without
  `customtkinter`, `gpiozero`, or `fastapi`/`asyncio` installed — those are
  optional/UI/hardware/web concerns only.
- Any new hardware backend must implement the `ButtonController` interface
  in `hardware/base.py`.
- Comment non-obvious logic (timing thresholds, threading/queue handoffs)
  since this repo doubles as a reference implementation.
