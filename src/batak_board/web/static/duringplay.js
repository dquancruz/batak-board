// Batak Board — Fase 3: durante la partida.
//
// The spec's own rule for this phase: nothing above 300ms, and it must
// never cost input responsiveness -- the player is watching the physical
// board, not the screen, so everything here is a fire-and-forget WAAPI
// animation or a class toggle, never something the next tick has to wait
// on. Driven entirely by state app.js already reads every tick (no new
// state added): feedback_seq/last_feedback for the flash/shake/score-bump,
// active_button (captured *before* app.js reassigns .active, since by the
// time a "hit"/"wrong"/"timeout" feedback lands, the engine has already
// lit the next button), and time_left/round_duration for the timer's
// last-seconds heartbeat.
//
// Called from app.js's updateGame(), once per tick:
//   - onFeedback(kind, ledIndex): the LED that was just hit/missed flashes
//     green (hit) or shakes (wrong/timeout); a hit also bumps the score
//     number. ledIndex is the button *before* this feedback (see above) --
//     null-safe, since app.js only has one to give right after the very
//     first LED of a round lights (no prior feedback yet).
//   - setUrgency(timeLeft, roundDuration): toggles the last-5s / last-2s
//     heartbeat classes on the timer track (see style.css's
//     .timer-track.urgent / .urgent-final for the actual loop).
//
// Safe to delete (and its <script> tag + call sites in app.js) without
// touching gameplay -- purely cosmetic, no state read here is ever mutated.
(function () {
  const SCOPE = "game-fx";

  function ledCell(index) {
    if (index == null) return null;
    const grid = document.getElementById("led-grid");
    return grid ? grid.children[index] : null;
  }

  function onFeedback(kind, ledIndex) {
    const anim = window.BatakAnim;
    if (!anim) return;
    const cell = ledCell(ledIndex);

    if (kind === "hit") {
      if (cell) {
        anim.play(
          cell,
          [
            { transform: "scale(1)", backgroundColor: "var(--led-off)" },
            { transform: "scale(1.15)", backgroundColor: "var(--neon-green)" },
            { transform: "scale(1)", backgroundColor: "var(--led-off)" },
          ],
          { duration: anim.DURATIONS.game.hit, easing: anim.EASINGS.easeOut },
          SCOPE
        );
      }
      const score = document.getElementById("score-label");
      if (score) {
        anim.play(
          score,
          [{ transform: "scale(1)" }, { transform: "scale(1.25)" }, { transform: "scale(1)" }],
          { duration: anim.DURATIONS.game.scoreBump, easing: anim.EASINGS.easeOut },
          SCOPE
        );
      }
    } else if (cell) {
      // "wrong" and "timeout" get the same shake -- the spec doesn't call
      // for a different one, and feedback-banner text already tells them apart.
      anim.play(
        cell,
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(6px)" },
          { transform: "translateX(0)" },
        ],
        { duration: anim.DURATIONS.game.wrongShake, easing: anim.EASINGS.standard },
        SCOPE
      );
    }
  }

  // Últimos 5s: barra roja + latido (500ms loop), baja a 350ms en los
  // últimos 2s. Both speeds are plain CSS `@keyframes` loops (see
  // style.css) sized off anim.js's custom properties -- this only ever
  // toggles which class applies, no per-tick timing math.
  function setUrgency(timeLeft, roundDuration) {
    const track = document.getElementById("timer-track");
    if (!track) return;
    const urgent = roundDuration > 0 && timeLeft > 0 && timeLeft <= 5;
    track.classList.toggle("urgent", urgent);
    track.classList.toggle("urgent-final", urgent && timeLeft <= 2);
  }

  window.BatakDuringPlay = { onFeedback, setUrgency };
})();
