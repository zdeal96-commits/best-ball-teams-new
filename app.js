import {
  buildTeams,
  encodeResults,
  getSharedPlayers,
  groupTeamsByPlayer,
  parsePlayers
} from "./core.js";

const root = document.getElementById("root");
root.innerHTML = `
  <div class="app-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true">⛳</div>
      <div class="brand-copy">
        <p>Mobile scorecard tool</p>
        <h1>Best Ball Teams</h1>
      </div>
      <button type="button" class="install-button" id="install-button" hidden>Install</button>
    </header>

    <main class="content">
      <section class="intro">
        <p class="eyebrow">Fast pairing calculator</p>
        <h2>Turn one scorecard into every best-ball team.</h2>
        <p>Choose an 18-hole CSV. Your scores stay on this device.</p>
      </section>

      <section class="upload-card" aria-labelledby="upload-heading">
        <div class="step-row">
          <span class="step-number">1</span>
          <div>
            <h2 id="upload-heading">Choose scorecard CSV</h2>
            <p>Name and Hole 1–18 columns are detected automatically.</p>
          </div>
        </div>
        <label class="file-button" for="scorecard-file">
          <span aria-hidden="true">＋</span>
          <span id="file-button-text">Choose CSV</span>
        </label>
        <input id="scorecard-file" class="visually-hidden" type="file" accept=".csv,text/csv">
        <p class="status" id="status" role="status" aria-live="polite" hidden></p>
        <details class="format-help">
          <summary>CSV format help</summary>
          <p>The header row should include a player name column and all 18 holes, such as “Hole 1” through “Hole 18.”</p>
          <a href="sample.csv" download>Download a sample CSV</a>
        </details>
      </section>

      <section class="results-card" id="results" aria-labelledby="results-heading" hidden>
        <div class="results-topline">
          <div>
            <p class="eyebrow">Ready</p>
            <h2 id="results-heading"></h2>
          </div>
          <button type="button" class="text-button" id="reset-button">Start over</button>
        </div>

        <div class="action-grid">
          <button type="button" class="action-button action-button--pdf" id="pdf-button">
            <span aria-hidden="true">↓</span> Save PDF
          </button>
          <button type="button" class="action-button action-button--share" id="share-button">
            <span aria-hidden="true">↗</span> Share results
          </button>
        </div>

        <section class="top-teams" id="top-teams" aria-labelledby="top-teams-heading" hidden>
          <div class="section-heading-row">
            <div>
              <p class="eyebrow">Leaderboard</p>
              <h2 id="top-teams-heading">Best overall pairs</h2>
            </div>
            <span class="score-label">Score</span>
          </div>
          <ol class="podium-list" id="podium-list"></ol>
        </section>

        <section class="players-section" id="players-section" aria-labelledby="players-heading" hidden>
          <div class="section-heading-row players-heading-row">
            <div>
              <p class="eyebrow">All pairings</p>
              <h2 id="players-heading">Browse by player</h2>
            </div>
          </div>

          <label class="search-field">
            <span class="visually-hidden">Search players or teams</span>
            <span aria-hidden="true">⌕</span>
            <input id="search-input" type="search" placeholder="Search players or teams">
            <button type="button" id="clear-search" aria-label="Clear search" hidden>×</button>
          </label>

          <div class="player-list" id="player-list"></div>
        </section>
      </section>

      <footer>
        <strong>Private by design.</strong> CSV files are processed in your browser and are never uploaded.
      </footer>
    </main>
  </div>
`;

const elements = {
  clearSearch: document.getElementById("clear-search"),
  fileButtonText: document.getElementById("file-button-text"),
  fileInput: document.getElementById("scorecard-file"),
  installButton: document.getElementById("install-button"),
  pdfButton: document.getElementById("pdf-button"),
  playerList: document.getElementById("player-list"),
  playersSection: document.getElementById("players-section"),
  podiumList: document.getElementById("podium-list"),
  resetButton: document.getElementById("reset-button"),
  results: document.getElementById("results"),
  resultsHeading: document.getElementById("results-heading"),
  searchInput: document.getElementById("search-input"),
  shareButton: document.getElementById("share-button"),
  status: document.getElementById("status"),
  topTeams: document.getElementById("top-teams")
};

