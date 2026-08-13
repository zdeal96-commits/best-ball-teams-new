import {
  buildTeams,
  encodeIndividualResults,
  getSharedResults,
  groupTeamsByPlayer,
  parsePlayers
} from "./core.js?v=5";

const root = document.getElementById("root");
root.innerHTML = `
  <div class="page-shell">
    <header class="site-header">
      <a class="brand" href="./" aria-label="Best Ball home">
        <span class="brand-mark" aria-hidden="true">18</span>
        <span class="brand-copy"><strong>Best Ball</strong><small>Pairing scorecards</small></span>
      </a>
      <button type="button" class="install-button" id="install-button" hidden>Install app</button>
    </header>

    <main class="main-content">
      <div id="builder-view">
        <section class="hero-grid" aria-labelledby="hero-heading">
          <div class="hero-copy">
            <p class="eyebrow eyebrow--light">Best-ball pairing calculator</p>
            <h1 id="hero-heading">One scorecard.<br>Every player pairing.</h1>
            <p class="hero-description">Upload an 18-hole CSV, choose a player, and share only their pairings.</p>
            <ul class="trust-list" aria-label="App benefits">
              <li><span aria-hidden="true">&#10003;</span> Scores stay on your device</li>
              <li><span aria-hidden="true">&#10003;</span> No account needed</li>
            </ul>
          </div>

          <section class="upload-panel" aria-labelledby="upload-heading">
            <div class="upload-icon" aria-hidden="true"><span></span></div>
            <p class="panel-kicker">Get started</p>
            <h2 id="upload-heading">Choose your scorecard</h2>
            <p>We automatically find the player name and Hole 1 through Hole 18 columns.</p>
            <label class="file-button" for="scorecard-file">
              <span class="button-plus" aria-hidden="true">+</span>
              <span id="file-button-text">Choose CSV file</span>
            </label>
            <input id="scorecard-file" class="visually-hidden" type="file" accept=".csv,text/csv">
            <p class="status" id="status" role="status" aria-live="polite" hidden></p>
            <details class="format-help">
              <summary>What should my CSV look like?</summary>
              <p>The header needs a player name column plus all 18 holes. Complete player rows are included automatically.</p>
              <a href="sample.csv" download>Download a sample CSV</a>
            </details>
          </section>
        </section>

        <section class="results-panel" id="results" aria-labelledby="results-heading" hidden>
          <div class="results-header">
            <div>
              <p class="eyebrow">Pairings ready</p>
              <h2 id="results-heading">Choose a player</h2>
              <p id="results-summary"></p>
            </div>
            <div class="results-header-actions">
              <button type="button" class="soft-button" id="pdf-button">Save all PDF</button>
              <button type="button" class="text-button" id="reset-button">Start over</button>
            </div>
          </div>

          <label class="search-field">
            <span class="search-icon" aria-hidden="true"></span>
            <span class="visually-hidden">Search players</span>
            <input id="search-input" type="search" placeholder="Search players">
            <button type="button" id="clear-search" aria-label="Clear search" hidden>&times;</button>
          </label>
          <div class="player-list" id="player-list"></div>
        </section>
      </div>

      <div class="shared-view" id="shared-view" hidden>
        <section class="shared-hero" aria-labelledby="shared-heading">
          <div class="shared-label"><span aria-hidden="true"></span> Shared scorecard</div>
          <h1 id="shared-heading"></h1>
          <p>Every pairing for this player, ranked by best-ball score. Open any pairing to check all 18 holes.</p>
          <div class="shared-hero-actions">
            <button type="button" class="share-page-button" id="share-page-button">Share this scorecard</button>
            <a class="new-scorecard-link" href="./">Make a new scorecard</a>
          </div>
        </section>
        <section class="shared-results" aria-labelledby="shared-results-heading">
          <div class="shared-results-title">
            <div><p class="eyebrow">Best-ball scores</p><h2 id="shared-results-heading"></h2></div>
            <span id="shared-count"></span>
          </div>
          <div class="shared-pair-list" id="shared-pair-list"></div>
          <p class="shared-note"><strong>How it works:</strong> The lower score between the two players counts on each hole.</p>
        </section>
      </div>
    </main>

    <footer class="site-footer" id="site-footer">
      <strong>Private by design.</strong> Your CSV is processed in this browser and is never uploaded.
    </footer>
    <p class="toast" id="toast" role="status" aria-live="polite" hidden></p>
  </div>
`;

