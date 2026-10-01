// Compare page: add any mix of teams, leagues, and players to one chart.
// Series data needs no new per-entity fetch -- teams and leagues come from
// squad_value_by_season.json (already loaded everywhere else), players from
// the lightweight player_values.json (not the heavier players/{id}.json,
// since only the value curve is needed here, not full career detail).

let squadBySeasonAll = [];
let clubsById = {};
let competitionsById = {};
let competitions = [];
let playerValues = {};
let playersIndex = [];
let compareList = []; // [{ type: "team"|"league"|"player", id, name }]
let compareChart = null;
let normalizeByAge = false;
let excludeIncomplete = false; // drop understated (missing-club) league-seasons from league lines
let incompleteLeagueSeasons = []; // {name, seasons:[...]} collected during the last render, for the note
let playerBirthYear = {}; // player_id (string) -> birth year, lazily fetched on demand

const COLORS = ["#38bdf8", "#22c55e", "#f59e0b", "#f87171", "#a78bfa", "#ec4899", "#14b8a6", "#eab308"];

async function init() {
  await Money.init();
  const [squadBySeason, clubs, comps, pv, pIndex] = await Promise.all([
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/clubs.json"),
    Money.loadJSON("data/competitions.json"),
    Money.loadJSON("data/player_values.json"),
    Money.loadJSON("data/players_index.json"),
  ]);
  squadBySeasonAll = squadBySeason;
  clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));
  competitions = comps.filter((c) => c.type === "domestic_league");
  competitionsById = Object.fromEntries(comps.map((c) => [c.competition_id, c]));
  playerValues = pv;
  playersIndex = pIndex;

  wireSearch();
  document.getElementById("normalizeAgeToggle").addEventListener("change", (e) => {
    normalizeByAge = e.target.checked;
    renderChart();
  });
  document.getElementById("excludeIncompleteToggle").addEventListener("change", (e) => {
    excludeIncomplete = e.target.checked;
    renderChart();
  });
  renderList();
  renderChart();

  window.addEventListener("moneysettingschange", renderChart);
}

// Only fetched for players actually added to the comparison (never all
// 31.5k up front) -- players_index.json/player_values.json are already
// loaded for the search box and the value curve, but neither carries
// date_of_birth, so age-normalizing needs one small extra fetch per player,
// same lazy-fetch pattern as the Teams/Franchise/Player pages already use.
async function ensureBirthYear(playerId) {
  const key = String(playerId);
  if (key in playerBirthYear) return playerBirthYear[key];
  try {
    const p = await Money.loadJSON(`data/players/${playerId}.json`);
    playerBirthYear[key] = p.date_of_birth ? new Date(p.date_of_birth).getUTCFullYear() : null;
  } catch (e) {
    console.error(e);
    playerBirthYear[key] = null;
  }
  return playerBirthYear[key];
}

function wireSearch() {
  const input = document.getElementById("compareSearchInput");
  const results = document.getElementById("compareSearchResults");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }
    const teamMatches = Object.values(clubsById)
      .filter((c) => c.has_team_data && c.name && c.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({ type: "team", id: c.club_id, name: c.name, sub: prettifyLeagueName(c.competition_name) }));
    const leagueMatches = competitions
      .filter((c) => c.name && prettifyLeagueName(c.name).toLowerCase().includes(q))
      .slice(0, 8)
      .map((c) => ({ type: "league", id: c.competition_id, name: prettifyLeagueName(c.name), sub: c.country_name }));
    const playerMatches = playersIndex
      .filter((p) => p.name && p.name.toLowerCase().includes(q))
      .slice(0, 8)
      .map((p) => ({ type: "player", id: p.player_id, name: p.name, sub: p.current_club_name }));
    const matches = [...teamMatches, ...leagueMatches, ...playerMatches];

    results.innerHTML = matches
      .map((m, i) => `<li data-idx="${i}"><span class="muted">[${m.type}]</span> ${m.name}${m.sub ? ` <span class="muted">— ${m.sub}</span>` : ""}</li>`)
      .join("");
    results.dataset.matches = JSON.stringify(matches);
    results.hidden = matches.length === 0;
  });

  results.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-idx]");
    if (!li) return;
    const matches = JSON.parse(results.dataset.matches || "[]");
    const m = matches[Number(li.dataset.idx)];
    if (m) addToCompare(m.type, m.id, m.name);
    input.value = "";
    results.hidden = true;
    results.innerHTML = "";
  });

  document.addEventListener("click", (e) => {
    if (!results.contains(e.target) && e.target !== input) results.hidden = true;
  });
}

function addToCompare(type, id, name) {
  if (compareList.some((e) => e.type === type && String(e.id) === String(id))) return;
  compareList.push({ type, id: String(id), name });
  renderList();
  renderChart(); // fetches the new player's birth year itself if normalizing by age is on
}

function removeFromCompare(type, id) {
  compareList = compareList.filter((e) => !(e.type === type && String(e.id) === String(id)));
  renderList();
  renderChart();
}

