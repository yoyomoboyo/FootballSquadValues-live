// Leagues page: pick a country + league, see the league's aggregate squad
// value over time (summed client-side from squad_value_by_season.json --
// no new backend data needed, league is already a stable competition_id on
// every squad-season row) and every club in it across the years (the same
// shared sortable table as Franchise/Seasons, filtered by league instead of
// club).

let squadBySeasonAll = [];
let clubsById = {};
let competitionsById = {};
let competitions = [];
let currentCompetitionId = null;
let leagueChart = null;
let leagueClubRows = [];
let leagueArtifact = null; // data/leagues/{id}.json: alltime players + season transfers
const leagueClubSortState = { key: "actual_value", dir: "desc" };

async function init() {
  await Money.init();
  const [squadBySeason, clubs, comps] = await Promise.all([
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/clubs.json"),
    Money.loadJSON("data/competitions.json"),
  ]);
  squadBySeasonAll = squadBySeason;
  clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));
  // competitions.json now includes real 2nd/3rd-tier divisions (tier >= 2),
  // so the country -> level -> league cascade lists them alongside top flights.
  competitions = comps.filter((c) => c.type === "domestic_league");
  competitionsById = Object.fromEntries(comps.map((c) => [c.competition_id, c]));

  populateCountryOptions();
  populateLevelOptions();
  populateLeagueOptions();
  wireControls();

  const params = new URLSearchParams(location.search);
  const initialLeague = params.get("league");
  if (initialLeague && competitionsById[initialLeague]) pickLeague(initialLeague);

  window.addEventListener("moneysettingschange", () => {
    if (currentCompetitionId) renderDynamic();
  });
}

function populateCountryOptions() {
  const seen = new Map();
  competitions.forEach((c) => {
    if (c.country_id != null && c.country_name) seen.set(String(c.country_id), c.country_name);
  });
  const sorted = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  document.getElementById("leagueCountrySelect").innerHTML =
    `<option value="">Any country</option>` +
    sorted.map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
}

function tierLabel(t) {
  return { 1: "First tier", 2: "Second tier", 3: "Third tier", 4: "Fourth tier", 5: "Fifth tier" }[t]
    || (t != null ? `Tier ${t}` : "Unknown level");
}

// Distinct league levels present for the chosen country (First tier, plus the
// real Second/Third tiers now that team_competitions_seasons supplies them).
function populateLevelOptions(countryId) {
  let filtered = competitions;
  if (countryId) filtered = filtered.filter((c) => String(c.country_id) === String(countryId));
  const tiers = [...new Set(filtered.map((c) => c.tier).filter((t) => t != null))].sort((a, b) => a - b);
  const sel = document.getElementById("leagueLevelSelect");
  if (!sel) return;
  sel.innerHTML = `<option value="">Any level</option>` +
    tiers.map((t) => `<option value="${t}">${tierLabel(t)}</option>`).join("");
}

function populateLeagueOptions(countryId, tier) {
  let filtered = competitions;
  if (countryId) filtered = filtered.filter((c) => String(c.country_id) === String(countryId));
  if (tier) filtered = filtered.filter((c) => String(c.tier) === String(tier));
  const sorted = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  const sel = document.getElementById("leaguePickSelect");
  sel.innerHTML =
    `<option value="">Choose a league…</option>` +
    sorted.map((c) => `<option value="${c.competition_id}">${prettifyLeagueName(c.name)}${c.country_name ? " (" + c.country_name + ")" : ""}</option>`).join("");
  sel.value = currentCompetitionId || "";
}

function wireControls() {
  document.getElementById("leagueCountrySelect").addEventListener("change", (e) => {
    const cid = e.target.value || null;
    populateLevelOptions(cid);
    document.getElementById("leagueLevelSelect").value = "";
    populateLeagueOptions(cid, null);
  });
  document.getElementById("leagueLevelSelect").addEventListener("change", (e) => {
    const cid = document.getElementById("leagueCountrySelect").value || null;
    populateLeagueOptions(cid, e.target.value || null);
  });
  document.getElementById("leaguePickSelect").addEventListener("change", (e) => {
    if (e.target.value) pickLeague(e.target.value);
  });
}

