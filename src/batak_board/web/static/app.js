// Batak Board web dashboard client.
//
// Renders whatever `state` the server pushes over the WebSocket; the
// server is the single source of truth (mirrors what ui/app.py does for
// the desktop screens). The things kept purely client-side are player
// name text entry (only sent up once via "start_game"), the standalone
// leaderboard view (a local toggle, not a server screen -- the server
// already includes `leaderboard` in every state push regardless of
// screen, so there's nothing to ask it for), and hitStreak (derived from
// the same hit/wrong/timeout feedback events already used for the banner).

const FEEDBACK_TEXT = { hit: "+1", wrong: "FALLO", timeout: "MUY LENTO" };
const FEEDBACK_CLASS = { hit: "neon-green", wrong: "neon-red", timeout: "neon-yellow" };
const DIFFICULTY_LABELS = { easy: "Fácil", medium: "Medio", hard: "Difícil" };

let socket = null;
let lastScreen = null;
let lastFeedbackSeq = -1;
let feedbackClearTimer = null;
let showingLeaderboardOnly = false;
let hitStreak = 0;
let lastActiveIndex = null;
let previousActiveButton = null; // read by duringplay.js's onFeedback() -- see updateGame()
let roundEndPlaying = false; // Fase 4 outro in flight -- see render()

const els = {
  connectionBanner: document.getElementById("connection-banner"),
  themeToggle: document.getElementById("theme-toggle"),
  modeSelector: document.getElementById("mode-selector"),
  difficultySelector: document.getElementById("difficulty-selector"),
  playerInputs: document.getElementById("player-inputs"),
  turnLabel: document.getElementById("turn-label"),
  scoreLabel: document.getElementById("score-label"),
  feedbackBanner: document.getElementById("feedback-banner"),
  timerTrack: document.getElementById("timer-track"),
  timerFill: document.getElementById("timer-fill"),
  timerLabel: document.getElementById("timer-label"),
  ledGrid: document.getElementById("led-grid"),
  simHint: document.getElementById("sim-hint"),
  readyOverlay: document.getElementById("ready-overlay"),
  readyLabel: document.getElementById("ready-label"),
  introOverlay: document.getElementById("intro-overlay"),
  winnerLabel: document.getElementById("winner-label"),
  breakdown: document.getElementById("breakdown"),
  leaderboard: document.getElementById("leaderboard"),
  leaderboardStandalone: document.getElementById("leaderboard-standalone"),
};

// -- theme (light/dark), persisted per-browser via localStorage ----------

function applyTheme(mode) {
  // Fase 7: "cambio de tema claro/oscuro, 400ms" -- see the
  // .theme-transitioning rule in style.css for why this is a class swap
  // instead of a permanent transition on every element.
  const swapMs = window.BatakAnim ? window.BatakAnim.DURATIONS.micro.themeSwap : 400;
  document.documentElement.classList.add("theme-transitioning");
  document.documentElement.dataset.theme = mode;
  els.themeToggle.innerHTML = mode === "light" ? "&#127769; OSCURO" : "&#9728; CLARO";
  setTimeout(() => document.documentElement.classList.remove("theme-transitioning"), swapMs);
}

(function initTheme() {
  let saved = "dark";
  try {
    saved = localStorage.getItem("batak-theme") || "dark";
  } catch (e) {
    // localStorage unavailable (private browsing etc.) - default to dark.
  }
  applyTheme(saved);
})();

els.themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  applyTheme(next);
  try {
    localStorage.setItem("batak-theme", next);
  } catch (e) {
    // ignore - theme just won't persist across reloads
  }
});

// -- "modo simple" toggle: forces reducedMotion regardless of the OS-level
// prefers-reduced-motion setting -- anim.js owns the flag/persistence,
// this is just the checkbox reflecting and driving it. -------------------

(function initSimpleModeToggle() {
  const toggle = document.getElementById("simple-mode-toggle");
  if (!toggle || !window.BatakAnim) return;
  toggle.checked = window.BatakAnim.simpleMode;
  toggle.addEventListener("change", () => {
    window.BatakAnim.setSimpleMode(toggle.checked);
    if (window.BatakMicro) window.BatakMicro.toast(toggle.checked ? "Modo simple activado" : "Modo simple desactivado");
  });
})();

function send(action, extra) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(Object.assign({ action }, extra)));
  }
}

