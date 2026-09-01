# Batak Board

A DIY reflex-training game inspired by the "Batak Board" trainer, built on a
Raspberry Pi with 10 physical arcade buttons (each with an integrated LED)
and a dark, cyberpunk-styled desktop GUI.

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
- **Simulation/Debug mode** — no Raspberry Pi? The app auto-detects this and
  lets you play with mouse clicks or the number keys `0`–`9` instead of
  physical buttons, so the UI can be developed and tested on any machine.

## Hardware

- Raspberry Pi (any model with GPIO)
- 10 arcade push buttons, each wired with:
  - one GPIO input pin for the switch
  - one GPIO output pin for the built-in LED
- Pin mapping is configured in `src/batak_board/config.py`.

## Requirements

- Python 3.9+
- `customtkinter` (GUI)
- `gpiozero` — only needed on the Raspberry Pi itself; not required when
  running in simulation mode on a dev machine

## Getting started

```bash
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt      # GUI + core deps
pip install -r requirements-pi.txt   # only on the Raspberry Pi, for GPIO

python -m batak_board.main
```

On a machine without GPIO access, the app automatically falls back to
**Simulation/Debug mode** — click the on-screen buttons or press `0`–`9` on
your keyboard to play. Force this mode explicitly with:

```bash
BATAK_FORCE_SIM=1 python -m batak_board.main
```

## Running tests

Core game logic (engine, leaderboard, simulator) is testable without a GUI
or real hardware:

```bash
pytest
```

## Project structure

```
src/batak_board/
  hardware/   # ButtonController: real GPIO impl + simulator + factory
  game/       # difficulty rules, scoring, turn state, leaderboard (JSON)
  ui/         # CustomTkinter screens: menu, player setup, game, results
  main.py     # entry point
tests/        # unit tests for game/ and hardware/simulator
```
