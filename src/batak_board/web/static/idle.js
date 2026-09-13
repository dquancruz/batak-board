// Batak Board — Fase 1: idle/atracción del menú.
//
// Purely decorative, same spirit as pet.js: it only reads state app.js
// already has (window.BatakLeaderboardTop, set each render -- see app.js)
// and the menu-active flag app.js feeds it via setMenuActive(); it never
// sends anything over the WebSocket or touches game state. Safe to delete
// this file (and its <script> tag + call site in app.js) without touching
// gameplay -- the menu just stops idling.
//
// Trigger: 20s with no pointerdown/keydown/touchstart while the menu
// screen is showing. Runs a ~12s loop (grid wave every 4s, text rotation
// every ~4.6s, mascot gestures every 5s via pet.js, CTA pulse every 2s via
// a plain CSS loop) until any input or a screen change, then fades out in
// 250ms and re-arms the 20s timer.

(function () {
  const SCOPE = "menu-idle";
  const DOT_COUNT = 12; // echoes the 12-button board, purely as a design motif

  let isMenuScreen = false;
  let active = false;
  let idleTimer = null;
  let waveTimer = null;
  let textTimer = null;
  let textIndex = 0;

  const els = {};

  function buildGrid() {
    els.grid = document.getElementById("attract-grid");
    if (!els.grid || els.grid.childElementCount) return;
    for (let i = 0; i < DOT_COUNT; i++) {
      const dot = document.createElement("span");
      dot.className = "attract-dot";
      els.grid.appendChild(dot);
    }
  }

  function currentTexts() {
    const top = window.BatakLeaderboardTop; // set by app.js's render(), or undefined if the board is empty
    const record = top ? `RÉCORD ACTUAL: ${top.score} PTS` : "¡SÉ EL PRIMERO EN EL PODIO!";
    return [record, "¿PODÉS SUPERARLO?"];
  }

  function scheduleIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (isMenuScreen) start();
    }, window.BatakAnim.DELAYS.idle.activateAfter);
  }

  function onInteraction() {
    if (active) stop();
    if (isMenuScreen) scheduleIdle();
  }

  function start() {
    if (active || !isMenuScreen) return;
    active = true;
    els.text = els.text || document.getElementById("attract-text");
    els.cta = els.cta || document.getElementById("btn-start-menu");

    if (els.grid) els.grid.classList.add("attract-grid-visible");
    if (els.cta) els.cta.classList.add("pulse-cta");
    if (window.BatakPet) window.BatakPet.enterIdleAttract();

    textIndex = 0;
    if (els.text) {
      els.text.hidden = false;
      els.text.style.opacity = 0;
      runText(true);
    }
    runWave();
  }

  function stop() {
    if (!active) return;
    active = false;
    window.BatakAnim.cancelScope(SCOPE);
    clearTimeout(waveTimer);
    clearTimeout(textTimer);

    if (els.cta) els.cta.classList.remove("pulse-cta");
    if (window.BatakPet) window.BatakPet.exitIdleAttract();

    const fade = window.BatakAnim.DURATIONS.idle.exitFade;
    if (els.grid) {
      window.BatakAnim.play(els.grid, [{ opacity: 1 }, { opacity: 0 }], { duration: fade, easing: window.BatakAnim.EASINGS.standard, fill: "forwards" }, SCOPE);
      setTimeout(() => {
        if (!active) els.grid.classList.remove("attract-grid-visible");
      }, fade);
    }
    if (els.text) {
      window.BatakAnim.play(els.text, [{ opacity: getComputedStyle(els.text).opacity }, { opacity: 0 }], { duration: fade, easing: window.BatakAnim.EASINGS.standard, fill: "forwards" }, SCOPE);
      setTimeout(() => {
        if (!active) {
          els.text.hidden = true;
          els.text.style.opacity = "";
        }
      }, fade);
    }
  }

  function runWave() {
    if (!active || !els.grid) return;
    const { gridWaveStep } = window.BatakAnim.DURATIONS.idle;
    const { gridWaveStagger, gridWaveInterval } = window.BatakAnim.DELAYS.idle;
    window.BatakAnim.stagger(els.grid.children, gridWaveStagger, (dot) => {
      if (!active) return;
      window.BatakAnim.play(
        dot,
        [
          { opacity: 0.35, transform: "scale(1)" },
          { opacity: 1, transform: "scale(1.2)" },
          { opacity: 0.35, transform: "scale(1)" },
        ],
        { duration: gridWaveStep, easing: window.BatakAnim.EASINGS.easeOut },
        SCOPE
      );
    });
    waveTimer = setTimeout(runWave, gridWaveInterval);
  }

  function runText(first) {
    if (!active || !els.text) return;
    const { textFadeOut, textFadeIn } = window.BatakAnim.DURATIONS.idle;
    const { textVisible } = window.BatakAnim.DELAYS.idle;

    const show = () => {
      if (!active) return;
      els.text.textContent = currentTexts()[textIndex % 2];
      textIndex += 1;
      window.BatakAnim.play(els.text, [{ opacity: 0 }, { opacity: 1 }], { duration: textFadeIn, easing: window.BatakAnim.EASINGS.standard, fill: "forwards" }, SCOPE);
      textTimer = setTimeout(runText, textVisible);
    };

    if (first) {
      show();
      return;
    }
    const fadeOut = window.BatakAnim.play(els.text, [{ opacity: 1 }, { opacity: 0 }], { duration: textFadeOut, easing: window.BatakAnim.EASINGS.standard, fill: "forwards" }, SCOPE);
    if (fadeOut) fadeOut.finished.then(show, show);
    else show();
  }

  function setMenuActive(isMenu) {
    if (isMenu === isMenuScreen) return;
    isMenuScreen = isMenu;
    if (isMenu) {
      scheduleIdle();
    } else {
      clearTimeout(idleTimer);
      stop();
    }
  }

  ["pointerdown", "keydown", "touchstart"].forEach((evt) => document.addEventListener(evt, onInteraction, { passive: true }));
  document.addEventListener("DOMContentLoaded", buildGrid);

  window.BatakIdle = { setMenuActive };
})();
