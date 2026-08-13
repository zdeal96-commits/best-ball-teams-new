const SKIP_NAMES = new Set([
  "par", "yardage", "yards", "handicap", "hcp", "out", "in", "total", "totals", "course"
]);

export function parseCSVRows(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
      continue;
    }
    field += char;
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const normalizeHeader = (value) => String(value ?? "")
  .replace(/^\uFEFF/, "")
  .trim()
  .toLowerCase()
  .replace(/[_-]+/g, " ")
  .replace(/\s+/g, " ");

export function buildHoleIndex(row) {
  const indexByHole = {};
  row.forEach((cell, columnIndex) => {
    const normalized = normalizeHeader(cell);
    const match = normalized.match(/^(?:hole\s*)?(1[0-8]|[1-9])$/);
    if (match) indexByHole[Number(match[1])] = columnIndex;
  });
  return indexByHole;
}

const smartName = (value) => {
  const clean = String(value ?? "").replace(/^\uFEFF/, "").trim().replace(/\s+/g, " ");
  const letters = clean.replace(/[^A-Za-z]/g, "");
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return clean;
  return clean.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_, boundary, letter) => boundary + letter.toUpperCase());
};

const toScore = (value) => {
  const match = String(value ?? "").trim().match(/^(\d{1,2})(?:\s*[*\u2020\u2021])?$/);
  if (!match) return null;
  const score = Number(match[1]);
  return score >= 1 && score <= 25 ? score : null;
};

export function parsePlayers(text) {
  const rows = parseCSVRows(String(text ?? ""));
  const headerRowIndex = rows.findIndex((row) => Object.keys(buildHoleIndex(row)).length === 18);
  if (headerRowIndex < 0) return [];

  const header = rows[headerRowIndex];
  const holes = buildHoleIndex(header);
  const normalizedHeader = header.map(normalizeHeader);
  const nameColumn = normalizedHeader.findIndex((cell) => ["player", "player name", "golfer", "name"].includes(cell));
  const resolvedNameColumn = nameColumn >= 0 ? nameColumn : 0;
  const players = new Map();

  for (const row of rows.slice(headerRowIndex + 1)) {
    const name = smartName(row[resolvedNameColumn] ?? "");
    if (!name || SKIP_NAMES.has(name.toLowerCase())) continue;
    const strokes = [];
    for (let hole = 1; hole <= 18; hole += 1) {
      const score = toScore(row[holes[hole]]);
      if (score === null) {
        strokes.length = 0;
        break;
      }
      strokes.push(score);
    }
    if (strokes.length === 18) players.set(name.toLowerCase(), { name, strokes });
  }

  return [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const bestBall = (first, second) => first.reduce(
  (total, score, index) => total + Math.min(score, second[index]),
  0
);

export function buildTeams(players) {
  const teams = [];
  for (let first = 0; first < players.length; first += 1) {
    for (let second = first + 1; second < players.length; second += 1) {
      const pair = [players[first], players[second]].sort((a, b) => a.name.localeCompare(b.name));
      const holeScores = pair[0].strokes.map((score, index) => Math.min(score, pair[1].strokes[index]));
      teams.push({
        name: `${pair[0].name} & ${pair[1].name}`,
        total: holeScores.reduce((total, score) => total + score, 0),
        players: pair.map((player) => player.name),
        playerScores: pair.map((player) => ({ name: player.name, strokes: [...player.strokes] })),
        holeScores
      });
    }
  }
  return teams.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
}

export function groupTeamsByPlayer(teams) {
  const grouped = new Map();
  for (const team of teams) {
    for (const player of team.players) {
      if (!grouped.has(player)) grouped.set(player, []);
      const partner = team.players.find((candidate) => candidate !== player) ?? player;
      grouped.get(player).push({ ...team, partner, displayName: `${player} & ${partner}` });
    }
  }
  return [...grouped.entries()]
    .map(([player, pairs]) => [player, pairs.sort((a, b) => a.total - b.total || a.displayName.localeCompare(b.displayName))])
    .sort(([first], [second]) => first.localeCompare(second));
}

const toBase64Url = (value) => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) base64 += "=";
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const isValidPlayer = (player) => player
  && typeof player.name === "string"
  && player.name.trim().length > 0
  && player.name.length <= 120
  && Array.isArray(player.strokes)
  && player.strokes.length === 18
  && player.strokes.every((score) => Number.isInteger(Number(score)) && Number(score) >= 1 && Number(score) <= 25);

export function encodeResults(players) {
  return toBase64Url(JSON.stringify({ v: 2, p: players.map((player) => [player.name, ...player.strokes]) }));
}

export function encodeIndividualResults(players, playerName) {
  const owner = players.find((player) => player.name === playerName);
  if (!owner || !isValidPlayer(owner)) return "";
  const partners = players
    .filter((player) => player.name !== owner.name && isValidPlayer(player))
    .map((player) => [player.name, ...player.strokes]);
  return toBase64Url(JSON.stringify({ v: 3, n: owner.name, s: owner.strokes, p: partners }));
}

export function decodeSharedResults(encoded) {
  try {
    const data = JSON.parse(fromBase64Url(encoded));
    let candidates = [];
    let sharedPlayer = null;
    if (data?.v === 3 && typeof data.n === "string" && Array.isArray(data.s) && Array.isArray(data.p)) {
      sharedPlayer = data.n.trim();
      candidates = [
        { name: data.n, strokes: data.s },
        ...data.p.map((entry) => ({ name: entry?.[0], strokes: entry?.slice(1) }))
      ];
    } else if (data?.v === 2 && Array.isArray(data.p)) {
      candidates = data.p.map((entry) => ({ name: entry?.[0], strokes: entry?.slice(1) }));
    } else if (data?.v === 1 && Array.isArray(data.players)) {
      candidates = data.players;
    }

    const players = candidates
      .filter(isValidPlayer)
      .map((player) => ({ name: player.name.trim(), strokes: player.strokes.map(Number) }));
    const names = new Set(players.map((player) => player.name));
    return { players, sharedPlayer: sharedPlayer && names.has(sharedPlayer) ? sharedPlayer : null };
  } catch {
    return { players: [], sharedPlayer: null };
  }
}

export function decodeResults(encoded) {
  return decodeSharedResults(encoded).players;
}

export function getSharedResults(hash = window.location.hash) {
  const match = String(hash).match(/^#results=([A-Za-z0-9_-]+)$/);
  return match ? decodeSharedResults(match[1]) : { players: [], sharedPlayer: null };
}

export function getSharedPlayers(hash = window.location.hash) {
  return getSharedResults(hash).players;
}