// -- LED grid: built once, then just toggled per state update --------

const LED_COUNT = 12;
for (let i = 0; i < LED_COUNT; i++) {
  const cell = document.createElement("button");
  cell.className = "led-cell";
  cell.textContent = String(i + 1);
  cell.disabled = true;
  cell.addEventListener("click", () => send("press_button", { index: i }));
  els.ledGrid.appendChild(cell);
}

// -- static control bindings -----------------------------------------

els.modeSelector.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => send("set_mode", { value: btn.dataset.value }));
});
els.difficultySelector.querySelectorAll("button").forEach((btn) => {
  btn.addEventListener("click", () => send("set_difficulty", { value: btn.dataset.value }));
});
document.getElementById("btn-start-menu").addEventListener("click", () => send("goto_player_setup"));
document.getElementById("btn-back").addEventListener("click", () => send("back_to_menu"));
document.getElementById("btn-continue").addEventListener("click", () => {
  const names = Array.from(els.playerInputs.querySelectorAll("input")).map((input) => input.value);
  send("start_game", { names });
});
document.getElementById("btn-ready").addEventListener("click", () => send("ready_next"));
document.getElementById("btn-restart").addEventListener("click", () => send("restart"));

// The leaderboard-only view is purely local: the server already streams
// `leaderboard` in every state push regardless of screen, so there's no
// command to send -- just show the (already-live) standalone panel.
document.getElementById("btn-view-leaderboard").addEventListener("click", () => {
  showingLeaderboardOnly = true;
  showScreen("leaderboard");
});
document.getElementById("btn-leaderboard-back").addEventListener("click", () => {
  showingLeaderboardOnly = false;
  showScreen(lastScreen || "menu");
});

// -- rendering ----------------------------------------------------

function showScreen(screen) {
  document.querySelectorAll(".screen").forEach((section) => {
    section.classList.toggle("visible", section.id === `screen-${screen}`);
  });
}

function render(state) {
  // Multi-device safety: if any connected browser starts a game, drop out
  // of this purely-local view rather than stranding it out of sync.
  if (state.screen !== "menu") showingLeaderboardOnly = false;

  // Always safe regardless of what's actually showing right now -- the
  // standalone leaderboard view and idle.js's 20s timer don't care whether
  // Fase 4's outro (below) is mid-flight.
  renderLeaderboardList(els.leaderboardStandalone, state.leaderboard);
  window.BatakLeaderboardTop = (state.leaderboard && state.leaderboard[0]) || null; // read by idle.js's text rotation
  if (window.BatakIdle) window.BatakIdle.setMenuActive(state.screen === "menu");

  if (roundEndPlaying) {
    if (state.screen === "results") return; // still playing, nothing else to do this tick
    // Safety net for an edge case that shouldn't happen in normal play
    // (see roundend.js's header comment): the server moved on from
    // "results" while the outro was still mid-sequence -- abandon it
    // cleanly rather than leave the UI stuck showing a stale "game"
    // screen underneath.
    roundEndPlaying = false;
    if (window.BatakRoundEnd) window.BatakRoundEnd.cancel();
  }

  // Computed before lastScreen is updated below -- true exactly once, on
  // the render() where a fresh session's countdown begins (menu/player_setup
  // -> game). The 2P ready->countdown handoff never hits this (screen stays
  // "game" throughout); intro.js's onState() picks that case up instead.
  const enteringGameFresh = state.screen !== lastScreen && state.screen === "game" && state.awaiting_intro;
  // True exactly once, when a round genuinely ends (not the 2P mid-session
  // handoff, which keeps screen === "game" and uses the ready-overlay
  // instead -- see roundend.js's header comment for why that's excluded).
  const enteringResultsFresh = state.screen !== lastScreen && state.screen === "results" && lastScreen === "game";

  if (enteringResultsFresh && window.BatakRoundEnd) {
    roundEndPlaying = true;
    window.BatakRoundEnd.play(() => {
      roundEndPlaying = false;
      onScreenEnter(state);
      lastScreen = state.screen;
      showScreen(showingLeaderboardOnly ? "leaderboard" : state.screen);
      if (window.BatakPet) window.BatakPet.setContext(state.screen, state.time_left, state.round_duration);
    });
    return; // the game screen keeps showing exactly as last rendered (frozen grid, etc.) until the outro finishes
  }

  if (state.screen !== lastScreen) {
    if (lastScreen === "results" && window.BatakResults) window.BatakResults.exit();
    onScreenEnter(state);
    lastScreen = state.screen;
  }
  showScreen(showingLeaderboardOnly ? "leaderboard" : state.screen);

  if (window.BatakPet) window.BatakPet.setContext(state.screen, state.time_left, state.round_duration);
  if (window.BatakIntro) {
    if (enteringGameFresh) window.BatakIntro.enter();
    window.BatakIntro.onState(state);
  }
  if (state.screen === "menu") updateMenu(state);
  if (state.screen === "game") updateGame(state);
}