const state = {
  installPrompt: null,
  openPlayers: new Set(),
  players: getSharedPlayers(),
  search: "",
  teams: [],
  teamsByPlayer: [],
  totals: new Map()
};

const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

const playerId = (name) => `player-${encodeURIComponent(name).replace(/%/g, "-")}`;
const playerTotal = (player) => player.strokes.reduce((sum, score) => sum + score, 0);

function announce(text, tone = "neutral") {
  elements.status.textContent = text;
  elements.status.className = `status status--${tone}`;
  elements.status.hidden = !text;
}

function renderTopTeams() {
  elements.podiumList.replaceChildren();
  elements.topTeams.hidden = !state.teams.length;

  state.teams.slice(0, 5).forEach((team, index) => {
    const row = makeElement("li", "podium-row");
    const rank = makeElement("span", "rank", String(index + 1));
    rank.setAttribute("aria-label", `Rank ${index + 1}`);
    row.append(
      rank,
      makeElement("span", "podium-name", team.name),
      makeElement("strong", "", String(team.total))
    );
    elements.podiumList.append(row);
  });
}

function renderPlayerGroups() {
  const query = state.search.trim().toLowerCase();
  const filtered = !query
    ? state.teamsByPlayer
    : state.teamsByPlayer.filter(([player, pairs]) =>
      player.toLowerCase().includes(query)
      || pairs.some((team) => team.displayName.toLowerCase().includes(query))
    );

  elements.playerList.replaceChildren();

  if (!filtered.length) {
    elements.playerList.append(makeElement("p", "empty-search", "No matching players or teams."));
    return;
  }

  filtered.forEach(([player, pairs]) => {
    const sectionId = playerId(player);
    const isOpen = state.openPlayers.has(player);
    const article = makeElement("article", "player-card");
    const toggle = makeElement("button", "player-toggle");
    const copy = makeElement("span");
    const chevron = makeElement("span", "chevron", isOpen ? "−" : "+");
    const list = makeElement("div", "pair-list");

    toggle.type = "button";
    toggle.dataset.player = player;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-controls", sectionId);
    copy.append(
      makeElement("strong", "", player),
      makeElement("small", "", `${pairs.length} pairing${pairs.length === 1 ? "" : "s"} · individual total ${state.totals.get(player)}`)
    );
    chevron.setAttribute("aria-hidden", "true");
    toggle.append(copy, chevron);

    list.id = sectionId;
    list.hidden = !isOpen;
    pairs.forEach((team) => {
      const pairRow = makeElement("div", "pair-row");
      pairRow.append(
        makeElement("span", "", team.displayName),
        makeElement("strong", "", String(team.total))
      );
      list.append(pairRow);
    });

    article.append(toggle, list);
    elements.playerList.append(article);
  });
}

function renderResults() {
  state.teams = buildTeams(state.players);
  state.teamsByPlayer = groupTeamsByPlayer(state.teams);
  state.totals = new Map(state.players.map((player) => [player.name, playerTotal(player)]));
  elements.results.hidden = state.players.length === 0;
  elements.fileButtonText.textContent = state.players.length ? "Choose another CSV" : "Choose CSV";

  if (!state.players.length) return;

  elements.resultsHeading.textContent = `${state.players.length} players · ${state.teams.length} teams`;
  elements.playersSection.hidden = !state.teams.length;
  renderTopTeams();
  renderPlayerGroups();
}

