"""Main application window: screen stack + shared session state.

The View layer talks to the game logic only through :class:`GameEngine`
callbacks and the :class:`ButtonController` interface -- it never imports
gpiozero, and never blocks on hardware I/O (the engine's `tick()` is driven
by a `root.after()` loop, keeping the UI responsive).
"""

from __future__ import annotations

from typing import Optional

import customtkinter as ctk

from batak_board import theme
from batak_board.config import ENGINE_TICK_INTERVAL, Difficulty, GameMode
from batak_board.game.engine import GameEngine
from batak_board.game.leaderboard import Leaderboard
from batak_board.game.models import GameSession, Player
from batak_board.hardware.factory import create_button_controller

WINDOW_TITLE = "BATAK BOARD"


class App(ctk.CTk):
    def __init__(self) -> None:
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("dark-blue")

        self.title(WINDOW_TITLE)
        self.geometry("1100x740")
        self.minsize(900, 620)
        self.configure(fg_color=theme.BG_PRIMARY)

        self.controller = create_button_controller()
        self.controller.setup()
        self.engine = GameEngine(self.controller)
        self.leaderboard = Leaderboard()

        # Selections carried between screens before a GameSession exists.
        self.selected_mode: GameMode = GameMode.SINGLE
        self.selected_difficulty: Difficulty = Difficulty.EASY
        self.session: Optional[GameSession] = None

        if not self.controller.is_hardware:
            self._bind_simulated_keys()

        container = ctk.CTkFrame(self, fg_color=theme.BG_PRIMARY)
        container.pack(fill="both", expand=True)
        self._frames: dict[str, ctk.CTkFrame] = {}
        self._build_screens(container)
        self.show_screen("main_menu")

        # Floats above every screen (created after `container`, so it stacks
        # on top) and is available regardless of which screen is showing.
        self._appearance_mode = "dark"
        self.theme_toggle = ctk.CTkButton(
            self,
            text="☀ LIGHT",
            width=120,
            height=36,
            corner_radius=18,
            font=theme.FONT_LABEL,
            fg_color=theme.BG_SURFACE_ALT,
            hover_color=theme.BORDER,
            text_color=theme.TEXT_PRIMARY,
            command=self._toggle_theme,
        )
        self.theme_toggle.place(relx=1.0, rely=0.0, x=-16, y=16, anchor="ne")

        # Purely decorative mascot, floats above every screen just like the
        # theme toggle. It only ever reads feedback events (see
        # `GameScreen._on_feedback`) -- deleting `ui/pet.py` and this block
        # would not change any gameplay behavior.
        from batak_board.ui.pet import PetWidget

        self.pet = PetWidget(self)
        self.pet.place(relx=0.0, rely=0.0, x=16, y=16, anchor="nw")

        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self._tick_loop()

    def _toggle_theme(self) -> None:
        self._appearance_mode = "light" if self._appearance_mode == "dark" else "dark"
        ctk.set_appearance_mode(self._appearance_mode)
        self.theme_toggle.configure(text="\U0001f319 DARK" if self._appearance_mode == "light" else "☀ LIGHT")
        self.pet.refresh_theme()

    # -- setup -------------------------------------------------------

    def _bind_simulated_keys(self) -> None:
        """Number keys 0-9 press buttons 0-9 in Simulation/Debug mode; with
        12 buttons on the board, the two beyond the digit keys are bound to
        `-` and `=` (the next two keys along a standard top-row keyboard)."""
        for digit in range(10):
            self.bind(f"<Key-{digit}>", lambda _event, i=digit: self.controller.press(i))
        self.bind("<Key-minus>", lambda _event: self.controller.press(10))
        self.bind("<Key-equal>", lambda _event: self.controller.press(11))

    def _build_screens(self, container: ctk.CTkFrame) -> None:
        # Imported here (not at module scope) to avoid a circular import,
        # since each screen module imports `App` only for type hints.
        from batak_board.ui.screens.game_screen import GameScreen
        from batak_board.ui.screens.main_menu import MainMenuScreen
        from batak_board.ui.screens.player_setup import PlayerSetupScreen
        from batak_board.ui.screens.results_screen import ResultsScreen

        for name, screen_cls in (
            ("main_menu", MainMenuScreen),
            ("player_setup", PlayerSetupScreen),
            ("game", GameScreen),
            ("results", ResultsScreen),
        ):
            frame = screen_cls(container, self)
            frame.place(relx=0, rely=0, relwidth=1, relheight=1)
            self._frames[name] = frame

    # -- navigation ----------------------------------------------------

    def show_screen(self, name: str) -> None:
        frame = self._frames[name]
        frame.tkraise()
        on_show = getattr(frame, "on_show", None)
        if callable(on_show):
            on_show()

    def start_new_game(self, player_names: list[str]) -> None:
        """Called by PlayerSetupScreen once names are confirmed."""
        players = [Player(name=name.strip() or f"Player {i + 1}") for i, name in enumerate(player_names)]
        self.session = GameSession(mode=self.selected_mode, difficulty=self.selected_difficulty, players=players)
        self.show_screen("game")

    # -- engine tick loop -----------------------------------------------

    def _tick_loop(self) -> None:
        self.engine.tick()
        self.after(int(ENGINE_TICK_INTERVAL * 1000), self._tick_loop)

    def _on_close(self) -> None:
        self.controller.teardown()
        self.destroy()


def run() -> None:
    App().mainloop()