function renderList() {
  const el = document.getElementById("compareList");
  if (!compareList.length) {
    el.innerHTML = `<p class="muted">Nothing added yet — search above for a team, league, or player.</p>`;
    return;
  }
  el.innerHTML = compareList
    .map((e, i) => {
      const color = COLORS[i % COLORS.length];
      return `<span class="status-badge" style="background:${color}30;color:${color};margin-right:6px;margin-bottom:6px;display:inline-block;">
        [${e.type}] ${e.name}
        <a href="#" data-remove-type="${e.type}" data-remove-id="${e.id}" style="color:inherit;text-decoration:none;font-weight:700;margin-left:4px;">&times;</a>
      </span>`;
    })
    .join("");
  el.querySelectorAll("[data-remove-type]").forEach((a) => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      removeFromCompare(a.dataset.removeType, a.dataset.removeId);
    });
  });
}

// Same "hide incomplete squads" setting as Seasons/Franchise/Leagues (shared
// via localStorage, default on) -- a club-season with a handful of valued
// players would otherwise show up as a misleading dip in its own line, and
// silently drag down a league's summed total.
function isSparseRow(r) {
  return r.squad_size != null && r.squad_size < SeasonTable.SPARSE_SQUAD_THRESHOLD;
}

function teamSeries(clubId) {
  const hide = SeasonTable.getHideSparse();
  return squadBySeasonAll
    .filter((r) => String(r.club_id) === String(clubId) && !(hide && isSparseRow(r)))
    .sort((a, b) => a.season - b.season)
    .map((r) => ({ season: r.season, value: r.actual_value }));
}

function leagueSeries(competitionId) {
  const hide = SeasonTable.getHideSparse();
  const bySeason = {};
  const incompleteSeasons = new Set();
  squadBySeasonAll.forEach((r) => {
    if (r.league !== competitionId || r.league_status !== "top_flight" || r.actual_value == null) return;
    // A measured top-flight league-season missing one or more of its clubs:
    // its summed total is understated (see Item H / the Data dictionary).
    if (r.teams_expected != null && r.teams_complete === false) incompleteSeasons.add(r.season);
    if (hide && isSparseRow(r)) return;
    bySeason[r.season] = (bySeason[r.season] || 0) + r.actual_value;
  });
  if (incompleteSeasons.size) {
    const name = (competitionsById[competitionId] || {}).name || competitionId;
    incompleteLeagueSeasons.push({ name, seasons: [...incompleteSeasons].sort((a, b) => a - b) });
  }
  return Object.keys(bySeason).map(Number).sort((a, b) => a - b)
    .filter((s) => !(excludeIncomplete && incompleteSeasons.has(s)))
    .map((s) => ({ season: s, value: bySeason[s] }));
}

function playerSeries(playerId) {
  const seasons = playerValues[String(playerId)] || {};
  return Object.keys(seasons).map(Number).sort((a, b) => a - b)
    .map((s) => ({ season: s, value: seasons[String(s)].value_eur }));
}

function seriesFor(entry) {
  if (entry.type === "team") return teamSeries(entry.id);
  if (entry.type === "league") return leagueSeries(entry.id);
  if (entry.type === "player") return playerSeries(entry.id);
  return [];
}

function updateChartNote(hiddenCount) {
  const note = document.getElementById("compareChartNote");
  if (!normalizeByAge) {
    note.textContent = `Each line is that entity's actual/current value (not "potential") -- teams and leagues in ` +
      `squad value, players in market value -- so lines stay comparable across a mixed set. Team/league lines skip ` +
      `seasons with fewer than ${SeasonTable.SPARSE_SQUAD_THRESHOLD} valued players (see "Hide incomplete squads" on ` +
      `the Seasons page).`;
  } else if (hiddenCount) {
    note.textContent = `Showing value by age (players only) -- ${hiddenCount} non-player entr${hiddenCount === 1 ? "y" : "ies"} ` +
      `hidden while this is on. Each player's value is plotted against their own age, not the calendar year.`;
  } else {
    note.textContent = `Showing value by age -- each player's value is plotted against their own age, not the ` +
      `calendar year, so trajectories at the same age line up regardless of when they were actually that age.`;
  }
}

// After league series are built, flag any league-seasons whose total is
// understated because the source is missing clubs -- either noting they were
// dropped (toggle on) or that they're included but understated (toggle off).
function appendIncompleteNote() {
  const note = document.getElementById("compareChartNote");
  if (!incompleteLeagueSeasons.length || normalizeByAge) return;
  const parts = incompleteLeagueSeasons.map(
    (x) => `${prettifyLeagueName(x.name)} (${x.seasons.map((s) => seasonLabel(s)).join(", ")})`
  );
  const lead = excludeIncomplete
    ? "Dropped understated league-seasons (source missing one or more clubs): "
    : "Some league-seasons are understated (source missing one or more clubs) -- turn on “Drop understated league-seasons” to hide them: ";
  note.insertAdjacentHTML(
    "beforeend",
    `<br><span style="color:var(--warn,#f59e0b)">⚠ ${lead}${parts.join("; ")}.</span>`
  );
}