function onScreenEnter(state) {
  if (state.screen === "player_setup") buildPlayerInputs(state);
  if (state.screen === "game") resetStreak();
  if (state.screen === "results") {
    buildResults(state);
    if (window.BatakResults) window.BatakResults.enter(state); // owns all of Fase 5's timing, including the pet reaction -- see results.js
  }
}

function updateMenu(state) {
  els.modeSelector.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === state.mode);
  });
  els.difficultySelector.querySelectorAll("button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === state.difficulty);
  });
}

function buildPlayerInputs(state) {
  els.playerInputs.innerHTML = "";
  const defaults = state.mode === "two_player" ? ["Jugador 1", "Jugador 2"] : ["Jugador"];
  defaults.forEach((defaultName) => {
    const wrapper = document.createElement("div");
    wrapper.className = "player-field";
    const label = document.createElement("label");
    label.textContent = defaultName.toUpperCase();
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = defaultName;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    els.playerInputs.appendChild(wrapper);
  });
}

function resetStreak() {
  hitStreak = 0;
  lastActiveIndex = null;
  previousActiveButton = null;
}

function updateGame(state) {
  const activeIndex = state.players.findIndex((p) => p.active);
  const active = state.players[activeIndex >= 0 ? activeIndex : 0];
  if (activeIndex !== lastActiveIndex) {
    // A fresh turn (including the 2-player handoff) starts its own streak.
    hitStreak = 0;
    lastActiveIndex = activeIndex;
    // Fase 6: turn card entrance -- only a real turn *change* in 2P mode,
    // not single player's own one-time -1->0 transition at game start
    // (intro.js already owns that moment).
    if (state.mode === "two_player" && window.BatakTwoPlayer) window.BatakTwoPlayer.onTurnChange();
  }

  els.turnLabel.textContent = state.mode === "two_player" && active ? `TURNO DE: ${active.name.toUpperCase()}` : "";
  if (window.BatakTwoPlayer) window.BatakTwoPlayer.setNamePulse(state.mode === "two_player" && !!active);
  els.scoreLabel.textContent = active ? active.score : 0;

  const fraction = state.round_duration > 0 ? Math.max(0, Math.min(1, state.time_left / state.round_duration)) : 0;
  els.timerFill.style.width = `${fraction * 100}%`;
  els.timerFill.style.background =
    fraction < 0.15 ? "var(--neon-red)" : fraction < 0.4 ? "var(--neon-yellow)" : "var(--neon-green)";
  els.timerLabel.textContent = `${state.time_left.toFixed(1)}s`;

  const gridLocked = state.is_hardware || state.awaiting_ready || state.awaiting_intro;
  els.ledGrid.querySelectorAll(".led-cell").forEach((cell, i) => {
    cell.classList.toggle("active", i === state.active_button);
    cell.disabled = gridLocked;
    cell.classList.toggle("clickable", !state.is_hardware && !state.awaiting_ready && !state.awaiting_intro);
  });
  els.simHint.hidden = state.is_hardware;

  if (state.feedback_seq !== lastFeedbackSeq && state.last_feedback) {
    lastFeedbackSeq = state.feedback_seq;
    pulseFeedback(state.last_feedback);
    // previousActiveButton is still last tick's value here -- the engine
    // has already moved active_button on to the *next* LED by the time
    // this feedback arrives, so this is the one that was actually just
    // hit/missed. See duringplay.js.
    if (window.BatakDuringPlay) window.BatakDuringPlay.onFeedback(state.last_feedback, previousActiveButton);
  }
  previousActiveButton = state.active_button;

  if (window.BatakDuringPlay) window.BatakDuringPlay.setUrgency(state.time_left, state.round_duration);

  els.readyOverlay.hidden = !state.awaiting_ready;
  if (state.awaiting_ready) {
    els.readyLabel.textContent = `¡Listo, ${state.next_player_name}!`;
  }

  // Fase 2 countdown card -- see intro.js for what actually plays inside it.
  els.introOverlay.hidden = !state.awaiting_intro;
}

