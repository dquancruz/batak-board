// Batak Board — Fase 4: fin de ronda.
//
// Purely a client-side outro: by the time a round ends the server has
// already turned off every LED and finalized the score (engine.stop_round()
// happens *before* the state push that flips screen to "results"), so
// there's no fairness/hardware concern in taking a couple more seconds to
// show it -- unlike Fase 2, nothing here needs the server to hold
// anything. app.js just delays the results *screen swap* until play()'s
// callback fires; everything else (score, leaderboard) is already final.
//
// Sequence (chained, ~2.6s total, straight from the spec's Fase 4 table):
//   1. Grid freezes + desaturates (300ms)
//   2. "TIEMPO" card fades in, holds, fades out (800ms visible)
//   3. Grid empties out, reverse stagger from the last button to the first
//      (250ms each, 30ms stagger)
//   4. Results screen fades/slides in (350ms) -- same treatment intro.js
//      gives the game screen on the way in.
//
// Only ever triggered for a *real* round end (game -> results); the 2P
// mid-session handoff (game -> ready-overlay, screen never changes) has
// its own existing "¡Listo!" card and doesn't play this.
(function () {
  const SCOPE = "round-end";
  let timers = [];

  function els() {
    return {
      grid: document.getElementById("led-grid"),
      banner: document.getElementById("round-end-banner"),
      resultsScreen: document.getElementById("screen-results"),
    };
  }

  function after(ms, fn) {
    timers.push(setTimeout(fn, ms));
  }

  function resetGridStyles(grid) {
    if (!grid) return;
    // Belt-and-suspenders beyond cancelScope(): a `fill: "forwards"`
    // animation that's already finished can self-drop from anim.js's own
    // tracking (its cleanup runs off the animation's own `finished`
    // promise) before cancelScope() gets a chance to reach it, and once
    // that's happened, resetting inline styles alone can't out-rank the
    // still-held WAAPI effect underneath. Querying the browser's own live
    // animation list for this subtree and cancelling everything there
    // sidesteps that race instead of depending on our bookkeeping being
    // ahead of it -- this grid gets reused every round, so anything left
    // stuck (desaturated, invisible) here would carry into the next one.
    if (grid.getAnimations) {
      grid.getAnimations({ subtree: true }).forEach((a) => {
        try {
          a.cancel();
        } catch (e) {
          // already idle -- fine
        }
      });
    }
    grid.style.filter = "";
    Array.from(grid.children).forEach((cell) => {
      cell.style.transform = "";
      cell.style.opacity = "";
    });
  }

  function play(onComplete) {
    const anim = window.BatakAnim;
    const { grid, banner, resultsScreen } = els();
    if (!anim) {
      onComplete();
      return;
    }
    const D = anim.DURATIONS.roundEnd;
    const L = anim.DELAYS.roundEnd;

    // 1. Congelar grid + desaturar (300ms) -- one-shot filter transition,
    // not a loop, so it's fine alongside the perf rules' no-animated-filter
    // guidance (that's aimed at blur loops, not a single 300ms fade).
    if (grid) {
      anim.play(grid, [{ filter: "saturate(1)" }, { filter: "saturate(0)" }], { duration: D.freezeDesaturate, easing: anim.EASINGS.standard, fill: "forwards" }, SCOPE);
    }

    // 2. "TIEMPO" entra y sale (800ms visible), delay 200ms after step 1.
    after(D.freezeDesaturate + L.timeUpDelay, () => {
      if (!banner) return;
      banner.hidden = false;
      const fadeMs = 200; // in/out framing for the 800ms visible window -- not its own spec row
      anim.play(banner, [{ opacity: 0, transform: "translate(-50%, -50%) scale(0.8)" }, { opacity: 1, transform: "translate(-50%, -50%) scale(1)" }], { duration: fadeMs, easing: anim.EASINGS.standard, fill: "forwards" }, SCOPE);
      after(D.timeUpVisible - fadeMs, () => {
        anim.play(banner, [{ opacity: 1 }, { opacity: 0 }], { duration: fadeMs, easing: anim.EASINGS.standard, fill: "forwards" }, SCOPE);
        after(fadeMs, () => { banner.hidden = true; });
      });
    });

    // 3. Grid sale (stagger inverso -- last button out first), delay 400ms
    // after step 2 ends. Computed up front (cell count is static) rather
    // than inside the step-3 callback below -- step 4 has to schedule its
    // own timer *now*, so a value only assigned when step 3 actually runs
    // would still be the stale initial one by then.
    const step3At = D.freezeDesaturate + L.timeUpDelay + D.timeUpVisible + L.gridOutDelay;
    const cellCount = grid ? grid.children.length : 0;
    const gridOutSpan = D.gridOutStep + L.gridOutStagger * Math.max(0, cellCount - 1);
    after(step3At, () => {
      if (!grid) return;
      const cells = Array.from(grid.children).reverse();
      anim.stagger(cells, L.gridOutStagger, (cell) => {
        anim.play(cell, [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.7)", opacity: 0 }], { duration: D.gridOutStep, easing: anim.EASINGS.easeIn, fill: "forwards" }, SCOPE);
      });
    });

    // 4. Transición a resultados (350ms), right as the grid finishes
    // emptying out.
    after(step3At + gridOutSpan, () => {
      // Steps 1 and 3 used `fill: "forwards"` so the freeze/desaturate and
      // the grid-out held their last frame instead of snapping back mid-
      // sequence -- but a WAAPI animation's forwards fill outlives the
      // animation itself until cancelled, and this same #led-grid/its
      // cells get reused next round (never rebuilt). Cancel the scope
      // *before* resetting inline styles, or the grid would stay stuck
      // desaturated/invisible forever (an inline style can't out-rank an
      // active WAAPI effect).
      anim.cancelScope(SCOPE);
      resetGridStyles(grid);
      onComplete(); // app.js swaps .visible to screen-results here
      if (resultsScreen) {
        anim.play(resultsScreen, [{ transform: "translateY(20px)", opacity: 0 }, { transform: "translateY(0)", opacity: 1 }], { duration: D.toResults, easing: anim.EASINGS.standard }, SCOPE);
      }
    });
  }

  // Safety net for an edge case that shouldn't happen in normal play (see
  // app.js): if the screen moves away from "results" while this is still
  // mid-sequence, stop cleanly instead of leaving stale timers/styles
  // around or calling onComplete for a screen nobody asked for anymore.
  function cancel() {
    timers.forEach(clearTimeout);
    timers = [];
    window.BatakAnim && window.BatakAnim.cancelScope(SCOPE);
    const { grid, banner } = els();
    resetGridStyles(grid);
    if (banner) banner.hidden = true;
  }

  window.BatakRoundEnd = { play, cancel };
})();
