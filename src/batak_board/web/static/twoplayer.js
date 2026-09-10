// Batak Board — Fase 6: modo 2 jugadores.
//
// Everything here only ever applies to two_player sessions -- single
// player never calls into this file. Two independent pieces:
//   - During play: the turn label gets a card-style entrance each time the
//     active player changes (500ms), and pulses gently the whole time
//     that player is up (700ms loop) -- called from app.js's updateGame().
//   - On results: a two-bar score comparison grows in (900ms each,
//     staggered 200ms), then a crown bounces onto the winner's bar
//     (600ms) -- called from results.js's enter(), once, only for
//     two_player sessions.
//
// Safe to delete (and its <script> tag + call sites in app.js/results.js)
// without touching gameplay -- purely cosmetic, no state read here is
// ever mutated, and results.js's own exit() already cancels any of this
// file's leftover animations along with the rest of #screen-results.
(function () {
  const SCOPE = "two-player";

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // -- during play: turn card + name pulse --------------------------------

  function onTurnChange() {
    const anim = window.BatakAnim;
    const label = document.getElementById("turn-label");
    if (!anim || !label) return;
    anim.play(
      label,
      [{ opacity: 0, transform: "translateY(-8px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: anim.DURATIONS.twoPlayer.turnCardIn, easing: anim.EASINGS.standard, fill: "forwards" },
      SCOPE
    );
  }

  function setNamePulse(active) {
    const label = document.getElementById("turn-label");
    if (label) label.classList.toggle("turn-label-pulse", !!active);
  }

  // -- results: score comparison + crown ----------------------------------

  function showComparison(state) {
    const anim = window.BatakAnim;
    const container = document.getElementById("two-player-compare");
    const players = state.players || [];
    if (!container) return;
    if (!anim || players.length !== 2) {
      container.hidden = true;
      return;
    }

    const D = anim.DURATIONS.twoPlayer;
    const L = anim.DELAYS.twoPlayer;
    const maxScore = Math.max(1, players[0].score, players[1].score); // avoid a /0 when both scored 0
    const winnerIdx = state.tie || players[0].score === players[1].score ? -1 : players[0].score > players[1].score ? 0 : 1;

    container.innerHTML = "";
    container.hidden = false;
    const rows = players.map((p) => {
      const row = document.createElement("div");
      row.className = "compare-bar-row";
      row.innerHTML =
        '<span class="compare-crown" aria-hidden="true">\u{1F451}</span>' +
        `<span class="compare-name">${escapeHtml(p.name)}</span>` +
        '<div class="compare-track"><div class="compare-fill"></div></div>' +
        `<span class="compare-score">${p.score}</span>`;
      container.appendChild(row);
      return row;
    });

    // Barras crecen (900ms c/u, stagger 200ms) -- scaleX, not width, per
    // the perf rules; transform-origin:left (see style.css) makes it read
    // as growing from the axis instead of scaling from the center.
    anim.stagger(rows, L.barStagger, (row, i) => {
      const fill = row.querySelector(".compare-fill");
      const fraction = players[i].score / maxScore;
      anim.play(
        fill,
        [{ transform: "scaleX(0)" }, { transform: `scaleX(${fraction})` }],
        { duration: D.barGrow, easing: anim.EASINGS.easeOut, fill: "forwards" },
        SCOPE
      );
    });

    // Corona sobre el ganador (600ms con rebote), right as the bars finish
    // growing -- see style.css's compare-crown-in keyframe for the bounce.
    if (winnerIdx >= 0) {
      const growSpan = D.barGrow + L.barStagger * (rows.length - 1);
      setTimeout(() => {
        rows[winnerIdx].classList.add("compare-winner");
        const crown = rows[winnerIdx].querySelector(".compare-crown");
        if (crown) crown.classList.add("show");
      }, growSpan);
    }
  }

  window.BatakTwoPlayer = { onTurnChange, setNamePulse, showComparison };
})();
