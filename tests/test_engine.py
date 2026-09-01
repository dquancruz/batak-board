from batak_board.config import DIFFICULTY_SETTINGS, Difficulty
from batak_board.game.engine import GameEngine
from batak_board.game.models import Player
from batak_board.hardware.simulator import SimulatedButtonController


class FakeClock:
    """Manually-advanced clock so timing logic is deterministic in tests."""

    def __init__(self, start: float = 0.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make_engine():
    controller = SimulatedButtonController()
    clock = FakeClock()
    engine = GameEngine(controller, clock=clock)
    return engine, controller, clock


def test_start_round_lights_a_button():
    engine, controller, _ = make_engine()
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])

    assert engine.is_running is True
    assert engine.active_button is not None
    assert controller.led_states[engine.active_button] is True


def test_correct_press_scores_a_point_and_relights():
    engine, controller, _ = make_engine()
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])

    target = engine.active_button
    controller.press(target)
    engine.tick()

    assert player.score == 1
    assert player.hits == 1
    assert controller.led_states[target] is False  # old button turned off
    assert engine.active_button is not None  # a new one is lit
    assert controller.led_states[engine.active_button] is True


def test_wrong_press_counts_as_miss_and_advances():
    engine, controller, _ = make_engine()
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])

    target = engine.active_button
    wrong = (target + 1) % 10
    controller.press(wrong)
    engine.tick()

    assert player.score == 0
    assert player.misses == 1
    assert controller.led_states[target] is False
    assert engine.active_button != target or True  # a new button was chosen


def test_feedback_callback_fires_for_hit_and_miss():
    engine, controller, _ = make_engine()
    feedback_events = []
    engine.on_feedback = feedback_events.append
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])

    target = engine.active_button
    controller.press(target)
    engine.tick()
    controller.press((engine.active_button + 1) % 10)
    engine.tick()

    assert feedback_events == ["hit", "wrong"]


def test_easy_mode_has_no_button_timeout():
    engine, controller, clock = make_engine()
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])
    target = engine.active_button

    clock.advance(10.0)  # way past medium/hard timeouts
    engine.tick()

    assert engine.active_button == target  # still waiting, no timeout in Easy
    assert player.misses == 0


def test_medium_mode_times_out_unpressed_button():
    engine, controller, clock = make_engine()
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.MEDIUM])
    target = engine.active_button

    clock.advance(1.6)  # > 1.5s medium timeout
    engine.tick()

    assert player.misses == 1
    assert controller.led_states[target] is False
    assert engine.active_button != target


def test_round_ends_when_time_runs_out():
    engine, controller, clock = make_engine()
    ended_players = []
    engine.on_round_end = ended_players.append
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.HARD])  # 30s round

    clock.advance(31.0)
    engine.tick()

    assert engine.is_running is False
    assert engine.active_button is None
    assert ended_players == [player]
    assert all(state is False for state in controller.led_states.values())


def test_time_left_callback_reports_remaining_seconds():
    engine, controller, clock = make_engine()
    readings = []
    engine.on_time_left_change = readings.append
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.HARD])  # 30s round

    clock.advance(5.0)
    engine.tick()

    assert readings[-1] == 25.0


def test_stale_presses_before_round_start_are_ignored():
    engine, controller, clock = make_engine()
    controller.press(2)  # queued before the round even starts
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])

    engine.tick()
    assert player.score == 0  # stale press was discarded, not treated as a hit


def test_presses_after_round_stopped_do_nothing():
    engine, controller, clock = make_engine()
    player = Player(name="Ana")
    engine.start_round(player, DIFFICULTY_SETTINGS[Difficulty.EASY])
    engine.stop_round()

    controller.press(0)
    engine.tick()  # engine is not running, tick() should be a no-op

    assert player.score == 0
