// Batak Board — Fase 2: entrada al juego.
//
// Purely decorative on top of GameServer's real (server-owned) hold: the
// round genuinely doesn't go live until `state.awaiting_intro` flips back
// to false (see game_server.py's `_start_intro`/`tick()`), so this module
// never has to be the thing that "starts" anything -- it just dresses up
// the wait with the grid-entrance/countdown sequence from the spec while
// the server counts it down on its own. If this file were deleted (and its
// <script> tag + call sites in app.js with it), the round would still
// correctly wait out the same hold in silence, just with a blank overlay
// (app.js shows/hides #intro-overlay off state.awaiting_intro directly,
// same as the existing #ready-overlay) -- nothing here touches game state
// or sends anything over the WebSocket.
//
// Two entry points from app.js's render():
//   - enter(): the very first turn of a session, right as the screen
//     changes from "menu"/"player_setup" to "game" -- fades the game
//     screen in, pops the LED grid in, and nudges the mascot into place
//     before the countdown.
//   - onState(state): called every render(); notices awaiting_intro going
//     false->true *without* enter() having just run (the 2P ready-overlay
//     handoff, where "game" was already showing) and replays just the
//     mascot nudge + countdown -- no grid/screen entrance to redo.
// Both end in the same 3·2·1·¡YA! countdown card (see runCountdown()).
(function () {
  const SCOPE = "game-intro";
  const STEPS = ["3", "2", "1", "¡YA!"];

  let lastAwaitingIntro = false;

  function els() {
    return {
      screen: document.getElementById("screen-game"),
      grid: document.getElementById("led-grid"),
      countdown: document.getElementById("intro-countdown"),
    };
  }

  // 3 -> 2 -> 1 -> ¡YA!, each a scale 1.6->1 + fade-in, shown for
  // countdownNumber ms with countdownGap between them (spec's Fase 2
  // table). Purely cosmetic pacing -- not driven step-by-step by the
  // server's intro_time_left, just timed to land inside the same hold.
  function runCountdown() {
    const { countdown } = els();
    if (!countdown) return;
    const { countdownNumber } = window.BatakAnim.DURATIONS.intro;
    const { countdownGap } = window.BatakAnim.DELAYS.intro;

    let i = 0;
    const step = () => {
      if (i >= STEPS.length) return; // app.js hides #intro-overlay once awaiting_intro flips false
      countdown.textContent = STEPS[i++];
      window.BatakAnim.play(
        countdown,
        [
          { transform: "scale(1.6)", opacity: 0 },
          { transform: "scale(1)", opacity: 1 },
        ],
        { duration: countdownNumber, easing: window.BatakAnim.EASINGS.bounce, fill: "forwards" },
        SCOPE
      );
      setTimeout(step, countdownNumber + countdownGap);
    };
    step();
  }

  // Grid entrance: circles pop in scale 0.7->1, staggered 40ms -- only
  // called from enter(), so this only ever plays once per fresh session,
  // not on every 2P turn handoff (nothing new to reveal there).
  function popInGrid() {
    const { grid } = els();
    if (!grid) return;
    const { gridCellIn } = window.BatakAnim.DURATIONS.intro;
    const { gridEntryDelay, gridStagger } = window.BatakAnim.DELAYS.intro;
    setTimeout(() => {
      window.BatakAnim.stagger(grid.querySelectorAll(".led-cell"), gridStagger, (cell) => {
        window.BatakAnim.play(
          cell,
          [
            { transform: "scale(0.7)", opacity: 0.4 },
            { transform: "scale(1)", opacity: 1 },
          ],
          { duration: gridCellIn, easing: window.BatakAnim.EASINGS.easeOut },
          SCOPE
        );
      });
    }, gridEntryDelay);
  }

  // The game screen itself fades + slides up as it takes over from
  // menu/player_setup -- app.js already swapped `.visible` synchronously
  // (screen visibility always tracks server state immediately, so a
  // restart or reconnect mid-animation can never strand a hidden screen),
  // this is just a one-shot entrance on top of that instant swap.
  function fadeInScreen() {
    const { screen } = els();
    if (!screen) return;
    window.BatakAnim.play(
      screen,
      [
        { transform: "translateY(20px)", opacity: 0 },
        { transform: "translateY(0)", opacity: 1 },
      ],
      { duration: window.BatakAnim.DURATIONS.intro.menuExit, easing: window.BatakAnim.EASINGS.standard },
      SCOPE
    );
  }

  function repositionPet() {
    if (window.BatakPet && window.BatakPet.playIntroReposition) window.BatakPet.playIntroReposition();
  }

  function enter() {
    // onState() runs right after in the same render() tick and would
    // otherwise see the same awaiting_intro false->true edge and replay
    // the countdown a second time -- mark it consumed up front.
    lastAwaitingIntro = true;
    fadeInScreen();
    popInGrid();
    repositionPet();
    runCountdown();
  }

  function onState(state) {
    const introJustStarted = state.awaiting_intro && !lastAwaitingIntro;
    lastAwaitingIntro = state.awaiting_intro;
    if (introJustStarted) {
      // enter() covers the fresh-session case; this is only reached for
      // the 2P ready->countdown handoff, where the screen never changes.
      repositionPet();
      runCountdown();
    }
  }

  window.BatakIntro = { enter, onState };
})();
