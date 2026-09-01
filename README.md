# Batak Board

A DIY reflex-training game inspired by the "Batak Board" trainer, built on a
Raspberry Pi with 10 physical arcade buttons (each with an integrated LED),
a dark/light neon-styled desktop GUI, and a browser dashboard so other
devices on the network can watch or play too.

The board lights up a random button; hit it before it goes out to score a
point and light the next one. Play solo or pass-the-controller with a
friend, then check the local leaderboard.

## Features

- **1 or 2 player modes** — in 2-player mode, players take turns with a
  clear "Turn of: [Name]" indicator and a "Ready, Player 2!" screen between
  turns.
- **3 difficulty levels**:
  | Level  | LED stays lit for  | Round length |
  |--------|--------------------|--------------|
  | Easy   | Until pressed      | 60s |
  | Medium | 1.5s               | 45s |
  | Hard   | 0.8s               | 30s |
- **Live game screen** — big scoreboard, countdown/progress bar, and a
  visual grid mirroring the 10 physical buttons.
- **Results screen** — score breakdown, animated winner announcement (2P),
  and a local JSON leaderboard of best scores.
- **Light/dark theme toggle** — both the desktop app and the web dashboard
  default to the dark cyberpunk look with a one-click switch to a bright
  theme; each view remembers your choice.
- **Web dashboard** — run `python -m batak_board.web` and open
  `http://<pi-ip>:8000` from any phone/laptop on the network to watch the
  round live or play remotely; state is pushed to every connected browser
  over a WebSocket. See [Web dashboard](#web-dashboard) below.
- **Simulation/Debug mode** — no Raspberry Pi? The app auto-detects this and
  lets you play with mouse clicks or the number keys `0`–`9` (desktop) or
  on-screen taps (web) instead of physical buttons, so the UI can be
  developed and tested on any machine.

## Hardware

- Raspberry Pi (any model with GPIO)
- 10 arcade push buttons, each wired with:
  - one GPIO input pin for the switch
  - one GPIO output pin for the built-in LED
- Pin mapping is configured in `src/batak_board/config.py`.

## Requirements

- Python 3.9+
- `customtkinter` (desktop GUI)
- `fastapi` + `uvicorn` — only needed for the web dashboard
- `gpiozero` — only needed on the Raspberry Pi itself; not required when
  running in simulation mode on a dev machine

## Getting started

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt      # GUI + core deps
pip install -r requirements-web.txt  # only if you want the web dashboard
pip install -r requirements-pi.txt   # only on the Raspberry Pi, for GPIO
pip install -e .                     # makes the batak_board package importable

python -m batak_board.main
```

The `pip install -e .` step is required — the code lives under `src/`, so
without it Python can't find the `batak_board` package and `python -m
batak_board.main` fails with `ModuleNotFoundError`.

On a machine without GPIO access, the app automatically falls back to
**Simulation/Debug mode** — click the on-screen buttons or press `0`–`9` on
your keyboard to play. Force this mode explicitly with:

```bash
# macOS/Linux
BATAK_FORCE_SIM=1 python -m batak_board.main

# Windows PowerShell
$env:BATAK_FORCE_SIM=1; python -m batak_board.main
```

## Web dashboard

The desktop app only ever renders to whatever screen it's running on. To
watch or play from another device (phone, laptop) over the network:

```bash
pip install -r requirements-web.txt
python -m batak_board.web
```

Then open `http://<the-pi's-ip-or-hostname>:8000` in a browser on any
device on the same network. Every connected browser sees the same live game
state (score, timer, lit button, results, leaderboard) pushed over a
WebSocket; any of them can also drive the menu/player-setup/round flow, so
one board can be watched from several screens at once.

- The on-screen button grid is clickable in Simulation/Debug mode, and also
  works as a remote-control input alongside the real hardware (handy for
  demoing without touching the physical board).
- Bind address/port default to `0.0.0.0:8000`; override with
  `BATAK_WEB_HOST` / `BATAK_WEB_PORT`.
- This can run at the same time as the desktop app (they share the same
  hardware controller only if launched from the same process — normally
  you'd run one or the other, or the web dashboard alone on a headless Pi).

## Running tests

Core game logic (engine, leaderboard, simulator, web session state) is
testable without a GUI, browser, or real hardware:

```bash
pytest
```

## Project structure

```
src/batak_board/
  hardware/   # ButtonController: real GPIO impl + simulator + factory
  game/       # difficulty rules, scoring, turn state, leaderboard (JSON)
  ui/         # CustomTkinter desktop screens: menu, player setup, game, results
  web/        # FastAPI + WebSocket dashboard (game_server.py + static/ SPA)
  main.py     # desktop entry point
tests/        # unit tests for game/, hardware/simulator, web/game_server
```
