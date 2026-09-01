# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

Batak Board is a reflex-training game (inspired by the "Batak Board" arcade
trainer) built for a Raspberry Pi driving 10 physical arcade buttons, each
with an integrated LED. A companion desktop GUI runs the game, shows score
and timers, and stores a local leaderboard.

## Tech stack

- **Python 3** for everything (hardware control + GUI).
- **`gpiozero`** (preferred over raw `RPi.GPIO`) for the 10 button/LED pairs
  on the Pi — one input pin (switch) and one output pin (LED) per button.
- **`customtkinter`** for the GUI (dark, modern look).
- Local leaderboard persisted as JSON (no external DB).

## Architecture

Clear separation between hardware I/O and UI so the GUI never blocks on pin
reads:

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
- `src/batak_board/ui/` — CustomTkinter screens (Main Menu → Player Setup →
  Game → Results), driven purely by the game engine's callbacks.

This is effectively MVC: `hardware/` + `game/` = Model/Controller logic,
`ui/` = View. The GUI polls the engine via a `root.after()` loop and reads
hardware events off a thread-safe queue — never call GPIO/gpiozero code
directly from a UI callback and never block the Tk main loop.

## Difficulty levels

| Level  | LED window       | Round length |
|--------|-------------------|--------------|
| Easy   | Until pressed (no timeout) | 60s |
| Medium | 1.5s              | 45s |
| Hard   | 0.8s              | 30s |

A missed/expired or wrong-button press gives feedback and advances to the
next random LED; a correct press scores a point immediately.

## Commands

```bash
pip install -r requirements.txt && pip install -e .   # once, per venv (src/ layout needs the editable install)
python -m batak_board.main          # run the app (auto-detects sim vs. real GPIO)
BATAK_FORCE_SIM=1 python -m batak_board.main   # force simulation mode
pytest                              # run tests (engine/leaderboard/simulator; no GPIO or GUI needed)
```

## Conventions

- Keep `game/` importable and testable without `customtkinter` or `gpiozero`
  installed — those are optional/UI/hardware concerns only.
- Any new hardware backend must implement the `ButtonController` interface
  in `hardware/base.py`.
- Comment non-obvious logic (timing thresholds, threading/queue handoffs)
  since this repo doubles as a reference implementation.
