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

const els = {
  connectionBanner: document.getElementById("connection-banner"),
  themeToggle: document.getElementById("theme-toggle"),
  modeSelector: document.getElementById("mode-selector"),
  difficultySelector: document.getElementById("difficulty-selector"),
  playerInputs: document.getElementById("player-inputs"),
  turnLabel: document.getElementById("turn-label"),
  scoreLabel: document.getElementById("score-label"),
  feedbackBanner: document.getElementById("feedback-banner"),
  timerFill: document.getElementById("timer-fill"),
  timerLabel: document.getElementById("timer-label"),
  ledGrid: document.getElementById("led-grid"),
  simHint: document.getElementById("sim-hint"),
  readyOverlay: document.getElementById("ready-overlay"),
  readyLabel: document.getElementById("ready-label"),
  winnerLabel: document.getElementById("winner-label"),
  breakdown: document.getElementById("breakdown"),
  leaderboard: document.getElementById("leaderboard"),
  leaderboardStandalone: document.getElementById("leaderboard-standalone"),
};

// -- theme (light/dark), persisted per-browser via localStorage ----------

function applyTheme(mode) {
  document.documentElement.dataset.theme = mode;
  els.themeToggle.innerHTML = mode === "light" ? "&#127769; OSCURO" : "&#9728; CLARO";
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

  if (state.screen !== lastScreen) {
    onScreenEnter(state);
    lastScreen = state.screen;
  }
  renderLeaderboardList(els.leaderboardStandalone, state.leaderboard); // kept live even off-screen
  showScreen(showingLeaderboardOnly ? "leaderboard" : state.screen);

  if (window.BatakPet) window.BatakPet.setContext(state.screen, state.time_left, state.round_duration);
  if (state.screen === "menu") updateMenu(state);
  if (state.screen === "game") updateGame(state);
}

function onScreenEnter(state) {
  if (state.screen === "player_setup") buildPlayerInputs(state);
  if (state.screen === "game") resetStreak();
  if (state.screen === "results") {
    buildResults(state);
    if (window.BatakPet) window.BatakPet.onResults(state.players, state.leaderboard); // takeover / failed-to-rank / plain celebration -- see pet.js
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
}

function updateGame(state) {
  const activeIndex = state.players.findIndex((p) => p.active);
  const active = state.players[activeIndex >= 0 ? activeIndex : 0];
  if (activeIndex !== lastActiveIndex) {
    // A fresh turn (including the 2-player handoff) starts its own streak.
    hitStreak = 0;
    lastActiveIndex = activeIndex;
  }

  els.turnLabel.textContent = state.mode === "two_player" && active ? `TURNO DE: ${active.name.toUpperCase()}` : "";
  els.scoreLabel.textContent = active ? active.score : 0;

  const fraction = state.round_duration > 0 ? Math.max(0, Math.min(1, state.time_left / state.round_duration)) : 0;
  els.timerFill.style.width = `${fraction * 100}%`;
  els.timerFill.style.background =
    fraction < 0.15 ? "var(--neon-red)" : fraction < 0.4 ? "var(--neon-yellow)" : "var(--neon-green)";
  els.timerLabel.textContent = `${state.time_left.toFixed(1)}s`;

  els.ledGrid.querySelectorAll(".led-cell").forEach((cell, i) => {
    cell.classList.toggle("active", i === state.active_button);
    cell.disabled = state.is_hardware || state.awaiting_ready;
    cell.classList.toggle("clickable", !state.is_hardware && !state.awaiting_ready);
  });
  els.simHint.hidden = state.is_hardware;

  if (state.feedback_seq !== lastFeedbackSeq && state.last_feedback) {
    lastFeedbackSeq = state.feedback_seq;
    pulseFeedback(state.last_feedback);
  }

  els.readyOverlay.hidden = !state.awaiting_ready;
  if (state.awaiting_ready) {
    els.readyLabel.textContent = `¡Listo, ${state.next_player_name}!`;
  }
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
    if (newIndexes && newIndexes.has(i)) {
      row.classList.add("leaderboard-row-new");
      row.style.animationDelay = `${i * 60}ms`;
    }
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
    row.innerHTML = `<span class="name">${escapeHtml(player.name)}</span><span class="score">${player.score} pts (${player.hits} aciertos / ${player.misses} fallos)</span><span class="rank-badge">${rankText}</span>`;
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

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${protocol}//${location.host}/ws`);

  socket.onopen = () => {
    els.connectionBanner.hidden = true;
  };
  socket.onmessage = (event) => render(JSON.parse(event.data));
  socket.onclose = () => {
    els.connectionBanner.hidden = false;
    setTimeout(connect, 1500);
  };
  socket.onerror = () => socket.close();
}

connect();
