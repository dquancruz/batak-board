from batak_board.hardware.simulator import SimulatedButtonController
from batak_board.web.game_server import GameServer


def make_server(tmp_path):
    from batak_board.game.leaderboard import Leaderboard

    controller = SimulatedButtonController()
    leaderboard = Leaderboard(path=tmp_path / "leaderboard.json")
    return GameServer(controller=controller, leaderboard=leaderboard), controller


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

    assert server.state()["screen"] == "game"

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

    server.engine._round_start -= 999  # end player 1's turn immediately
    server.tick()

    state = server.state()
    assert state["screen"] == "game"
    assert state["awaiting_ready"] is True
    assert state["next_player_name"] == "Beto"

    server.handle_command({"action": "ready_next"})
    assert server.state()["awaiting_ready"] is False

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

    server.engine._round_start -= 999  # end player 1's turn
    server.tick()
    assert server.state()["awaiting_ready"] is True

    controller.press(0)  # any button, not necessarily correct for the new round
    server.tick()

    state = server.state()
    assert state["awaiting_ready"] is False
    assert server.session.active_player_index == 1
    assert server.session.players[1].score == 0  # the wake-up press wasn't scored as a hit
    assert server.engine.is_running is True  # player 2's round is now live


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
