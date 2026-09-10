// Batak Board pet mascot -- purely decorative, no gameplay logic.
//
// Idles on every screen, drawn as pixel-art rectangles on a small canvas
// (same 11x12 ellipse-mask sprite as the desktop app's ui/pet.py, redrawn
// here with `fillRect` instead of `tk.Canvas` items). It only ever *reads*
// state app.js already has -- see the small set of calls into `BatakPet.*`
// from app.js -- and never sends anything over the WebSocket. Safe to
// delete this file (and its <script> tag / call sites in app.js) without
// touching gameplay.
//
// State machine, roughly highest-priority first:
//   1. reaction   -- react(kind) on hit/wrong/timeout: brief, always wins.
//   2. status     -- on-fire (10+ streak) / panic (<=10s left): overlays
//                     drawn on top of whatever idle/quirk pose is showing.
//   3. quirks     -- little scripted scenes (lollipop, balloon, chess)
//                     played randomly every 15-25s, but only when nothing
//                     above is active and we're not mid-game.
//   4. screen modes -- attract mode (menu, DVD-bounce/peek-a-boo) and the
//                     leaderboard sleeper (results), which take over
//                     entirely for a while and roam away from the corner.
//   5. post-round  -- onResults(): a one-shot takeover/failed-to-rank beat
//                     when the results screen is first shown.
//
// `setContext(screen, timeLeft, roundDuration)` -- called from app.js's
// render() every tick -- is what drives status + screen modes; everything
// else is called from the same few spots the previous version was.