let renderToken = 0;
async function renderChart() {
  // renderChart awaits birth-year fetches, so two quick calls (e.g. adding
  // several entities in a row) can interleave. A token means only the latest
  // call past the await actually draws and touches the shared note/collectors.
  const myToken = ++renderToken;
  const canvas = document.getElementById("compareChart");
  const activeList = normalizeByAge ? compareList.filter((e) => e.type === "player") : compareList;
  updateChartNote(compareList.length - activeList.length);

  if (!activeList.length) {
    if (compareChart) { compareChart.destroy(); compareChart = null; }
    return;
  }

  if (normalizeByAge) {
    await Promise.all(activeList.map((e) => ensureBirthYear(e.id)));
    if (myToken !== renderToken) return;
    const allAges = new Set();
    const seriesByEntry = activeList.map((e) => {
      const birthYear = playerBirthYear[e.id];
      if (birthYear == null) return [];
      const s = seriesFor(e).map((p) => ({ age: p.season - birthYear, season: p.season, value: p.value }));
      s.forEach((p) => allAges.add(p.age));
      return s;
    });
    const ages = [...allAges].sort((a, b) => a - b);
    const labels = ages.map(String);

    const datasets = activeList.map((e, i) => {
      const byAge = Object.fromEntries(seriesByEntry[i].map((p) => [p.age, p]));
      const color = COLORS[i % COLORS.length];
      const birthYear = playerBirthYear[e.id];
      return {
        label: birthYear == null ? `[${e.type}] ${e.name} (no birth date on record)` : `[${e.type}] ${e.name}`,
        data: ages.map((a, idx) => {
          const p = byAge[a];
          return { x: labels[idx], y: p ? Money.convertEur(p.value, { year: p.season }) : null };
        }),
        parsing: { yAxisKey: "y" },
        borderColor: color, backgroundColor: color + "20",
        spanGaps: true, tension: 0.25, fill: false,
      };
    });

    if (compareChart) compareChart.destroy();
    compareChart = new Chart(canvas, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        scales: {
          y: { ticks: { color: "#94a3b8", callback: (v) => Money.fmtConverted(v) }, grid: { color: "#334155" } },
          x: {
            title: { display: true, text: "Age", color: "#94a3b8" },
            ticks: { color: "#94a3b8" }, grid: { color: "#33415530" },
          },
        },
        plugins: {
          legend: { labels: { color: "#e2e8f0" } },
          tooltip: {
            callbacks: {
              title: (items) => `Age ${items[0].label}`,
              label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? Money.fmtConverted(ctx.parsed.y) : "—"}`,
            },
          },
        },
      },
    });
    return;
  }

  // Birth years for any player entries so the tooltip can show age-at-season
  // (age is key context behind a valuation), even when not age-normalizing.
  await Promise.all(activeList.filter((e) => e.type === "player").map((e) => ensureBirthYear(e.id)));
  if (myToken !== renderToken) return;

  incompleteLeagueSeasons = [];
  const allSeasons = new Set();
  const seriesByEntry = activeList.map((e) => {
    const s = seriesFor(e);
    s.forEach((p) => allSeasons.add(p.season));
    return s;
  });
  const seasons = [...allSeasons].sort((a, b) => a - b);
  const labels = seasons.map((s) => seasonLabel(s));

  const datasets = activeList.map((e, i) => {
    const bySeason = Object.fromEntries(seriesByEntry[i].map((p) => [p.season, p.value]));
    const color = COLORS[i % COLORS.length];
    return {
      label: `[${e.type}] ${e.name}`,
      data: seasons.map((s, idx) => {
        const v = bySeason[s];
        return { x: labels[idx], y: v != null ? Money.convertEur(v, { year: s }) : null, season: s };
      }),
      parsing: { yAxisKey: "y" },
      borderColor: color, backgroundColor: color + "20",
      spanGaps: true, tension: 0.25, fill: false,
    };
  });

  appendIncompleteNote();

  if (compareChart) compareChart.destroy();
  compareChart = new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { color: "#94a3b8", callback: (v) => Money.fmtConverted(v) }, grid: { color: "#334155" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#33415530" } },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y != null ? Money.fmtConverted(ctx.parsed.y) : "—"}`,
            afterLabel: (ctx) => {
              const e = activeList[ctx.datasetIndex];
              if (!e || e.type !== "player") return "";
              const birthYear = playerBirthYear[e.id];
              const season = ctx.raw && ctx.raw.season;
              if (birthYear == null || season == null || ctx.parsed.y == null) return "";
              return `Age ${season - birthYear}`;
            },
          },
        },
      },
    },
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("compareList").innerHTML =
      `<p class="error-text">Couldn't load Compare page data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p>`;
  });
});