async function pickLeague(competitionId) {
  const comp = competitionsById[competitionId];
  if (!comp) return;
  currentCompetitionId = competitionId;

  if (comp.country_id != null) document.getElementById("leagueCountrySelect").value = String(comp.country_id);
  populateLevelOptions(comp.country_id);
  const levelSel = document.getElementById("leagueLevelSelect");
  if (levelSel && comp.tier != null) levelSel.value = String(comp.tier);
  populateLeagueOptions(comp.country_id, comp.tier);

  const params = new URLSearchParams(location.search);
  params.set("league", competitionId);
  history.replaceState(null, "", `${location.pathname}?${params}`);

  // Any club-season tagged with this competition id -- top flights and the
  // real 2nd/3rd-tier divisions alike (both now carry a competition id).
  leagueClubRows = squadBySeasonAll
    .filter((r) => r.league === competitionId)
    .map((r) => buildSeasonRow(r, clubsById, competitionsById));

  // Per-league artifact (all-time top players + per-season top transfers).
  leagueArtifact = null;
  try {
    leagueArtifact = await Money.loadJSON(`data/leagues/${competitionId}.json`);
  } catch (e) {
    console.warn(`no league artifact for ${competitionId}`, e);
  }

  buildStructure();
  SeasonTable.wireSortableHeaders({
    tableId: "leagueClubsTable", sortState: leagueClubSortState,
    onSort: () => { SeasonTable.sortRows(leagueClubRows, leagueClubSortState); renderClubsTable(); },
  });
  SeasonTable.sortRows(leagueClubRows, leagueClubSortState);
  renderDynamic();
}