async function loadFile(file) {
  announce("Reading your scorecard…");
  try {
    state.players = parsePlayers(await file.text());
    state.search = "";
    state.openPlayers.clear();
    elements.searchInput.value = "";
    elements.clearSearch.hidden = true;

    if (window.location.hash.startsWith("#results=")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    renderResults();
    if (!state.players.length) {
      announce("No complete players found. The CSV needs a name and scores for holes 1–18.", "error");
    } else if (state.players.length === 1) {
      announce("1 player loaded. Add at least 2 complete players to create teams.", "warning");
    } else {
      announce(`${state.players.length} players loaded · ${state.teams.length} teams created.`, "success");
    }
  } catch {
    state.players = [];
    renderResults();
    announce("That file could not be read. Try exporting the scorecard as a CSV again.", "error");
  }
}

function downloadPDF() {
  if (!state.players.length || !state.teams.length) {
    announce("Upload a CSV with at least 2 players first.", "warning");
    return;
  }
  if (!window.jspdf?.jsPDF) {
    announce("The PDF tool did not load. Check your connection, refresh, and try again.", "error");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const left = 42;
  const right = 570;
  const bottom = 742;
  let y = 44;

  const addHeader = (continued = false) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(11, 90, 61);
    doc.text(continued ? "Best Ball Teams - Continued" : "Best Ball Teams", left, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 94, 89);
    doc.text(`Players: ${state.players.length}   Teams: ${state.teams.length}   Generated: ${new Date().toLocaleString()}`, left, y);
    y += 12;
    doc.setDrawColor(11, 117, 78);
    doc.line(left, y, right, y);
    y += 18;
  };

  const newPageIfNeeded = (needed = 36) => {
    if (y + needed > bottom) {
      doc.addPage();
      y = 44;
      addHeader(true);
    }
  };

  addHeader();
  state.teamsByPlayer.forEach(([player, pairs]) => {
    newPageIfNeeded(42);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(11, 90, 61);
    doc.text(`${player} - Total: ${state.totals.get(player) ?? "-"}`, left, y);
    y += 15;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 35, 33);

    pairs.forEach((team) => {
      newPageIfNeeded(16);
      const safeName = team.displayName.length > 70 ? `${team.displayName.slice(0, 67)}...` : team.displayName;
      doc.text(safeName, left + 10, y);
      doc.setFont("helvetica", "bold");
      doc.text(String(team.total), right, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 13;
    });
    y += 8;
  });

  doc.save("best-ball-teams.pdf");
  announce("PDF saved to your device.", "success");
}

async function shareResults() {
  if (!state.players.length) {
    announce("Upload a CSV first.", "warning");
    return;
  }

  const url = new URL(window.location.href);
  url.hash = `results=${encodeResults(state.players)}`;
  const shareData = { title: "Best Ball Teams", text: "Best Ball Teams results", url: url.href };

  try {
    if (navigator.share && navigator.canShare?.(shareData) !== false) {
      await navigator.share(shareData);
      announce("Results shared.", "success");
      return;
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url.href);
      announce("Share link copied.", "success");
      return;
    }
    window.prompt("Copy this share link:", url.href);
  } catch (error) {
    if (error?.name !== "AbortError") window.prompt("Copy this share link:", url.href);
  }
}

function reset() {
  state.players = [];
  state.search = "";
  state.openPlayers.clear();
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  renderResults();
  announce("Ready for a new CSV.");
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

elements.fileInput.addEventListener("click", () => { elements.fileInput.value = ""; });
elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];
  if (file) loadFile(file);
});
elements.pdfButton.addEventListener("click", downloadPDF);
elements.shareButton.addEventListener("click", shareResults);
elements.resetButton.addEventListener("click", reset);
elements.searchInput.addEventListener("input", () => {
  state.search = elements.searchInput.value;
  elements.clearSearch.hidden = !state.search;
  renderPlayerGroups();
});
elements.clearSearch.addEventListener("click", () => {
  state.search = "";
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  renderPlayerGroups();
  elements.searchInput.focus();
});
elements.playerList.addEventListener("click", (event) => {
  const button = event.target.closest(".player-toggle");
  if (!button) return;
  const player = button.dataset.player;
  if (state.openPlayers.has(player)) state.openPlayers.delete(player);
  else state.openPlayers.add(player);
  renderPlayerGroups();
});
elements.installButton.addEventListener("click", async () => {
  if (!state.installPrompt) return;
  await state.installPrompt.prompt();
  state.installPrompt = null;
  elements.installButton.hidden = true;
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
  elements.installButton.hidden = false;
});

window.addEventListener("hashchange", () => {
  const shared = getSharedPlayers();
  if (!shared.length) return;
  state.players = shared;
  state.search = "";
  state.openPlayers.clear();
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  renderResults();
  announce(`Shared results loaded for ${shared.length} players.`, "success");
});

const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
if ("serviceWorker" in navigator && window.location.protocol === "https:" && !isLocalPreview) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

renderResults();
if (state.players.length) announce(`Shared results loaded for ${state.players.length} players.`, "success");
