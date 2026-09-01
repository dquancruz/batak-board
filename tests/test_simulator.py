from batak_board.hardware.simulator import SimulatedButtonController


def test_starts_with_all_leds_off():
    ctrl = SimulatedButtonController()
    assert all(state is False for state in ctrl.led_states.values())
    assert ctrl.is_hardware is False


def test_set_led_updates_state():
    ctrl = SimulatedButtonController()
    ctrl.set_led(3, True)
    assert ctrl.led_states[3] is True
    ctrl.set_led(3, False)
    assert ctrl.led_states[3] is False


def test_set_all_leds():
    ctrl = SimulatedButtonController()
    ctrl.set_all_leds(True)
    assert all(ctrl.led_states.values())
    ctrl.set_all_leds(False)
    assert not any(ctrl.led_states.values())


def test_press_is_queued_and_drained_once():
    ctrl = SimulatedButtonController()
    ctrl.press(4)
    ctrl.press(7)
    assert ctrl.poll_presses() == [4, 7]
    assert ctrl.poll_presses() == []  # queue was drained


def test_out_of_range_led_index_is_ignored():
    ctrl = SimulatedButtonController()
    ctrl.set_led(99, True)  # should not raise
    assert 99 not in ctrl.led_states
