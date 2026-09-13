// Batak Board — central animation system.
//
// Single source of truth for every duration/delay/easing used by the web
// dashboard's animations (one entry per row of the spec's phase tables),
// plus a thin cancellable wrapper over the Web Animations API so nothing
// ever keeps running under a screen that's no longer showing.
//
// Loaded before pet.js/idle.js/app.js -- everything below hangs off
// `window.BatakAnim`. No build step, no dependency: this is the "no magic
// numbers scattered in components" module called for in the animation spec.

(function () {
  // -- constants, one block per phase (fases 1-7) -------------------------
  // Durations/intervals in ms unless noted. Only Fase 1 is wired up so far;
  // the rest are filled in now from the spec so later phases just consume
  // this table instead of re-deriving it.

  const DURATIONS = {
    idle: { // Fase 1
      breathe: 2500,
      blink: 120,
      gesture: 1200,
      gridWaveStep: 400,
      textFadeOut: 300,
      textFadeIn: 300,
      ctaPulse: 900,
      exitFade: 250,
    },
    intro: { // Fase 2
      menuExit: 250,
      gridCellIn: 300,
      petReposition: 400,
      countdownNumber: 500,
      goFade: 300,
    },
    game: { // Fase 3
      ledOn: 150,
      hit: 200,
      wrongShake: 250,
      scoreBump: 180,
      streakAura: 800,
      urgentPulse: 500,
      urgentPulseFinal: 350,
      petCrossfade: 120,
    },
    roundEnd: { // Fase 4
      freezeDesaturate: 300,
      timeUpVisible: 800,
      gridOutStep: 250,
      toResults: 350,
    },
    results: { // Fase 5
      titleIn: 400,
      scoreCount: 1200,
      breakdown: 300,
      petCelebrate: 1500,
      confetti: 2500,
      rowIn: 250,
      rowHighlight: 600,
      playAgainIn: 300,
    },
    twoPlayer: { // Fase 6
      turnCardIn: 500,
      namePulse: 700,
      barGrow: 900,
      crown: 600,
    },
    micro: { // Fase 7
      hover: 150,
      press: 100,
      themeSwap: 400,
      toastIn: 200,
      toastVisible: 3000,
      toastOut: 200,
    },
  };

  const DELAYS = {
    idle: {
      activateAfter: 20000, // no interaction on menu before the loop starts
      loopLength: 12000,
      gestureInterval: 5000,
      gridWaveInterval: 4000,
      gridWaveStagger: 60,
      blinkMin: 3000,
      blinkMax: 6000,
      textVisible: 4000,
      ctaInterval: 2000,
    },
    intro: {
      gridEntryDelay: 100,
      gridStagger: 40,
      petRepositionDelay: 100, // "simultáneo al grid"
      countdownGap: 100,
    },
    game: { // Fase 3
      // "Cambio de expresión de mascota ... máximo 1 cambio cada 400ms" --
      // without this, Hard mode's 0.8s button timeout can flip the pet's
      // face fast enough to strobe. Gates pet.js's react() during "game"
      // only (see its own comment) -- streak/on-fire tracking still update
      // every call, just the pose repaint can be skipped.
      petExpressionThrottle: 400,
    },
    roundEnd: {
      timeUpDelay: 200,
      gridOutDelay: 400,
      gridOutStagger: 30,
    },
    results: {
      scoreStart: 200,
      breakdownStart: 300,
      petStart: 200, // "simultáneo al conteo"
      confettiAfterCount: 0, // fires when the count finishes
      rowsStart: 400,
      rowStagger: 80,
      rowHighlightStart: 300,
      playAgainStart: 500,
      returnToMenu: 15000,
      returnToIdleAttract: 35000,
    },
    twoPlayer: {
      barStagger: 200,
    },
  };

  const EASINGS = {
    standard: "cubic-bezier(0.4, 0, 0.2, 1)",
    easeOut: "cubic-bezier(0, 0, 0.2, 1)",
    easeIn: "cubic-bezier(0.4, 0, 1, 1)",
    bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    linear: "linear",
  };

  // -- reducedMotion: prefers-reduced-motion OR the "modo simple" toggle --

  const SIMPLE_MODE_KEY = "batak-simple-mode";
  let simpleMode = false;
  try {
    simpleMode = localStorage.getItem(SIMPLE_MODE_KEY) === "1";
  } catch (e) {
    // localStorage unavailable -- default to false, same fallback app.js uses for theme.
  }

  const motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function computeReducedMotion() {
    return simpleMode || !!(motionQuery && motionQuery.matches);
  }

  // Mirrors the `prefers-reduced-motion` media query as a DOM attribute so
  // plain CSS keyframes/transitions (not just WAAPI calls routed through
  // `play()` below) can key off the same combined flag -- see the
  // `html[data-motion="reduced"]` rule in style.css.
  function applyMotionAttr() {
    document.documentElement.dataset.motion = computeReducedMotion() ? "reduced" : "normal";
  }
  applyMotionAttr();

  // Two loops in Fase 1 are plain CSS `@keyframes` (a continuous loop reads
  // fine as CSS, no cancel-on-screen-change concern since their class is
  // only ever added/removed by idle.js/pet.js) rather than routed through
  // play() below -- these two custom properties are how *they* still read
  // their duration from this module instead of a number baked into the
  // stylesheet. Everything else CSS-driven in Fase 1 (grid wave, text
  // fade) goes through play() and reads DURATIONS directly in JS.
  document.documentElement.style.setProperty("--dur-idle-breathe", DURATIONS.idle.breathe + "ms");
  document.documentElement.style.setProperty("--dur-idle-cta-cycle", DELAYS.idle.ctaInterval + "ms");
  // Fase 2's mascot reposition nudge (see pet.js's playIntroReposition) is a
  // plain CSS `@keyframes` for the same reason as the two above.
  document.documentElement.style.setProperty("--dur-intro-pet-reposition", DURATIONS.intro.petReposition + "ms");
  // Fase 3's CSS-only pieces: the LED's own "se enciende" color transition,
  // the streak aura loop, and the two speeds of the last-seconds timer
  // heartbeat (duringplay.js just toggles classes; these read the actual
  // numbers so nothing is duplicated in style.css).
  document.documentElement.style.setProperty("--dur-game-led-on", DURATIONS.game.ledOn + "ms");
  document.documentElement.style.setProperty("--dur-game-streak-aura", DURATIONS.game.streakAura + "ms");
  document.documentElement.style.setProperty("--dur-game-urgent-pulse", DURATIONS.game.urgentPulse + "ms");
  document.documentElement.style.setProperty("--dur-game-urgent-pulse-final", DURATIONS.game.urgentPulseFinal + "ms");
  // Fase 5's "fila propia se resalta" glow (results.js adds the class at
  // the scheduled time; this is just its duration).
  document.documentElement.style.setProperty("--dur-results-row-highlight", DURATIONS.results.rowHighlight + "ms");
  // Fase 6: "nombre del jugador activo pulsa" -- a plain CSS loop toggled
  // by twoplayer.js, same pattern as the other loops above.
  document.documentElement.style.setProperty("--dur-2p-name-pulse", DURATIONS.twoPlayer.namePulse + "ms");
  // Fase 6: "corona sobre el ganador, 600ms con rebote" -- a one-shot CSS
  // class toggled by twoplayer.js once the bars finish growing.
  document.documentElement.style.setProperty("--dur-2p-crown", DURATIONS.twoPlayer.crown + "ms");
  // Fase 7: hover/press live in style.css as plain CSS transitions (no JS
  // orchestration needed -- the browser already knows when the pointer is
  // over/down); the theme-swap window is toggled by app.js's applyTheme().
  document.documentElement.style.setProperty("--dur-micro-hover", DURATIONS.micro.hover + "ms");
  document.documentElement.style.setProperty("--dur-micro-press", DURATIONS.micro.press + "ms");
  document.documentElement.style.setProperty("--dur-micro-theme-swap", DURATIONS.micro.themeSwap + "ms");

  if (motionQuery) {
    const onChange = () => applyMotionAttr();
    if (motionQuery.addEventListener) motionQuery.addEventListener("change", onChange);
    else if (motionQuery.addListener) motionQuery.addListener(onChange); // older Chromium fallback
  }

  function setSimpleMode(value) {
    simpleMode = !!value;
    try {
      localStorage.setItem(SIMPLE_MODE_KEY, simpleMode ? "1" : "0");
    } catch (e) {
      // ignore -- the toggle just won't persist across reloads
    }
    applyMotionAttr();
  }

  // -- cancellable Web Animations API wrapper ------------------------------
  // Every animation started through play() is tracked under a "scope" key
  // (usually the screen or feature it belongs to, e.g. "menu-idle"). A
  // screen/feature that's shutting down calls cancelScope() once to
  // guarantee nothing keeps running underneath it or fires a stale
  // callback -- the "cada animación debe poder cancelarse limpiamente al
  // cambiar de pantalla" requirement, in one place instead of per-callsite
  // bookkeeping.

  const scopes = new Map(); // scope -> Set<Animation>

  function play(el, keyframes, options, scope) {
    if (!el || !el.animate) return null;
    const opts = Object.assign({}, options);
    if (computeReducedMotion()) opts.duration = 1; // keep the state change, skip the motion (spec: 0.01ms, not "no animation")
    const animation = el.animate(keyframes, opts);
    if (scope) {
      if (!scopes.has(scope)) scopes.set(scope, new Set());
      const set = scopes.get(scope);
      set.add(animation);
      const drop = () => set.delete(animation);
      animation.finished.then(drop, drop);
    }
    return animation;
  }

  function cancelScope(scope) {
    const set = scopes.get(scope);
    if (!set) return;
    set.forEach((a) => {
      try {
        a.cancel();
      } catch (e) {
        // already finished/cancelled -- fine
      }
    });
    set.clear();
  }

  // Calls fn(item, index) for each item, staggering successive calls by
  // stepMs (skipped entirely under reducedMotion, so a "wave" collapses to
  // one instant state change instead of a slow crawl).
  function stagger(items, stepMs, fn) {
    Array.prototype.forEach.call(items, (item, i) => {
      const wait = computeReducedMotion() ? 0 : i * stepMs;
      if (wait <= 0) fn(item, i);
      else setTimeout(() => fn(item, i), wait);
    });
  }

  window.BatakAnim = {
    DURATIONS,
    DELAYS,
    EASINGS,
    get reducedMotion() {
      return computeReducedMotion();
    },
    get simpleMode() {
      return simpleMode;
    },
    setSimpleMode,
    play,
    cancelScope,
    stagger,
  };
})();