(function () {
  const SCALE = 10;
  const GRID_W = 11;
  const GRID_H = 12;
  const HOME_LEFT = 16;
  const HOME_TOP = 16;
  // Extra canvas room beyond the body grid: above for a floating prop (the
  // balloon + its string, the zzz bubble, thinking dots), to the right for
  // a held one (lollipop, chessboard). Coordinates below can go negative
  // (above the head) or past GRID_W-1 (to the right) -- `fillPixel`
  // re-bases everything into canvas space.
  const PROP_TOP_ROWS = 10;
  const PROP_RIGHT_COLS = 6;
  const PROP_BOTTOM_ROWS = 2; // fire licks + the tear puddle sit one row below the body (row 12)
  const CANVAS_W = (GRID_W + PROP_RIGHT_COLS) * SCALE;
  const CANVAS_H = (PROP_TOP_ROWS + GRID_H + PROP_BOTTOM_ROWS) * SCALE;

  // Same ellipse-mask formula used to design the sprite (rows 0-1 left
  // clear for the antennae above it).
  const BODY = [];
  const CX = 5.0, CY = 7.5, RX = 5.0, RY = 4.3;
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      const dx = (x - CX) / RX, dy = (y - CY) / RY;
      if (dx * dx + dy * dy <= 1.0) BODY.push([x, y]);
    }
  }
  const ANTENNA_STALK = [[3, 1], [7, 1]];
  const ANTENNA_TIP = [[3, 0], [7, 0]];

  const EYES = {
    open: [[3, 6], [4, 6], [3, 7], [4, 7], [6, 6], [7, 6], [6, 7], [7, 7]],
    blink: [[3, 7], [4, 7], [6, 7], [7, 7]], // also doubles as "closed/asleep"
    happy: [[3, 6], [4, 6], [6, 6], [7, 6]], // squint -- also "concentrating"
    sad: [[4, 7], [6, 7]],
    wide: [[3, 5], [4, 5], [6, 5], [7, 5], [3, 6], [4, 6], [3, 7], [4, 7], [6, 6], [7, 6], [6, 7], [7, 7]],
    // "open" shifted one pixel left/right -- the idle-attract "mirar a los
    // lados" gesture (see GESTURES.look below), not used anywhere else.
    lookLeft: [[2, 6], [3, 6], [2, 7], [3, 7], [5, 6], [6, 6], [5, 7], [6, 7]],
    lookRight: [[4, 6], [5, 6], [4, 7], [5, 7], [7, 6], [8, 6], [7, 7], [8, 7]],
  };
  const MOUTHS = {
    neutral: [[4, 9], [5, 9], [6, 9]],
    happy: [[3, 9], [4, 9], [5, 9], [6, 9], [7, 9]],
    sad: [[5, 9]],
    o: [[5, 9], [5, 10]], // surprised / panicked gasp
  };
  const SPARKLE = [[0, 5], [10, 5]];
  const TONGUE = [[8, 9]];

  const INK = "#0b0e14"; // fixed dark ink for eyes/mouth so they read against any neon body fill, in both themes
  const STICK_COLOR = "#e8dcc0";
  const TONGUE_COLOR = "#ff6f91";
  const FIRE_COLORS = ["#ff7a1a", "#ffcf3f"];
  const SHADE_COLOR = "#12141a";
  const SHADE_SHINE = "#5b6472";
  const SWEAT_COLOR = "#8fd0ff";
  const CARD_COLOR = "#f2ead8";
  const CHESS_LIGHT = "#e8dcc0";
  const CHESS_DARK = "#7a6a4f";
  const ZZZ_COLOR = "#c7d0e0";
  const TEAR_COLOR = "#5ec2ff";

  // mood -> css var for body fill, css var for antenna-tip fill, eye shape, mouth shape, sparkle?
  const MOODS = {
    idle: { body: "--neon-cyan", tip: "--text-muted", eyes: "open", mouth: "neutral", sparkle: false, cls: null },
    hit: { body: "--neon-green", tip: "--neon-yellow", eyes: "happy", mouth: "happy", sparkle: true, cls: "pet-hop" },
    wrong: { body: "--neon-red", tip: "--text-muted", eyes: "sad", mouth: "sad", sparkle: false, cls: "pet-droop" },
    timeout: { body: "--neon-yellow", tip: "--text-muted", eyes: "sad", mouth: "sad", sparkle: false, cls: "pet-droop" },
  };

  // -- prop layers: small extra pixels drawn on top of the base sprite, in
  // the same local coordinate space (negative/large values are fine). Each
  // returns a list of {pixels, color} layers.

  function lollipopProps(dx) {
    const stick = [[11 + dx, 7], [11 + dx, 8], [11 + dx, 9]];
    return [
      { pixels: stick, color: STICK_COLOR },
      { pixels: [[10 + dx, 6], [11 + dx, 7]], color: cssVar("--neon-magenta") },
      { pixels: [[11 + dx, 6], [10 + dx, 7]], color: cssVar("--neon-yellow") },
    ];
  }
  function tongueProps() {
    return [{ pixels: TONGUE, color: TONGUE_COLOR }];
  }

  const BALLOON_COLS = [4, 5, 6];
  function balloonProps(dy) {
    const body = [];
    for (const y of [-7, -6, -5]) for (const x of BALLOON_COLS) body.push([x, y + dy]);
    const knot = [5, -4 + dy];
    const string = [[5, -3 + dy], [5, -2 + dy], [5, -1 + dy]];
    return [
      { pixels: body.concat([knot]), color: cssVar("--neon-magenta") },
      { pixels: string, color: cssVar("--text-muted") },
    ];
  }
  function burstProps(dy, color) {
    const cx = 5, cy = -6 + dy;
    const pts = [
      [cx, cy - 2], [cx, cy + 2], [cx - 2, cy], [cx + 2, cy],
      [cx - 2, cy - 2], [cx + 2, cy - 2], [cx - 2, cy + 2], [cx + 2, cy + 2],
    ];
    return [{ pixels: pts, color: color || cssVar("--neon-yellow") }];
  }

  function chessProps(dots) {
    // a little 2x2 checkerboard corner with a pawn on it, held to the side
    const board = [
      { pixels: [[10, 6], [12, 7]], color: CHESS_LIGHT },
      { pixels: [[11, 6], [10, 7], [12, 6], [11, 7]], color: CHESS_DARK },
    ];
    const pawn = [{ pixels: [[11, 5], [10, 5], [12, 5]], color: STICK_COLOR }];
    const thinking = [];
    for (let i = 0; i < dots; i++) thinking.push([2 + i * 2, -1]);
    return board.concat(pawn, thinking.length ? [{ pixels: thinking, color: cssVar("--text-muted") }] : []);
  }

  function fireProps(frame) {
    const a = [
      { pixels: [[0, 6], [10, 7], [0, 9], [10, 9], [4, 12], [6, 12]], color: FIRE_COLORS[0] },
      { pixels: [[0, 7], [10, 8], [3, 12], [7, 12]], color: FIRE_COLORS[1] },
    ];
    const b = [
      { pixels: [[0, 7], [10, 8], [3, 12], [7, 12], [5, 12]], color: FIRE_COLORS[0] },
      { pixels: [[0, 6], [10, 7], [0, 9], [10, 9]], color: FIRE_COLORS[1] },
    ];
    return frame ? b : a;
  }
  function shadesProps() {
    return [
      { pixels: [[3, 6], [4, 6], [5, 6], [6, 6], [7, 6]], color: SHADE_COLOR },
      { pixels: [[4, 6], [7, 6]], color: SHADE_SHINE },
    ];
  }

  function sweatProps(frame) {
    return [{ pixels: frame ? [[1, 6], [9, 7]] : [[1, 5], [9, 6]], color: SWEAT_COLOR }];
  }

  function zzzProps(stage) {
    const layers = [
      [[6, -1]],
      [[6, -1], [8, -2]],
      [[6, -1], [8, -2], [10, -3]],
    ];
    return [{ pixels: layers[Math.min(stage, layers.length - 1)], color: ZZZ_COLOR }];
  }

  function puddleProps() {
    return [{ pixels: [[3, 12], [4, 12], [5, 12], [6, 12], [7, 12]], color: TEAR_COLOR }];
  }
  function fSignProps() {
    const card = [];
    for (let y = 3; y <= 8; y++) for (let x = 10; x <= 13; x++) card.push([x, y]);
    const glyph = [[11, 4], [11, 5], [11, 6], [11, 7], [12, 4], [13, 4], [12, 6]];
    return [
      { pixels: card, color: CARD_COLOR },
      { pixels: glyph, color: INK },
    ];
  }

  // -- idle quirks: ordered lists of {ms, eyes, mouth, props} frames,
  // played back-to-back by playQuirk(). Body stays in the idle (cyan) mood
  // throughout -- only eyes/mouth/props change per frame.
  const QUIRKS = {
    lollipop: [
      { ms: 300, eyes: "open", mouth: "neutral", props: lollipopProps(4) },
      { ms: 250, eyes: "happy", mouth: "neutral", props: lollipopProps(0) },
      { ms: 260, eyes: "happy", mouth: "neutral", props: lollipopProps(0).concat(tongueProps()) },
      { ms: 220, eyes: "happy", mouth: "neutral", props: lollipopProps(0) },
      { ms: 260, eyes: "happy", mouth: "neutral", props: lollipopProps(0).concat(tongueProps()) },
      { ms: 220, eyes: "happy", mouth: "neutral", props: lollipopProps(0) },
      { ms: 260, eyes: "happy", mouth: "neutral", props: lollipopProps(0).concat(tongueProps()) },
      { ms: 280, eyes: "open", mouth: "neutral", props: lollipopProps(0) },
      { ms: 300, eyes: "open", mouth: "neutral", props: lollipopProps(4) },
    ],
    balloon: [
      { ms: 280, eyes: "open", mouth: "neutral", props: balloonProps(2) },
      { ms: 500, eyes: "open", mouth: "neutral", props: balloonProps(0) },
      { ms: 450, eyes: "open", mouth: "neutral", props: balloonProps(-1) },
      { ms: 450, eyes: "open", mouth: "neutral", props: balloonProps(0) },
      { ms: 450, eyes: "open", mouth: "neutral", props: balloonProps(-1) },
      { ms: 90, eyes: "wide", mouth: "o", props: burstProps(-1) },
      { ms: 260, eyes: "wide", mouth: "o", props: [] },
      { ms: 300, eyes: "open", mouth: "neutral", props: [] },
    ],
    chess: [
      { ms: 350, eyes: "open", mouth: "neutral", props: chessProps(0) },
      { ms: 500, eyes: "happy", mouth: "neutral", props: chessProps(1) },
      { ms: 500, eyes: "happy", mouth: "neutral", props: chessProps(2) },
      { ms: 550, eyes: "happy", mouth: "neutral", props: chessProps(3) },
      { ms: 300, eyes: "open", mouth: "happy", props: chessProps(0) }, // aha!
      { ms: 350, eyes: "open", mouth: "neutral", props: chessProps(0) },
    ],
  };

  let canvas, ctx, auraEl;
  let blinkTimer = null, revertTimer = null, quirkTimer = null;
  let fireTimer = null, sweatTimer = null;
  let attractTimer = null, attractRafHandle = null, attractActive = false;
  let sleeperTimer = null, zzzTimer = null, sleeping = false;
  let gestureTimer = null, gestureIndex = 0, idleAttractActive = false;
  let runId = 0; // bumped on every new animation; stale callbacks check this and no-op
  let busy = false; // true while a reaction or quirk frame sequence owns the canvas

  let hitStreak = 0;
  let onFire = false;
  let aura = false; // Fase 3: racha >= 5 -- a lighter glow than the >= 10 "on fire" escalation
  let panicking = false;
  let currentScreen = null;
  let lastExpressionChangeAt = 0; // Fase 3: throttles react()'s pose change during "game" -- see its own comment

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function fillPixel(x, y) {
    ctx.fillRect(x * SCALE, (y + PROP_TOP_ROWS) * SCALE, SCALE, SCALE);
  }

  function paint(moodKey, eyesOverride, mouthOverride, props) {
    const mood = MOODS[moodKey] || MOODS.idle;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = cssVar(mood.body);
    BODY.concat(ANTENNA_STALK).forEach(([x, y]) => fillPixel(x, y));

    ctx.fillStyle = cssVar(mood.tip);
    ANTENNA_TIP.forEach(([x, y]) => fillPixel(x, y));

    ctx.fillStyle = INK;
    (EYES[eyesOverride || mood.eyes] || EYES.open).forEach(([x, y]) => fillPixel(x, y));
    MOUTHS[mouthOverride || mood.mouth].forEach(([x, y]) => fillPixel(x, y));

    if (mood.sparkle) {
      ctx.fillStyle = cssVar("--neon-yellow");
      SPARKLE.forEach(([x, y]) => fillPixel(x, y));
    }

    (props || []).forEach(({ pixels, color }) => {
      ctx.fillStyle = color;
      pixels.forEach(([x, y]) => fillPixel(x, y));
    });
  }

  // -- idle baseline: applies the on-fire / panic status overlay (if any)
  // on top of a plain idle pose. This is the only place those overlays are
  // drawn -- reactions and quirks are left alone even if a status is active.
  function paintIdle(eyesOverride) {
    let eyes = eyesOverride || "open";
    let mouth = "neutral";
    let props = [];
    if (onFire) {
      props = fireProps(fireFrame).concat(shadesProps());
    } else if (panicking) {
      eyes = "wide";
      mouth = "o";
      props = sweatProps(sweatFrame);
    }
    paint("idle", eyes, mouth, props);
    canvas.classList.toggle("pet-shake", panicking && !onFire);
  }

  function isBusy() {
    return busy || attractActive || sleeping;
  }

  // idleAttractActive is intentionally NOT part of isBusy(): reactions and
  // the wandering attract/sleeper modes must still be able to interrupt it
  // (see react() and enterIdleAttract() below), it just quiets the generic
  // random-quirk scheduler while it owns the canvas -- see scheduleQuirk().

  // -- blink -----------------------------------------------------------

  function scheduleBlink() {
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      if (isBusy() || onFire || panicking) return; // fire/panic have their own eyes; don't fight them
      paintIdle("blink");
      blinkTimer = setTimeout(() => {
        if (!isBusy()) paintIdle();
        scheduleBlink();
      }, 150);
    }, 2800 + Math.random() * 2200);
  }

  // -- reactions (hit / wrong / timeout) --------------------------------

  function react(kind, durationMs, streak) {
    if (!canvas || !MOODS[kind]) return;
    if (typeof streak === "number") {
      hitStreak = streak;
      setOnFire(hitStreak >= 10);
      setAura(hitStreak >= 5);
    }

    // Fase 3: "cambio de expresión de mascota ... máximo 1 cambio cada
    // 400ms" -- only during actual gameplay (results/etc. reactions above
    // always get their pose; hitStreak/on-fire/aura tracking above still
    // ran either way, so score-driven state never falls behind, only the
    // face's own repaint gets skipped when it's too soon).
    if (currentScreen === "game") {
      const throttleMs = (window.BatakAnim && window.BatakAnim.DELAYS.game.petExpressionThrottle) || 400;
      const now = performance.now();
      if (now - lastExpressionChangeAt < throttleMs) return;
      lastExpressionChangeAt = now;
    }

    runId += 1; // aborts any in-flight quirk/attract/sleeper step -- gameplay feedback wins
    busy = true;
    stopAttractMode(true);
    stopSleeper();
    if (idleAttractActive) exitIdleAttract(); // menu never emits hit/wrong/timeout in practice, but stay correct if it ever does
    clearTimeout(blinkTimer);
    clearTimeout(revertTimer);
    clearTimeout(quirkTimer);

    const mood = MOODS[kind];
    const extra = onFire && kind === "hit" ? shadesProps() : [];
    // Approximates the spec's "120ms crossfade" for a pixel-art canvas
    // (no cheap way to cross-fade two drawn frames) -- a quick opacity dip
    // right as the new pose is painted, transform/opacity only per the
    // perf rules.
    if (window.BatakAnim) {
      window.BatakAnim.play(
        canvas,
        [{ opacity: 1 }, { opacity: 0.55 }, { opacity: 1 }],
        { duration: window.BatakAnim.DURATIONS.game.petCrossfade, easing: window.BatakAnim.EASINGS.standard },
        "pet-expression"
      );
    }
    paint(kind, null, null, extra);
    canvas.classList.remove("pet-hop", "pet-droop");
    void canvas.offsetWidth; // force reflow so re-adding the same class restarts its CSS animation
    if (mood.cls) canvas.classList.add(mood.cls);

    revertTimer = setTimeout(() => {
      busy = false;
      paintIdle();
      scheduleBlink();
      scheduleQuirk();
    }, durationMs || 450);
  }

  // -- on-fire / panic status ---------------------------------------------

  let fireFrame = 0, sweatFrame = 0;

  function setOnFire(active) {
    if (active === onFire) return;
    onFire = active;
    clearInterval(fireTimer);
    if (onFire) {
      fireTimer = setInterval(() => {
        fireFrame = 1 - fireFrame;
        if (!isBusy()) paintIdle();
      }, 220);
    }
    if (!isBusy()) paintIdle();
  }

  // Fase 3: "racha >= 5: aura pulsante en mascota, 800ms loop, mientras
  // dure la racha" -- a glow layer behind the canvas (#pet-aura in
  // index.html), not the canvas itself, so it never fights with
  // paint()/onFire's own props. Purely a class toggle; the 800ms loop
  // lives in style.css as a plain opacity `@keyframes` (no box-shadow/blur,
  // per the perf rules).
  function setAura(active) {
    if (active === aura) return;
    aura = active;
    if (auraEl) auraEl.classList.toggle("active", aura);
  }

  function setPanic(active) {
    if (active === panicking) return;
    panicking = active;
    clearInterval(sweatTimer);
    if (panicking) {
      sweatTimer = setInterval(() => {
        sweatFrame = 1 - sweatFrame;
        if (!isBusy()) paintIdle();
      }, 260);
    }
    if (!isBusy()) paintIdle();
  }

  // -- idle quirks: little scripted scenes -------------------------------

  function scheduleQuirk() {
    clearTimeout(quirkTimer);
    quirkTimer = setTimeout(() => {
      if (currentScreen === "game" || onFire || panicking || isBusy() || idleAttractActive) {
        scheduleQuirk(); // not a good moment -- try again later rather than force it
        return;
      }
      playQuirk(randomQuirkKey());
    }, 15000 + Math.random() * 10000);
  }

  function randomQuirkKey() {
    const keys = Object.keys(QUIRKS);
    return keys[Math.floor(Math.random() * keys.length)];
  }

  function playQuirk(key) {
    const frames = QUIRKS[key];
    if (!canvas || !frames) return;
    runId += 1;
    const myRun = runId;
    busy = true;
    clearTimeout(blinkTimer);

    let i = 0;
    const step = () => {
      if (myRun !== runId) return; // superseded by a react() or a later quirk
      if (i >= frames.length) {
        busy = false;
        paintIdle();
        scheduleBlink();
        scheduleQuirk();
        return;
      }
      const f = frames[i++];
      paint("idle", f.eyes, f.mouth, f.props);
      quirkTimer = setTimeout(step, f.ms);
    };
    step();
  }

  // -- Fase 1 idle/atracción: gestures ------------------------------------
  // Driven from idle.js's enterIdleAttract()/exitIdleAttract(), called once
  // the menu has sat untouched for 20s. Body stays in the breathing pose
  // (`.pet-breathe`, a CSS loop -- see style.css) the whole time; every 5s
  // one of these three short gestures plays on top of it, then it reverts
  // to breathing until the next one. Reuses the same {ms, eyes, mouth,
  // props} frame format as QUIRKS above.
  const GESTURES = {
    wave: [
      { ms: 300, eyes: "happy", mouth: "happy", props: [] },
      { ms: 300, eyes: "open", mouth: "happy", props: [] },
      { ms: 300, eyes: "happy", mouth: "happy", props: [] },
      { ms: 300, eyes: "open", mouth: "neutral", props: [] },
    ],
    yawn: [
      { ms: 300, eyes: "blink", mouth: "o", props: [] },
      { ms: 600, eyes: "blink", mouth: "o", props: [] },
      { ms: 300, eyes: "open", mouth: "neutral", props: [] },
    ],
    look: [
      { ms: 400, eyes: "lookLeft", mouth: "neutral", props: [] },
      { ms: 400, eyes: "lookRight", mouth: "neutral", props: [] },
      { ms: 400, eyes: "open", mouth: "neutral", props: [] },
    ],
  };
  const GESTURE_ORDER = ["wave", "yawn", "look"];

  function playGesture(key) {
    const frames = GESTURES[key];
    if (!canvas || !frames || !idleAttractActive || busy) return; // a reaction wins if one somehow lands here
    runId += 1;
    const myRun = runId;
    let i = 0;
    const step = () => {
      if (myRun !== runId || !idleAttractActive) return; // superseded -- see exitIdleAttract()
      if (i >= frames.length) {
        if (idleAttractActive) paintIdle(); // back to the plain breathing pose
        return;
      }
      const f = frames[i++];
      paint("idle", f.eyes, f.mouth, f.props);
      gestureTimer = setTimeout(step, f.ms);
    };
    step();
  }

  function scheduleGesture() {
    clearTimeout(gestureTimer);
    const interval = (window.BatakAnim && window.BatakAnim.DELAYS.idle.gestureInterval) || 5000;
    gestureTimer = setTimeout(() => {
      if (!idleAttractActive) return;
      const key = GESTURE_ORDER[gestureIndex % GESTURE_ORDER.length];
      gestureIndex += 1;
      playGesture(key);
      scheduleGesture();
    }, interval);
  }

  function enterIdleAttract() {
    if (idleAttractActive || !canvas || isBusy()) return;
    idleAttractActive = true;
    // The generic random-quirk scheduler and the wandering DVD-bounce/
    // peek-a-boo attract mode would otherwise fight this one for the
    // canvas -- pause both for as long as this runs.
    clearTimeout(quirkTimer);
    stopAttractMode(true);
    canvas.classList.add("pet-breathe");
    paintIdle();
    scheduleBlink();
    gestureIndex = 0;
    scheduleGesture();
  }

  function exitIdleAttract() {
    if (!idleAttractActive) return;
    idleAttractActive = false;
    runId += 1; // abort any gesture frame mid-flight
    clearTimeout(gestureTimer);
    canvas.classList.remove("pet-breathe");
    if (!isBusy()) paintIdle();
    scheduleBlink();
    scheduleQuirk();
    if (currentScreen === "menu") scheduleAttractMode();
  }

  // -- Fase 2 entrada al juego: reposition nudge --------------------------
  // Driven from intro.js right as the countdown starts (both the fresh
  // session and the 2P handoff). Purely a CSS transform bounce on the
  // canvas element itself -- doesn't touch paint()/mood, so it layers
  // fine on top of whatever pose is currently showing.
  function playIntroReposition() {
    if (!canvas) return;
    canvas.classList.remove("pet-intro");
    void canvas.offsetWidth; // force reflow so a second nudge (e.g. 2P handoff) restarts the animation
    canvas.classList.add("pet-intro");
    const ms = (window.BatakAnim && window.BatakAnim.DURATIONS.intro.petReposition) || 400;
    setTimeout(() => canvas.classList.remove("pet-intro"), ms);
  }

  // -- attract mode (menu only): DVD-bounce or peek-a-boo -----------------

  function scheduleAttractMode() {
    clearTimeout(attractTimer);
    attractTimer = setTimeout(() => {
      if (currentScreen === "menu" && !isBusy() && !idleAttractActive) startAttractMode();
      else scheduleAttractMode();
    }, 12000 + Math.random() * 8000);
  }

  function stopAttractMode(snapHome) {
    clearTimeout(attractTimer);
    if (!attractActive) return;
    attractActive = false;
    if (attractRafHandle) cancelAnimationFrame(attractRafHandle);
    attractRafHandle = null;
    canvas.classList.remove("pet-flash");
    if (snapHome) {
      canvas.style.transition = "";
      canvas.style.left = "";
      canvas.style.top = "";
    } else {
      goHome();
    }
  }

  function goHome(after) {
    canvas.style.transition = "left 0.5s ease, top 0.5s ease";
    canvas.style.left = `${HOME_LEFT}px`;
    canvas.style.top = `${HOME_TOP}px`;
    setTimeout(() => {
      canvas.style.transition = "";
      canvas.style.left = "";
      canvas.style.top = "";
      if (after) after();
    }, 520);
  }

  function startAttractMode() {
    if (currentScreen !== "menu" || isBusy() || idleAttractActive) return;
    runId += 1;
    const myRun = runId;
    attractActive = true;
    clearTimeout(blinkTimer);
    clearTimeout(quirkTimer);
    if (Math.random() < 0.5) runDvdBounce(myRun);
    else runPeekaboo(myRun);
  }

  function endAttractMode(myRun) {
    if (myRun !== runId) return;
    attractActive = false;
    goHome(() => {
      if (myRun !== runId || currentScreen !== "menu") return;
      paintIdle();
      scheduleBlink();
      scheduleQuirk();
      scheduleAttractMode();
    });
  }

  function runDvdBounce(myRun) {
    const w = canvas.offsetWidth || CANVAS_W;
    const h = canvas.offsetHeight || CANVAS_H;
    let x = HOME_LEFT, y = HOME_TOP;
    let vx = 2.4, vy = 2.1;
    const start = performance.now();
    canvas.style.left = `${x}px`;
    canvas.style.top = `${y}px`;

    function frame(now) {
      if (myRun !== runId || currentScreen !== "menu") return;
      const maxX = window.innerWidth - w;
      const maxY = window.innerHeight - h;
      x += vx;
      y += vy;
      let hitX = false, hitY = false;
      if (x <= 0) { x = 0; vx = Math.abs(vx); hitX = true; }
      if (x >= maxX) { x = maxX; vx = -Math.abs(vx); hitX = true; }
      if (y <= 0) { y = 0; vy = Math.abs(vy); hitY = true; }
      if (y >= maxY) { y = maxY; vy = -Math.abs(vy); hitY = true; }
      canvas.style.left = `${x}px`;
      canvas.style.top = `${y}px`;

      if (hitX && hitY) {
        // exact corner hit -- extreme celebration, then head home
        paint("hit", "happy", "happy", burstProps(-4, cssVar("--neon-magenta")).concat(shadesProps()));
        canvas.classList.add("pet-flash");
        setTimeout(() => endAttractMode(myRun), 700);
        return;
      }
      if (now - start > 9000) {
        endAttractMode(myRun);
        return;
      }
      attractRafHandle = requestAnimationFrame(frame);
    }
    attractRafHandle = requestAnimationFrame(frame);
  }

  function runPeekaboo(myRun) {
    const h = canvas.offsetHeight || CANVAS_H;
    const hideTop = window.innerHeight - h * 0.22;
    const peekTop = window.innerHeight - h * 0.75;
    const x = Math.max(16, Math.min(window.innerWidth - (canvas.offsetWidth || CANVAS_W) - 16, window.innerWidth * 0.5));
    canvas.style.transition = "top 0.4s ease-in";
    canvas.style.left = `${x}px`;
    canvas.style.top = `${hideTop}px`;
    paintIdle("blink");

    let cycle = 0;
    const peek = () => {
      if (myRun !== runId || currentScreen !== "menu") return;
      canvas.style.transition = "top 0.35s ease-out";
      canvas.style.top = `${peekTop}px`;
      paintIdle("open");
      quirkTimer = setTimeout(() => {
        if (myRun !== runId || currentScreen !== "menu") return;
        canvas.style.transition = "top 0.35s ease-in";
        canvas.style.top = `${hideTop}px`;
        paintIdle("blink");
        cycle += 1;
        if (cycle >= 3) {
          quirkTimer = setTimeout(() => endAttractMode(myRun), 500);
        } else {
          quirkTimer = setTimeout(peek, 900);
        }
      }, 750);
    };
    quirkTimer = setTimeout(peek, 700);
  }

  // -- leaderboard sleeper (results screen, once things have settled) -----

  function scheduleSleeper() {
    clearTimeout(sleeperTimer);
    sleeperTimer = setTimeout(() => {
      if (currentScreen === "results" && !isBusy()) startSleeping();
    }, 9000);
  }

  function stopSleeper() {
    clearTimeout(sleeperTimer);
    clearTimeout(zzzTimer);
    if (sleeping) {
      sleeping = false;
      if (!busy) paintIdle();
    }
  }

  function startSleeping() {
    if (currentScreen !== "results" || isBusy()) return;
    sleeping = true;
    let stage = 0;
    const tick = () => {
      if (!sleeping || currentScreen !== "results") return;
      paint("idle", "blink", "neutral", zzzProps(stage));
      stage = (stage + 1) % 3;
      zzzTimer = setTimeout(tick, 700);
    };
    tick();
  }

  // -- post-round leaderboard reaction ------------------------------------

  function onResults(players, leaderboard) {
    if (!canvas) return;
    stopSleeper();
    scheduleSleeper();
    const list = leaderboard || [];
    const matches = (p) => list.findIndex((e) => e.name === p.name && e.score === p.score);
    const ranks = (players || []).map(matches).filter((i) => i >= 0);
    const madeTop3 = ranks.some((i) => i < 3);
    const onBoardAtAll = ranks.length > 0;

    // Fase 5: "mascota celebra o se desanima, 1.5s" -- all three beats
    // below share that one duration (DURATIONS.results.petCelebrate)
    // rather than each hardcoding its own.
    const celebrateMs = (window.BatakAnim && window.BatakAnim.DURATIONS.results.petCelebrate) || 1500;

    if (madeTop3) {
      playTakeover(celebrateMs);
    } else if (!onBoardAtAll && list.length > 0) {
      playFailedToRank(celebrateMs);
    } else {
      react("hit", celebrateMs); // ordinary celebration -- on the board, just not top 3 (or board was empty)
    }
  }

  function playTakeover(durationMs) {
    runId += 1;
    busy = true;
    clearTimeout(blinkTimer);
    clearTimeout(quirkTimer);
    paint("hit", "happy", "happy", burstProps(-4, cssVar("--neon-magenta")).concat(shadesProps()));
    canvas.classList.remove("pet-hop", "pet-droop");
    void canvas.offsetWidth;
    canvas.classList.add("pet-hop");
    revertTimer = setTimeout(() => {
      busy = false;
      paintIdle();
      scheduleBlink();
      scheduleQuirk();
    }, durationMs);
  }

  function playFailedToRank(durationMs) {
    runId += 1;
    busy = true;
    clearTimeout(blinkTimer);
    clearTimeout(quirkTimer);
    paint("idle", "sad", "sad", puddleProps().concat(fSignProps()));
    canvas.classList.remove("pet-hop", "pet-droop");
    void canvas.offsetWidth;
    canvas.classList.add("pet-droop");
    revertTimer = setTimeout(() => {
      busy = false;
      paintIdle();
      scheduleBlink();
      scheduleQuirk();
    }, durationMs);
  }

  // -- context feed from app.js's render loop ------------------------------

  function setContext(screen, timeLeft, roundDuration) {
    const screenChanged = screen !== currentScreen;
    currentScreen = screen;

    const shouldPanic = screen === "game" && roundDuration > 0 && timeLeft <= 10 && timeLeft > 0;
    setPanic(shouldPanic);

    if (screenChanged) {
      // A reaction/celebration in flight here (busy === true) can only be a
      // leftover from the screen just left -- a mid-round hit/wrong/timeout
      // reaction, or the results takeover/failed-to-rank beat if the user
      // clicked away before its 1.8-2.6s ran out. onScreenEnter() (called
      // right before this, in the same render()) is the only thing that
      // *starts* a reaction on screen entry, and it only ever does that for
      // "results" -- so everywhere else it's safe to force it to finish
      // early rather than let it keep painting over the new screen for
      // however long it had left.
      if (screen !== "results") {
        runId += 1;
        clearTimeout(revertTimer);
        busy = false;
        canvas.classList.remove("pet-hop", "pet-droop");
      }
      stopAttractMode(true);
      stopSleeper();
      clearTimeout(attractTimer);
      clearTimeout(sleeperTimer);
      if (screen === "menu") scheduleAttractMode();
      if (screen === "results") scheduleSleeper();
      if (!isBusy()) paintIdle();
    }
  }

  function init() {
    canvas = document.getElementById("pet-canvas");
    if (!canvas) return;
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    auraEl = document.getElementById("pet-aura");
    paintIdle();
    scheduleBlink();
    scheduleQuirk();
  }

  document.addEventListener("DOMContentLoaded", init);
  window.BatakPet = { react, setContext, onResults, enterIdleAttract, exitIdleAttract, playIntroReposition };
})();
