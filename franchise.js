// Franchise page: a team's whole history in one place -- the squad-value-
// over-time chart (same as the dashboard's, ported from app.js) and every
// season as a table (season-table.js, filtered to this club). The old
// "all-time players" table was replaced by the All-Star squad page
// (allstar.html), linked from the header; the per-player value data it read
// (teams/{id}.json's alltime_players) still feeds that page.

let squadBySeasonAll = [];
let clubsById = {};
let competitionsById = {};
let currentPayload = null; // teams/{club_id}.json
let franchiseSeasonRows = [];
let chart = null;

const seasonSortState = { key: "season", dir: "desc" };

async function init() {
  await Money.init();
  const [squadBySeason, competitions] = await Promise.all([
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/competitions.json"),
  ]);
  squadBySeasonAll = squadBySeason;
  competitionsById = Object.fromEntries(competitions.map((c) => [c.competition_id, c]));

  const params = new URLSearchParams(location.search);
  const { clubsById: pickerClubsById } = await TeamPicker.init({
    onTeamPicked,
    initialClubId: params.get("club"),
  });
  clubsById = pickerClubsById;

  window.addEventListener("moneysettingschange", () => {
    if (currentPayload) renderDynamic();
  });
}

function onTeamPicked(clubId) {
  if (!clubId) {
    currentPayload = null;
    document.getElementById("franchiseDetail").innerHTML = "";
    return;
  }
  loadFranchiseDetail(clubId);
}