const elements = {
  builderView: document.getElementById("builder-view"),
  clearSearch: document.getElementById("clear-search"),
  fileButtonText: document.getElementById("file-button-text"),
  fileInput: document.getElementById("scorecard-file"),
  footer: document.getElementById("site-footer"),
  installButton: document.getElementById("install-button"),
  pdfButton: document.getElementById("pdf-button"),
  playerList: document.getElementById("player-list"),
  resetButton: document.getElementById("reset-button"),
  results: document.getElementById("results"),
  resultsSummary: document.getElementById("results-summary"),
  searchInput: document.getElementById("search-input"),
  sharePageButton: document.getElementById("share-page-button"),
  sharedCount: document.getElementById("shared-count"),
  sharedHeading: document.getElementById("shared-heading"),
  sharedPairList: document.getElementById("shared-pair-list"),
  sharedResultsHeading: document.getElementById("shared-results-heading"),
  sharedView: document.getElementById("shared-view"),
  status: document.getElementById("status"),
  toast: document.getElementById("toast")
};

const initialShared = getSharedResults();
const dedicatedSharePage = /\/share\.html$/i.test(window.location.pathname);
if (dedicatedSharePage && !initialShared.sharedPlayer) window.location.replace("./");
const state = {
  installPrompt: null,
  openPlayers: new Set(),
  players: initialShared.players,
  search: "",
  sharedPlayer: initialShared.sharedPlayer,
  teams: [],
  teamsByPlayer: []
};

let toastTimer;
const makeElement = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const playerId = (name) => `player-${encodeURIComponent(name).replace(/%/g, "-")}`;
const possessive = (name) => `${name}${name.toLowerCase().endsWith("s") ? "'" : "'s"}`;

function setStatus(text, tone = "neutral") {
  elements.status.textContent = text;
  elements.status.className = `status status--${tone}`;
  elements.status.hidden = !text;
}

