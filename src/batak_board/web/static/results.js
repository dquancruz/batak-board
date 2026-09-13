// Batak Board — Fase 5: resultados (~5s total).
//
// Everything here is one-shot, chained off anim.js's DURATIONS.results/
// DELAYS.results (no magic numbers of its own) -- see the spec's Fase 5
// table for the row-by-row timing this reproduces:
//   título (400ms) -> puntaje cuenta 0->total (1.2s, simultáneo con la
//   mascota) -> desglose aciertos/fallos (300ms) -> filas del leaderboard
//   (250ms c/u, stagger 80ms) -> fila propia se resalta + scroll (600ms,
//   solo si el jugador entró al leaderboard) -> botón JUGAR DE NUEVO
//   (300ms). Confeti corre en paralelo, arrancando cuando termina el
//   conteo, solo si alguien de esta ronda entró al top 3.
//
// enter(state) is called once from app.js's onScreenEnter() right after
// buildResults() has built the (initially hidden) DOM; exit() is called
// once when the screen changes away from results, cancelling every timer/
// animation/rAF still in flight so nothing fires against a screen that's
// no longer showing.
//
// Also owns the "sin interacción" auto-behavior: 15s with no input on this
// screen re-clicks JUGAR DE NUEVO itself (same as a real click -- see
// app.js's own listener on #btn-restart). Getting back to "35s entra el
// idle" needs nothing further: idle.js already arms its own 20s timer the
// moment the screen it's watching becomes "menu", and 15 + 20 = 35.
(function () {
  const SCOPE = "results";
  let active = false;
  let timers = [];
  let confettiRaf = null;
  let confettiCanvas = null;

  function el(id) {
    return document.getElementById(id);
  }

  function after(ms, fn) {
    timers.push(setTimeout(fn, ms));
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // -- reveal helpers: everything starts hidden (set synchronously in
  // enter(), before first paint) and fades/slides to its normal state at
  // its scheduled time. -----------------------------------------------

  function hide(target, translate) {
    if (!target) return;
    target.style.opacity = "0";
    target.style.transform = translate || "translateY(10px)";
  }

  function reveal(target, duration, translate) {
    if (!target || !window.BatakAnim) return;
    window.BatakAnim.play(
      target,
      [{ opacity: 0, transform: translate || "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration, easing: window.BatakAnim.EASINGS.standard, fill: "forwards" },
      SCOPE
    );
  }

  // Counts a single <span class="score-count"> from 0 to its data-target
  // over `duration`ms, ease-out. Not routed through BatakAnim.play() since
  // it's animating text content, not transform/opacity -- but it does
  // respect reducedMotion the same way play() does: snap straight to the
  // final number instead of skipping the update entirely.
  //
  // Stepped with setTimeout rather than requestAnimationFrame on purpose:
  // rAF callbacks are fully paused (not just throttled) while a tab is
  // backgrounded/not visible, which would freeze the count mid-way and
  // never resume until someone's looking at it again -- setTimeout keeps
  // ticking (at worst throttled), same as the WAAPI reveals elsewhere on
  // this screen. ~40ms steps (~25fps) is plenty smooth for a number.
  const COUNT_STEP_MS = 40;
  function animateCount(span, duration) {
    if (!span) return;
    const target = Number(span.dataset.target) || 0;
    if (!window.BatakAnim || window.BatakAnim.reducedMotion || !target) {
      span.textContent = String(target);
      return;
    }
    const start = performance.now();
    function step() {
      if (!active) return; // exit() fired mid-count -- stop touching a screen nobody's on
      const p = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      span.textContent = String(Math.round(target * eased));
      if (p < 1) timers.push(setTimeout(step, COUNT_STEP_MS));
    }
    step();
  }

  // -- confetti: <canvas>, capped at 80 particles, stops itself and drops
  // its own requestAnimationFrame handle -- see the spec's perf rules. --

  function anyPlayerMadeTop3(state) {
    const list = state.leaderboard || [];
    return (state.players || []).some((p) => {
      const idx = list.findIndex((e) => e.name === p.name && e.score === p.score);
      return idx >= 0 && idx < 3;
    });
  }

  function playConfetti() {
    confettiCanvas = el("results-confetti");
    if (!confettiCanvas || !window.BatakAnim || window.BatakAnim.reducedMotion) return; // pure decoration -- reduced motion skips it outright rather than a 0.01ms flash of 80 particles
    const ctx = confettiCanvas.getContext("2d");
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
    confettiCanvas.hidden = false;

    const COLORS = ["--neon-green", "--neon-cyan", "--neon-magenta", "--neon-yellow", "--neon-red"].map(cssVar);
    const COUNT = 80;
    const particles = [];
    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * confettiCanvas.width,
        y: -20 - Math.random() * confettiCanvas.height * 0.6,
        vx: (Math.random() - 0.5) * 2.2,
        vy: 2 + Math.random() * 2.5,
        size: 4 + Math.random() * 4,
        color: COLORS[i % COLORS.length],
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.25,
      });
    }

    const durationMs = window.BatakAnim.DURATIONS.results.confetti;
    const start = performance.now();
    function frame(now) {
      if (!active || !confettiCanvas) return;
      const elapsed = now - start;
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      if (elapsed < durationMs) {
        confettiRaf = requestAnimationFrame(frame);
      } else {
        stopConfetti();
      }
    }
    confettiRaf = requestAnimationFrame(frame);
  }

  function stopConfetti() {
    if (confettiRaf) cancelAnimationFrame(confettiRaf);
    confettiRaf = null;
    if (confettiCanvas) {
      const ctx = confettiCanvas.getContext("2d");
      ctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
      confettiCanvas.hidden = true;
    }
  }

  // -- sin interacción: 15s -> vuelve al menú (35s total lands on its own
  // once idle.js sees "menu" and arms its own 20s attract timer). --------

  function onInteraction() {
    scheduleAutoReturn();
  }

  function scheduleAutoReturn() {
    clearTimeout(scheduleAutoReturn._t);
    if (!window.BatakAnim) return;
    scheduleAutoReturn._t = setTimeout(() => {
      const btn = el("btn-restart");
      if (btn && active) btn.click(); // reuses the exact same path a real click takes
    }, window.BatakAnim.DELAYS.results.returnToMenu);
    timers.push(scheduleAutoReturn._t);
  }

  function enter(state) {
    active = true;
    const anim = window.BatakAnim;
    if (!anim) return;
    const D = anim.DURATIONS.results;
    const L = anim.DELAYS.results;

    const heading = el("results-heading");
    const counts = Array.from(document.querySelectorAll("#breakdown .score-count"));
    const details = Array.from(document.querySelectorAll("#breakdown .score-detail"));
    const rows = Array.from(document.querySelectorAll("#leaderboard .leaderboard-row"));
    const newRows = rows.filter((r) => r.dataset.newEntry === "true");
    const playAgainBtn = el("btn-restart");
    const compare = el("two-player-compare");

    // Everything starts hidden -- set synchronously, before the browser's
    // next paint, so nothing flashes fully-visible for a frame first.
    // #two-player-compare defaults hidden here regardless of mode; the
    // two_player branch below (via BatakTwoPlayer.showComparison) is the
    // only thing that un-hides it, so a single-player result can never
    // show a stale comparison left over from an earlier 2P session.
    if (compare) compare.hidden = true;
    hide(heading, "translateY(-10px)");
    details.forEach((d) => hide(d));
    rows.forEach((r) => hide(r));
    hide(playAgainBtn, "translateY(10px) scale(0.9)");

    // Título entra (400ms, delay 0)
    reveal(heading, D.titleIn, "translateY(-10px)");
    const titleEnd = D.titleIn;

    // Puntaje cuenta de 0 al total (1.2s, delay 200ms after título)
    const scoreStart = titleEnd + L.scoreStart;
    const scoreEnd = scoreStart + D.scoreCount;
    after(scoreStart, () => counts.forEach((c) => animateCount(c, D.scoreCount)));

    // Mascota celebra/se desanima -- "simultáneo al conteo": petStart
    // happens to equal scoreStart's delay (both 200ms off título's end),
    // which is exactly what makes them line up -- kept as its own named
    // constant rather than reusing L.scoreStart, so the two stay
    // independently tunable if that ever needs to change.
    after(titleEnd + L.petStart, () => {
      if (window.BatakPet) window.BatakPet.onResults(state.players, state.leaderboard);
    });

    // Confeti -- "al terminar el conteo", solo top 3.
    if (anyPlayerMadeTop3(state)) {
      after(scoreEnd + L.confettiAfterCount, playConfetti);
    }

    // Desglose aciertos/fallos (300ms, delay 300ms after the count ends)
    const breakdownStart = scoreEnd + L.breakdownStart;
    const breakdownEnd = breakdownStart + D.breakdown;
    after(breakdownStart, () => details.forEach((d) => reveal(d, D.breakdown)));

    // Fase 6 (modo 2 jugadores): comparativa final -- runs alongside the
    // leaderboard rows below (different part of the screen), not chained
    // in front of them.
    if (state.mode === "two_player" && window.BatakTwoPlayer) {
      after(breakdownEnd, () => window.BatakTwoPlayer.showComparison(state));
    }

    // Filas del leaderboard (250ms c/u, stagger 80ms, delay 400ms after
    // desglose ends).
    const rowsStart = breakdownEnd + L.rowsStart;
    const rowsSpan = rows.length ? D.rowIn + L.rowStagger * (rows.length - 1) : 0;
    after(rowsStart, () => {
      anim.stagger(rows, L.rowStagger, (row) => reveal(row, D.rowIn));
    });

    // Fila propia se resalta + scroll (600ms, delay 300ms after every row
    // has finished entering) -- only the rows this round actually landed on.
    const rowsEnd = rowsStart + rowsSpan;
    let afterRowsAt = rowsEnd;
    if (newRows.length) {
      afterRowsAt = rowsEnd + L.rowHighlightStart + D.rowHighlight;
      after(rowsEnd + L.rowHighlightStart, () => {
        newRows.forEach((row) => {
          row.classList.add("leaderboard-row-new");
          row.scrollIntoView({ behavior: anim.reducedMotion ? "auto" : "smooth", block: "center" });
        });
      });
    }

    // Botón JUGAR DE NUEVO aparece (300ms, delay 500ms after the
    // leaderboard settles -- whether or not a highlight actually played).
    after(afterRowsAt + L.playAgainStart, () => reveal(playAgainBtn, D.playAgainIn, "translateY(10px) scale(0.9)"));

    ["pointerdown", "keydown", "touchstart"].forEach((evt) => document.addEventListener(evt, onInteraction, { passive: true }));
    scheduleAutoReturn();
  }

  function exit() {
    active = false;
    timers.forEach(clearTimeout);
    timers = [];
    clearTimeout(scheduleAutoReturn._t);
    ["pointerdown", "keydown", "touchstart"].forEach((evt) => document.removeEventListener(evt, onInteraction));
    if (window.BatakAnim) window.BatakAnim.cancelScope(SCOPE);
    // Belt-and-suspenders beyond cancelScope() -- same reasoning as
    // roundend.js's resetGridStyles(): a `fill: "forwards"` reveal that's
    // already finished can self-drop from anim.js's tracking before
    // cancelScope() reaches it, and #results-heading/#btn-restart (unlike
    // the freshly-rebuilt rows/details) are the *same* elements every time
    // results shows again. Cancelling everything the browser itself still
    // has live on this subtree sidesteps that race.
    const screen = el("screen-results");
    if (screen && screen.getAnimations) {
      screen.getAnimations({ subtree: true }).forEach((a) => {
        try {
          a.cancel();
        } catch (e) {
          // already idle -- fine
        }
      });
    }
    stopConfetti();
  }

  window.BatakResults = { enter, exit };
})();