function buildStructure() {
  const comp = competitionsById[currentCompetitionId];
  const isLower = comp.tier >= 2;
  const compName = prettifyLeagueName(comp.name);
  document.getElementById("leagueDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${logoImgHTML(competitionLogoUrl(currentCompetitionId), compName, { size: "lg" })}
      <div>
        <h2 class="team-header-name">${compName}</h2>
        <div class="muted">${comp.country_name || ""}${comp.tier != null ? ` · ${tierLabel(comp.tier)}` : ""}</div>
      </div>
    </section>

    ${isLower ? `
    <section class="panel">
      <p class="muted sparse-banner" style="margin:0;">⚠ Partial coverage — full standings are real (rank, W-D-L), but market-value
      data below the top flights is thinner, so some clubs' squad values are incomplete or missing, and the datalake's freeze
      means the current season is still filling in. Incomplete squads are ⚠-flagged and hidden by default.</p>
    </section>` : ""}

    <section class="panel">
      <h2>Aggregate squad value over time</h2>
      <canvas id="leagueChart" height="110"></canvas>
      <p class="muted" style="font-size:0.8rem;margin-top:6px;">
        Sum of actual squad value across every club recorded in ${isLower ? "this division" : "the top flight"} that season --
        seasons where the source data only covers a handful of clubs will understate the true total.
      </p>
    </section>

    <section class="panel">
      <h2>Season breakdowns</h2>
      <p class="muted" style="font-size:0.85rem;">Jump into one season of this league — standings, records, values, and that window's biggest transfers.</p>
      <div id="leagueSeasonLinks"></div>
    </section>

    <section class="panel">
      <h2>Clubs in this league</h2>
      <label class="toggle-label" for="leagueHideSparseToggle" title="Hides/excludes club-seasons with fewer than ${SeasonTable.SPARSE_SQUAD_THRESHOLD} players carrying a recorded value -- the source dataset's coverage is sparse for many clubs/seasons, and a thin roster understates that season's true squad value. Applies to the aggregate chart above too. On by default; the setting is shared across the whole site.">
        <input type="checkbox" id="leagueHideSparseToggle"> Hide incomplete squads (&lt;${SeasonTable.SPARSE_SQUAD_THRESHOLD} players)
      </label>
      <div id="leagueSparseNote" class="muted" style="font-size:0.8rem;margin:6px 0;"></div>
      <div class="table-scroll bref-table-wrap">
        <table class="bref-table" id="leagueClubsTable">
          <thead>${SeasonTable.headRowHTML()}</thead>
          <tbody id="leagueClubsTbody"></tbody>
        </table>
      </div>
    </section>

    ${leagueArtifact ? `
    <section class="panel">
      <h2>All-time highest-valued players</h2>
      <p class="muted" style="font-size:0.85rem;">Peak value reached WHILE playing in this league; "peak potential" is the highest value they ever went on to reach from their time here onward (even if it came elsewhere — the Haaland-left-and-exploded case). Click any header to sort.</p>
      <div class="table-scroll">
        <table id="leagueAlltimePlayersTable">
          <thead><tr><th>Player</th><th>Peak value here</th><th>Season</th><th>Club</th><th>Peak potential</th></tr></thead>
          <tbody id="leagueAlltimePlayersTbody"></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>Top transfers (all-time)</h2>
      <p class="muted" style="font-size:0.85rem;">Biggest moves touching this league's top flight, by value at the time — sort "Peak since" to see which mattered most in hindsight.</p>
      <div class="table-scroll">
        <table id="leagueAlltimeTransfersTable">
          <thead><tr><th>Season</th><th>Player</th><th>From</th><th>To</th><th>Type</th><th>Fee</th><th>Value then</th><th>Peak since</th></tr></thead>
          <tbody id="leagueAlltimeTransfersTbody"></tbody>
        </table>
      </div>
    </section>` : ""}
  `;

  const hideSparseToggle = document.getElementById("leagueHideSparseToggle");
  hideSparseToggle.checked = SeasonTable.getHideSparse();
  hideSparseToggle.addEventListener("change", (e) => {
    SeasonTable.setHideSparse(e.target.checked);
    renderDynamic();
  });
}

// Rows the "Hide incomplete squads" toggle would exclude from both the
// aggregate chart and the club table, kept in one place so the two stay
// consistent and the note can report how many were dropped.
function visibleClubRows() {
  const hide = document.getElementById("leagueHideSparseToggle").checked;
  const rows = hide ? leagueClubRows.filter((r) => !r.sparse) : leagueClubRows;
  const hiddenCount = leagueClubRows.length - rows.length;
  document.getElementById("leagueSparseNote").textContent = hiddenCount
    ? `${hiddenCount} club-season${hiddenCount === 1 ? "" : "s"} hidden -- fewer than ${SeasonTable.SPARSE_SQUAD_THRESHOLD} players had a recorded value.`
    : "";
  return rows;
}

function renderDynamic() {
  renderChart();
  renderClubsTable();
  renderSeasonLinks();
  renderAlltimeSections();
}

function renderSeasonLinks() {
  const el = document.getElementById("leagueSeasonLinks");
  if (!el) return;
  const seasons = [...new Set(leagueClubRows.map((r) => r.season))].sort((a, b) => b - a);
  el.innerHTML = seasons.map((s) =>
    `<a class="season-chip" href="league-year.html?league=${currentCompetitionId}&year=${s}">${seasonLabel(s)}</a>`
  ).join(" ");
}

function renderAlltimeSections() {
  if (!leagueArtifact) return;
  const ptbody = document.getElementById("leagueAlltimePlayersTbody");
  if (ptbody) {
    const rows = [...(leagueArtifact.alltime_players || [])]
      .sort((a, b) => (b.peak_value_eur || 0) - (a.peak_value_eur || 0)).slice(0, 50);
    ptbody.innerHTML = rows.map((p) => `
      <tr>
        <td>${playerImgHTML(p.image_url, p.name)}<a href="player.html?player=${p.player_id}">${p.name || p.player_id}</a></td>
        <td class="num">${Money.fmtMoney(p.peak_value_eur, { year: p.peak_season })}</td>
        <td>${p.peak_season != null ? seasonLabel(p.peak_season) : "—"}</td>
        <td>${p.peak_club_id != null ? `<a href="franchise.html?club=${p.peak_club_id}">${p.peak_club_name || "Club #" + p.peak_club_id}</a>` : "—"}</td>
        <td class="num">${Money.fmtMoney(p.peak_potential_eur)}</td>
      </tr>`).join("");
  }
  const ttbody = document.getElementById("leagueAlltimeTransfersTbody");
  if (ttbody) {
    const flat = [];
    Object.entries(leagueArtifact.season_transfers || {}).forEach(([s, moves]) => {
      moves.forEach((m) => flat.push({ season: Number(s), ...m }));
    });
    flat.sort((a, b) => Math.max(b.transfer_fee_eur || 0, b.value_at_transfer_eur || 0)
      - Math.max(a.transfer_fee_eur || 0, a.value_at_transfer_eur || 0));
    ttbody.innerHTML = flat.slice(0, 40).map((m) => leagueTransferRowHTML(m, m.season)).join("");
  }
  makeTablesSortable(document.getElementById("leagueDetail"));
}

function renderChart() {
  const bySeason = {};
  visibleClubRows().forEach((r) => {
    if (r.actual_value == null) return;
    bySeason[r.season] = bySeason[r.season] || { actual: 0, n: 0 };
    bySeason[r.season].actual += r.actual_value;
    bySeason[r.season].n += 1;
  });
  const seasons = Object.keys(bySeason).map(Number).sort((a, b) => a - b);
  const labels = seasons.map((s) => seasonLabel(s));
  const values = seasons.map((s) => Money.convertEur(bySeason[s].actual, { year: s }));

  if (leagueChart) leagueChart.destroy();
  leagueChart = new Chart(document.getElementById("leagueChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Combined squad value",
        data: seasons.map((s, i) => ({ x: labels[i], y: values[i], season: s, n: bySeason[s].n })),
        parsing: { yAxisKey: "y" },
        borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.15)",
        tension: 0.25, fill: true,
      }],
    },
    options: {
      responsive: true,
      scales: {
        y: { ticks: { color: "#94a3b8", callback: (v) => Money.fmtConverted(v) }, grid: { color: "#334155" } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#33415530" } },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        tooltip: {
          callbacks: {
            label: (ctx) => `Combined value: ${Money.fmtConverted(ctx.parsed.y)}`,
            afterLabel: (ctx) => `${ctx.raw.n} club${ctx.raw.n === 1 ? "" : "s"} counted`,
          },
        },
      },
    },
  });
}

function renderClubsTable() {
  SeasonTable.renderRows({ rows: visibleClubRows(), tbodyId: "leagueClubsTbody" });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("leagueDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load Leagues page data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p></section>`;
  });
});
