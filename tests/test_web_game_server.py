from batak_board.hardware.simulator import SimulatedButtonController
from batak_board.web.game_server import GameServer


def make_server(tmp_path):
    from batak_board.game.leaderboard import Leaderboard

    controller = SimulatedButtonController()
    leaderboard = Leaderboard(path=tmp_path / "leaderboard.json")
    return GameServer(controller=controller, leaderboard=leaderboard), controller


def skip_intro(server):
    """Fast-forward past the Fase 2 entrance/countdown hold (awaiting_intro),
    the same way other tests force a round to time out via `_round_start`."""
    assert server.awaiting_intro is True
    server._intro_start -= 999
    server.tick()
    assert server.awaiting_intro is False


def test_initial_state_is_menu(tmp_path):
    server, _ = make_server(tmp_path)
    state = server.state()
    assert state["screen"] == "menu"
    assert state["mode"] == "single"
    assert state["difficulty"] == "easy"
    assert state["players"] == []


def test_set_mode_and_difficulty_only_apply_on_menu_screen(tmp_path):
    server, _ = make_server(tmp_path)
    server.handle_command({"action": "set_mode", "value": "two_player"})
    server.handle_command({"action": "set_difficulty", "value": "hard"})
    state = server.state()
    assert state["mode"] == "two_player"
    assert state["difficulty"] == "hard"

    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "set_difficulty", "value": "easy"})  # ignored, wrong screen
    assert server.state()["difficulty"] == "hard"


def test_single_player_full_round_reaches_results_and_leaderboard(tmp_path):
    server, controller = make_server(tmp_path)
    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "start_game", "names": ["Solo"]})

    state = server.state()
    assert state["screen"] == "game"
    assert state["awaiting_intro"] is True  # Fase 2 countdown holds the round before it goes live
    assert server.engine.is_running is False

    skip_intro(server)
    assert server.engine.is_running is True

    for _ in range(3):
        target = server.engine.active_button
        controller.press(target)
        server.tick()

    assert server.state()["players"][0]["score"] == 3

    server.engine._round_start -= 999  # force the round to time out
    server.tick()

    state = server.state()
    assert state["screen"] == "results"
    assert state["leaderboard"][0] == {"name": "Solo", "score": 3, "difficulty": "easy"}


def test_two_player_flow_uses_ready_overlay_between_turns(tmp_path):
    server, controller = make_server(tmp_path)
    server.handle_command({"action": "set_mode", "value": "two_player"})
    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "start_game", "names": ["Ana", "Beto"]})
    skip_intro(server)  # player 1's round goes live

    server.engine._round_start -= 999  # end player 1's turn immediately
    server.tick()

    state = server.state()
    assert state["screen"] == "game"
    assert state["awaiting_ready"] is True
    assert state["next_player_name"] == "Beto"

    server.handle_command({"action": "ready_next"})
    state = server.state()
    assert state["awaiting_ready"] is False
    assert state["awaiting_intro"] is True  # ready dismissed -> countdown, not an instant start
    assert server.engine.is_running is False

    skip_intro(server)  # player 2's round goes live
    assert server.engine.is_running is True

    server.engine._round_start -= 999  # end player 2's turn
    server.tick()

    state = server.state()
    assert state["screen"] == "results"
    assert len(state["leaderboard"]) == 2


def test_any_button_press_dismisses_ready_overlay(tmp_path):
    """The overlay must not require a mouse click on a device meant to be
    played with physical buttons -- pressing any button also dismisses it."""
    server, controller = make_server(tmp_path)
    server.handle_command({"action": "set_mode", "value": "two_player"})
    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "start_game", "names": ["Ana", "Beto"]})
    skip_intro(server)  # player 1's round goes live

    server.engine._round_start -= 999  # end player 1's turn
    server.tick()
    assert server.state()["awaiting_ready"] is True

    controller.press(0)  # any button, not necessarily correct for the new round
    server.tick()

    state = server.state()
    assert state["awaiting_ready"] is False
    assert state["awaiting_intro"] is True  # wake-up press starts the countdown, not the round itself
    assert server.session.active_player_index == 1
    assert server.session.players[1].score == 0  # the wake-up press wasn't scored as a hit
    assert server.engine.is_running is False  # still counting down, not live yet

    controller.press(0)  # a stray press during the countdown ...
    skip_intro(server)
    assert server.engine.is_running is True  # ... player 2's round is now live
    assert server.session.players[1].score == 0  # ... and wasn't scored either


def test_intro_countdown_exposes_time_left_and_holds_the_led_off(tmp_path):
    server, controller = make_server(tmp_path)
    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "start_game", "names": ["Solo"]})

    state = server.state()
    assert state["awaiting_intro"] is True
    assert state["intro_duration"] > 0
    assert 0 < state["intro_time_left"] <= state["intro_duration"]
    assert state["active_button"] is None  # no LED lit yet -- the round isn't live

    skip_intro(server)
    state = server.state()
    assert state["awaiting_intro"] is False
    assert state["intro_time_left"] is None
    assert state["active_button"] is not None  # round went live, first LED lit


def test_blank_names_default_to_player_n(tmp_path):
    server, _ = make_server(tmp_path)
    server.handle_command({"action": "set_mode", "value": "two_player"})
    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "start_game", "names": ["", "  "]})

    names = [p["name"] for p in server.state()["players"]]
    assert names == ["Player 1", "Player 2"]


def test_press_button_ignored_before_game_starts(tmp_path):
    server, controller = make_server(tmp_path)
    server.handle_command({"action": "press_button", "index": 3})
    server.tick()
    assert server.state()["players"] == []  # no crash, no session created


def test_restart_returns_to_menu(tmp_path):
    server, controller = make_server(tmp_path)
    server.handle_command({"action": "goto_player_setup"})
    server.handle_command({"action": "start_game", "names": ["Solo"]})
    server.handle_command({"action": "restart"})

    state = server.state()
    assert state["screen"] == "menu"
    assert state["players"] == []


def test_on_state_change_hook_fires_on_tick_and_commands(tmp_path):
    server, controller = make_server(tmp_path)
    events = []
    server.on_state_change = events.append

    server.handle_command({"action": "set_mode", "value": "two_player"})
    server.tick()

    assert len(events) == 2
    assert events[-1]["mode"] == "two_player"