function pulseFeedback(kind) {
  els.feedbackBanner.textContent = FEEDBACK_TEXT[kind] || "";
  els.feedbackBanner.style.color = `var(--${FEEDBACK_CLASS[kind] || "text-muted"})`;

  hitStreak = kind === "hit" ? hitStreak + 1 : 0;
  if (window.BatakPet) window.BatakPet.react(kind, undefined, hitStreak); // purely cosmetic; see pet.js

  if (feedbackClearTimer) clearTimeout(feedbackClearTimer);
  feedbackClearTimer = setTimeout(() => {
    els.feedbackBanner.textContent = "";
  }, 450);
}

// -- leaderboard rendering (shared by the results screen and the
// standalone view) -----------------------------------------------------

function leaderboardRankOf(player, leaderboard) {
  return (leaderboard || []).findIndex((e) => e.name === player.name && e.score === player.score);
}

function renderLeaderboardList(container, leaderboard, newIndexes) {
  if (!container) return;
  container.innerHTML = "";
  if (!leaderboard || leaderboard.length === 0) {
    container.innerHTML = '<div class="leaderboard-empty">Aún no hay puntajes</div>';
    return;
  }
  leaderboard.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    // Marked, not animated, here -- results.js owns all of Fase 5's timing
    // (every row's own entrance, then this one's extra highlight+scroll a
    // beat later). The standalone leaderboard view never passes
    // newIndexes, so it never gets marked.
    if (newIndexes && newIndexes.has(i)) row.dataset.newEntry = "true";
    row.innerHTML = `<span class="rank">#${i + 1}</span><span class="name">${escapeHtml(entry.name)}</span><span class="score">${entry.score} pts</span><span class="difficulty">${DIFFICULTY_LABELS[entry.difficulty] || entry.difficulty}</span>`;
    container.appendChild(row);
  });
}

function buildResults(state) {
  els.winnerLabel.textContent = state.tie ? "¡EMPATE!" : state.winner_name ? `¡${state.winner_name.toUpperCase()} GANA! \u{1F3C6}` : "";

  els.breakdown.innerHTML = "";
  state.players.forEach((player) => {
    const rankIdx = leaderboardRankOf(player, state.leaderboard);
    const rankText = rankIdx >= 0 ? `Puesto #${rankIdx + 1}` : "Sin clasificar";
    const row = document.createElement("div");
    row.className = "breakdown-row";
    // score-count starts at 0 -- results.js counts it up to data-target;
    // score-detail (aciertos/fallos) stays out of the initial layout flow
    // until results.js reveals it a beat later (see its fadeIn()).
    row.innerHTML = `<span class="name">${escapeHtml(player.name)}</span><span class="score"><span class="score-count" data-target="${player.score}">0</span> pts</span><span class="score-detail">(${player.hits} aciertos / ${player.misses} fallos)</span><span class="rank-badge">${rankText}</span>`;
    els.breakdown.appendChild(row);
  });

  // Highlight rows for anyone from this round who landed in the top 3 --
  // same "did we make the podium" check pet.js's onResults() makes, kept
  // in sync manually since it's a two-line check, not worth sharing state over.
  const newIndexes = new Set();
  state.players.forEach((player) => {
    const idx = leaderboardRankOf(player, state.leaderboard);
    if (idx >= 0 && idx < 3) newIndexes.add(idx);
  });
  renderLeaderboardList(els.leaderboard, state.leaderboard, newIndexes);
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// -- WebSocket connection with simple auto-reconnect -------------------

let wasDisconnected = false; // only toast "Conectado" on a *re*connect, not the page's first-ever connect

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.onopen = () => {
    els.connectionBanner.hidden = true;
    if (wasDisconnected && window.BatakMicro) window.BatakMicro.toast("Conectado");
    wasDisconnected = false;
  };
  socket.onmessage = (event) => render(JSON.parse(event.data));
  socket.onclose = () => {
    els.connectionBanner.hidden = false;
    wasDisconnected = true;
    setTimeout(connect, 1500);
  };
  socket.onerror = () => socket.close();
}

connect();