async function loadFranchiseDetail(clubId) {
  const el = document.getElementById("franchiseDetail");
  el.innerHTML = `<section class="panel"><p class="muted">Loading…</p></section>`;
  try {
    const res = await fetch(`data/teams/${clubId}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentPayload = await res.json();
  } catch (err) {
    console.error(err);
    currentPayload = null;
    el.innerHTML = `<section class="panel"><p class="error-text">No historical data available for this club yet. ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>? (${err.message})</p></section>`;
    return;
  }

  franchiseSeasonRows = squadBySeasonAll
    .filter((r) => String(r.club_id) === String(clubId))
    .map((r) => buildSeasonRow(r, clubsById, competitionsById));

  buildStructure();
  const hideSparseToggle = document.getElementById("franchiseHideSparseToggle");
  hideSparseToggle.checked = SeasonTable.getHideSparse();
  hideSparseToggle.addEventListener("change", (e) => {
    SeasonTable.setHideSparse(e.target.checked);
    renderDynamic();
  });
  SeasonTable.wireSortableHeaders({
    tableId: "franchiseSeasonTable", sortState: seasonSortState,
    onSort: () => { SeasonTable.sortRows(franchiseSeasonRows, seasonSortState); renderSeasonTable(); },
  });
  SeasonTable.sortRows(franchiseSeasonRows, seasonSortState);
  renderDynamic();
}

// The panel skeleton -- built once per team pick; only the innards (chart,
// table bodies) are re-rendered on a currency/value-basis settings change.
function buildStructure() {
  const p = currentPayload;
  document.getElementById("franchiseDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${logoImgHTML(p.crest_url, `${p.name} crest`, { size: "lg" })}
      <div>
        <h2 class="team-header-name">${p.name}</h2>
        <div class="muted">${p.competition_name ? logoImgHTML(competitionLogoUrl(p.competition_id), prettifyLeagueName(p.competition_name), { size: "xs" }) + prettifyLeagueName(p.competition_name) : ""} ${p.country_name ? "· " + p.country_name : ""}</div>
        <div class="allstar-links">
          <a class="allstar-link" href="allstar.html?club=${p.club_id}"><span class="st">★</span> <span>All-Star squad<br><span class="d">${p.name}'s best 26 by value, all-time</span></span></a>
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Squad value over time</h2>
      <canvas id="franchiseChart" height="110"></canvas>
      <div id="franchiseChartNote" class="muted chart-note"></div>
    </section>

    <section class="panel">
      <h2>Every season</h2>
      <label class="toggle-label" for="franchiseHideSparseToggle" title="Hides/excludes seasons with fewer than ${SeasonTable.SPARSE_SQUAD_THRESHOLD} players carrying a recorded value -- the source dataset's coverage is sparse for many clubs/seasons, and a thin roster understates that season's true squad value. Applies to the chart above too. On by default; the setting is shared across the whole site.">
        <input type="checkbox" id="franchiseHideSparseToggle"> Hide incomplete squads (&lt;${SeasonTable.SPARSE_SQUAD_THRESHOLD} players)
      </label>
      <div id="franchiseSparseNote" class="muted" style="font-size:0.8rem;margin:6px 0;"></div>
      <div class="table-scroll bref-table-wrap">
        <table class="bref-table" id="franchiseSeasonTable">
          <thead>${SeasonTable.headRowHTML()}</thead>
          <tbody id="franchiseSeasonTbody"></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>All-Star squad</h2>
      <p class="muted" style="font-size:0.85rem;">
        This club's best 26 (or a Starting XI) by transfer value across its whole history, split by
        position — with the year and age of each player's peak.
      </p>
      <div class="allstar-links">
        <a class="allstar-link" href="allstar.html?club=${p.club_id}"><span class="st">★</span> <span>Open the All-Star squad<br><span class="d">26-man &amp; Starting XI, sortable by value</span></span></a>
      </div>
    </section>
  `;
}

// Seasons the "Hide incomplete squads" toggle would exclude from both the
// chart and the table -- kept in one place so the two stay consistent and
// the note below can report how many were dropped.
function visibleSeasonRows() {
  const hide = document.getElementById("franchiseHideSparseToggle").checked;
  const rows = hide ? franchiseSeasonRows.filter((r) => !r.sparse) : franchiseSeasonRows;
  const hiddenCount = franchiseSeasonRows.length - rows.length;
  document.getElementById("franchiseSparseNote").textContent = hiddenCount
    ? `${hiddenCount} season${hiddenCount === 1 ? "" : "s"} hidden -- fewer than ${SeasonTable.SPARSE_SQUAD_THRESHOLD} players had a recorded value.`
    : "";
  return rows;
}

function renderDynamic() {
  renderChart();
  renderSeasonTable();
}

function renderChart() {
  const rows = visibleSeasonRows().slice().sort((a, b) => a.season - b.season);
  const labels = rows.map((r) => seasonLabel(r.season));
  const actual = rows.map((r) => Money.convertEur(r.actual_value, { year: r.season }));
  const potential = rows.map((r) => Money.convertEur(
    Money.pickPeak(r, "potential_value", "potential_value_alltime"), { year: r.season }
  ));

  const seasonsInfo = rows.map((r) => {
    const sd = currentPayload.seasons[String(r.season)];
    const lg = sd && sd.league;
    return { season: r.season, status: lg ? lg.status : "unknown", tier: lg ? lg.tier : null, label: lg ? (lg.status === "top_flight" ? lg.competition_id : lg.name) : null };
  });
  const markers = leagueTransitionMarkers(seasonsInfo, "#38bdf8");
  document.getElementById("franchiseChartNote").innerHTML = transitionNoteHTML(markers.transitions);

  if (chart) chart.destroy();
  chart = new Chart(document.getElementById("franchiseChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Actual value",
          data: rows.map((r, i) => ({ x: labels[i], y: actual[i], season: r.season })),
          parsing: { yAxisKey: "y" },
          borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.15)",
          tension: 0.25, fill: true,
          pointStyle: markers.pointStyle, pointRadius: markers.pointRadius,
          pointRotation: markers.pointRotation, pointBackgroundColor: markers.pointBackgroundColor,
        },
        {
          label: `Potential value (${Money.peakLabel()})`,
          data: rows.map((r, i) => ({ x: labels[i], y: potential[i], season: r.season })),
          parsing: { yAxisKey: "y" },
          borderColor: "#22c55e", backgroundColor: "rgba(34,197,94,0.10)",
          tension: 0.25, fill: true,
        },
      ],
    },
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
            label: (ctx) => `${ctx.dataset.label}: ${Money.fmtConverted(ctx.parsed.y)}`,
            afterLabel: (ctx) => (ctx.datasetIndex === 0 ? markers.transitions[ctx.dataIndex] || "" : ""),
          },
        },
      },
    },
  });
}

function renderSeasonTable() {
  SeasonTable.renderRows({ rows: visibleSeasonRows(), tbodyId: "franchiseSeasonTbody" });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("franchiseDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load Franchise page data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p></section>`;
  });
});