function showToast(text, tone = "success") {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = text;
  elements.toast.className = `toast toast--${tone}`;
  elements.toast.hidden = false;
  toastTimer = window.setTimeout(() => { elements.toast.hidden = true; }, 3200);
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function renderBuilderPlayers() {
  const query = state.search.trim().toLowerCase();
  const filtered = !query
    ? state.teamsByPlayer
    : state.teamsByPlayer.filter(([player, pairs]) =>
      player.toLowerCase().includes(query) || pairs.some((team) => team.partner.toLowerCase().includes(query))
    );

  elements.playerList.replaceChildren();
  if (!filtered.length) {
    elements.playerList.append(makeElement("p", "empty-search", "No matching players."));
    return;
  }

  filtered.forEach(([player, pairs]) => {
    const sectionId = playerId(player);
    const isOpen = state.openPlayers.has(player);
    const article = makeElement("article", "player-card");
    const heading = makeElement("div", "player-card-heading");
    const avatar = makeElement("span", "player-avatar", initials(player));
    avatar.setAttribute("aria-hidden", "true");
    const copy = makeElement("div", "player-card-copy");
    copy.append(makeElement("h3", "", player), makeElement("p", "", `${pairs.length} possible partner${pairs.length === 1 ? "" : "s"}`));
    heading.append(avatar, copy);

    const actions = makeElement("div", "player-card-actions");
    const share = makeElement("button", "share-player-button", "Share player");
    share.type = "button";
    share.dataset.sharePlayer = player;
    const toggle = makeElement("button", "toggle-pairs-button", isOpen ? "Hide pairings" : "View pairings");
    toggle.type = "button";
    toggle.dataset.togglePlayer = player;
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-controls", sectionId);
    actions.append(share, toggle);

    const list = makeElement("div", "pair-list");
    list.id = sectionId;
    list.hidden = !isOpen;
    pairs.forEach((team, index) => {
      const row = makeElement("div", "pair-row");
      const partner = makeElement("div", "pair-partner");
      partner.append(makeElement("span", "pair-rank", String(index + 1).padStart(2, "0")), makeElement("span", "", team.partner));
      const score = makeElement("div", "pair-score");
      score.append(makeElement("small", "", "Best ball"), makeElement("strong", "", String(team.total)));
      row.append(partner, score);
      list.append(row);
    });

    article.append(heading, actions, list);
    elements.playerList.append(article);
  });
}

function makeNineTable(team, startHole) {
  const endHole = startHole + 9;
  const tableWrap = makeElement("div", "score-table-wrap");
  const table = makeElement("table", "score-table");
  const caption = makeElement("caption", "visually-hidden", `Holes ${startHole + 1} through ${endHole} for ${team.name}`);
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const playerHeading = makeElement("th", "player-column", "Player");
  playerHeading.scope = "col";
  headRow.append(playerHeading);
  for (let index = startHole; index < endHole; index += 1) {
    const cell = makeElement("th", "", String(index + 1));
    cell.scope = "col";
    headRow.append(cell);
  }
  const subtotalHeading = makeElement("th", "subtotal-column", startHole === 0 ? "Out" : "In");
  subtotalHeading.scope = "col";
  headRow.append(subtotalHeading);
  head.append(headRow);

  const body = document.createElement("tbody");
  const rows = [
    ...team.playerScores.map((player) => ({ name: player.name, scores: player.strokes, best: false })),
    { name: "Best", scores: team.holeScores, best: true }
  ];
  rows.forEach((entry) => {
    const tr = document.createElement("tr");
    if (entry.best) tr.className = "best-score-row";
    const name = makeElement("th", "player-column", entry.name);
    name.scope = "row";
    tr.append(name);
    let subtotal = 0;
    for (let index = startHole; index < endHole; index += 1) {
      const score = entry.scores[index];
      subtotal += score;
      tr.append(makeElement("td", "", String(score)));
    }
    tr.append(makeElement("td", "subtotal-column", String(subtotal)));
    body.append(tr);
  });
  table.append(caption, head, body);
  tableWrap.append(table);
  return tableWrap;
}

function renderSharedView() {
  const group = state.teamsByPlayer.find(([player]) => player === state.sharedPlayer);
  if (!group) return;
  const [player, pairs] = group;
  document.querySelector(".page-shell").classList.add("is-shared");
  elements.builderView.hidden = true;
  elements.sharedView.hidden = false;
  elements.sharedHeading.textContent = `${possessive(player)} pairings`;
  elements.sharedResultsHeading.textContent = player;
  elements.sharedCount.textContent = `${pairs.length} pairing${pairs.length === 1 ? "" : "s"}`;
  elements.footer.innerHTML = "<strong>Shared with care.</strong> This link contains only the scores needed for this player’s pairings.";
  elements.sharedPairList.replaceChildren();

  pairs.forEach((team, index) => {
    const article = makeElement("article", "shared-pair-card");
    const summary = makeElement("div", "shared-pair-summary");
    const rank = makeElement("span", "shared-rank", String(index + 1));
    const partner = makeElement("div", "shared-partner");
    partner.append(makeElement("small", "", "With"), makeElement("h3", "", team.partner));
    const score = makeElement("div", "shared-score");
    score.append(makeElement("small", "", "Best ball"), makeElement("strong", "", String(team.total)));
    summary.append(rank, partner, score);

    const details = makeElement("details", "hole-details");
    const detailsSummary = document.createElement("summary");
    detailsSummary.append(makeElement("span", "details-label", "Check hole-by-hole"), makeElement("span", "details-hint", "18 holes"));
    const tables = makeElement("div", "score-tables");
    tables.append(makeNineTable(team, 0), makeNineTable(team, 9));
    details.append(detailsSummary, tables);
    article.append(summary, details);
    elements.sharedPairList.append(article);
  });
}

function render() {
  state.teams = buildTeams(state.players);
  state.teamsByPlayer = groupTeamsByPlayer(state.teams);
  if (state.sharedPlayer) {
    renderSharedView();
    return;
  }

  document.querySelector(".page-shell").classList.remove("is-shared");
  elements.builderView.hidden = false;
  elements.sharedView.hidden = true;
  elements.footer.innerHTML = "<strong>Private by design.</strong> Your CSV is processed in this browser and is never uploaded.";
  elements.results.hidden = state.players.length < 2;
  elements.fileButtonText.textContent = state.players.length ? "Choose another CSV" : "Choose CSV file";
  if (state.players.length < 2) return;

  elements.resultsSummary.textContent = `${state.players.length} players · ${state.teams.length} pairings. Share one player at a time.`;
  renderBuilderPlayers();
}

async function loadFile(file) {
  setStatus("Reading your scorecard…");
  try {
    state.players = parsePlayers(await file.text());
    state.sharedPlayer = null;
    state.search = "";
    state.openPlayers.clear();
    elements.searchInput.value = "";
    elements.clearSearch.hidden = true;
    if (window.location.hash.startsWith("#results=")) history.replaceState(null, "", window.location.pathname + window.location.search);
    render();
    if (!state.players.length) {
      setStatus("No complete players found. Check for a name and scores for holes 1 through 18.", "error");
    } else if (state.players.length === 1) {
      setStatus("One player loaded. Add at least two complete players to create pairings.", "warning");
    } else {
      setStatus(`${state.players.length} players loaded. Choose someone below to view or share their pairings.`, "success");
      elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch {
    state.players = [];
    render();
    setStatus("That file could not be read. Export the scorecard as CSV and try again.", "error");
  }
}

function playerShareUrl(player) {
  const url = new URL("./share.html", window.location.href);
  url.hash = `results=${encodeIndividualResults(state.players, player)}`;
  return url.href;
}

async function sharePlayer(player) {
  const url = playerShareUrl(player);
  const shareData = {
    title: `${possessive(player)} Best-Ball Pairings`,
    text: `View ${possessive(player)} best-ball pairings and verify every hole.`,
    url
  };
  try {
    if (navigator.share && navigator.canShare?.(shareData) !== false) {
      await navigator.share(shareData);
      showToast("Scorecard shared.");
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url);
      showToast(`${possessive(player)} link copied.`);
    } else {
      window.prompt("Copy this share link:", url);
    }
  } catch (error) {
    if (error?.name !== "AbortError") window.prompt("Copy this share link:", url);
  }
}

function downloadPDF() {
  if (!state.teams.length) {
    showToast("Upload a CSV with at least two players first.", "warning");
    return;
  }
  if (!window.jspdf?.jsPDF) {
    showToast("The PDF tool did not load. Refresh and try again.", "warning");
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
    doc.setTextColor(8, 74, 52);
    doc.text(continued ? "Best Ball Pairings — Continued" : "Best Ball Pairings", left, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 94, 89);
    doc.text(`${state.players.length} players · ${state.teams.length} pairings · ${new Date().toLocaleString()}`, left, y);
    y += 12;
    doc.setDrawColor(15, 115, 79);
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
    doc.setTextColor(8, 74, 52);
    doc.text(player, left, y);
    y += 16;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(30, 35, 33);
    pairs.forEach((team) => {
      newPageIfNeeded(16);
      doc.text(`with ${team.partner}`, left + 10, y);
      doc.setFont("helvetica", "bold");
      doc.text(String(team.total), right, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 13;
    });
    y += 8;
  });
  doc.save("best-ball-pairings.pdf");
  showToast("PDF saved to your device.");
}

function reset() {
  state.players = [];
  state.sharedPlayer = null;
  state.search = "";
  state.openPlayers.clear();
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  history.replaceState(null, "", window.location.pathname + window.location.search);
  render();
  setStatus("Ready for a new scorecard.");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

elements.fileInput.addEventListener("click", () => { elements.fileInput.value = ""; });
elements.fileInput.addEventListener("change", () => {
  const file = elements.fileInput.files?.[0];
  if (file) loadFile(file);
});
elements.pdfButton.addEventListener("click", downloadPDF);
elements.resetButton.addEventListener("click", reset);
elements.searchInput.addEventListener("input", () => {
  state.search = elements.searchInput.value;
  elements.clearSearch.hidden = !state.search;
  renderBuilderPlayers();
});
elements.clearSearch.addEventListener("click", () => {
  state.search = "";
  elements.searchInput.value = "";
  elements.clearSearch.hidden = true;
  renderBuilderPlayers();
  elements.searchInput.focus();
});
elements.playerList.addEventListener("click", (event) => {
  const share = event.target.closest("[data-share-player]");
  if (share) {
    sharePlayer(share.dataset.sharePlayer);
    return;
  }
  const toggle = event.target.closest("[data-toggle-player]");
  if (!toggle) return;
  const player = toggle.dataset.togglePlayer;
  if (state.openPlayers.has(player)) state.openPlayers.delete(player);
  else state.openPlayers.add(player);
  renderBuilderPlayers();
});
elements.sharePageButton.addEventListener("click", () => sharePlayer(state.sharedPlayer));
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
  const shared = getSharedResults();
  if (!shared.players.length) return;
  state.players = shared.players;
  state.sharedPlayer = shared.sharedPlayer;
  state.search = "";
  state.openPlayers.clear();
  render();
  showToast(shared.sharedPlayer ? `${possessive(shared.sharedPlayer)} scorecard loaded.` : "Shared results loaded.");
});

const isLocalPreview = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
if ("serviceWorker" in navigator && window.location.protocol === "https:" && !isLocalPreview) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}
render();
