import test from "node:test";
import assert from "node:assert/strict";
import {
  bestBall,
  buildTeams,
  decodeResults,
  encodeResults,
  parseCSVRows,
  parsePlayers
} from "../core.js";

const header = ["Player", ...Array.from({ length: 18 }, (_, index) => `Hole ${index + 1}`)].join(",");
const row = (name, score) => [name, ...Array(18).fill(score)].join(",");

test("parses quoted CSV fields and embedded commas", () => {
  const rows = parseCSVRows('Player,Note\n"Morgan, Alex","Uses ""blue"" tees"');
  assert.deepEqual(rows, [["Player", "Note"], ["Morgan, Alex", 'Uses "blue" tees']]);
});

test("detects all 18 holes and ignores summary rows", () => {
  const csv = [
    "Tournament export",
    header,
    row("ALEX MORGAN", 4),
    row("Jordan Lee", 5),
    row("Par", 4)
  ].join("\n");
  const players = parsePlayers(csv);
  assert.equal(players.length, 2);
  assert.equal(players[0].name, "Alex Morgan");
  assert.equal(players[1].strokes.length, 18);
});

test("calculates best ball and sorts teams by score", () => {
  const players = [
    { name: "A", strokes: Array(18).fill(4) },
    { name: "B", strokes: Array(18).fill(5) },
    { name: "C", strokes: Array(18).fill(3) }
  ];
  assert.equal(bestBall(players[0].strokes, players[1].strokes), 72);
  const teams = buildTeams(players);
  assert.equal(teams.length, 3);
  assert.equal(teams[0].total, 54);
});

test("round-trips compact share links and rejects malformed data", () => {
  const players = [{ name: "Zoë Lee", strokes: Array(18).fill(4) }];
  assert.deepEqual(decodeResults(encodeResults(players)), players);
  assert.deepEqual(decodeResults("not-valid"), []);
});
