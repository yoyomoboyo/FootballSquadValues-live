// League-Year page: one league season in full -- the standings/records/value
// table (shared season-table.js rows filtered to league+season, default
// sorted by league finish) and that window's biggest transfers, both by
// value at the time and by what the player eventually became
// (future_peak_value_eur). Deep-linked as league-year.html?league=X&year=Y;
// the Leagues page's "Season breakdowns" chips land here.

let squadBySeasonAll = [];
let clubsById = {};
let competitionsById = {};
let competitions = [];
let currentCompetitionId = null;
let currentSeason = null;
let leagueArtifact = null; // data/leagues/{id}.json, for the transfer panels
let teamRows = [];
const teamSortState = { key: "final_position", dir: "asc" };

async function init() {
  await Money.init();
  const [squadBySeason, clubs, comps] = await Promise.all([
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/clubs.json"),
    Money.loadJSON("data/competitions.json"),
  ]);
  squadBySeasonAll = squadBySeason;
  clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));
  competitions = comps.filter((c) => c.type === "domestic_league");
  competitionsById = Object.fromEntries(comps.map((c) => [c.competition_id, c]));

  populateCountryOptions();
  populateLevelOptions();
  populateLeagueOptions();
  wireControls();

  const params = new URLSearchParams(location.search);
  const league = params.get("league");
  const year = params.get("year");
  if (league && competitionsById[league]) {
    await pickLeague(league, year != null ? Number(year) : null);
  }

  window.addEventListener("moneysettingschange", () => {
    if (currentCompetitionId != null && currentSeason != null) renderDynamic();
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

function populateYearOptions() {
  const sel = document.getElementById("yearPickSelect");
  const seasons = [...new Set(
    squadBySeasonAll
      .filter((r) => r.league === currentCompetitionId)
      .map((r) => r.season)
  )].sort((a, b) => b - a);
  sel.disabled = false;
  sel.innerHTML =
    `<option value="">Choose a season…</option>` +
    seasons.map((s) => `<option value="${s}">${seasonLabel(s)}</option>`).join("");
  sel.value = currentSeason != null ? String(currentSeason) : "";
  return seasons;
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
    if (e.target.value) pickLeague(e.target.value, null);
  });
  document.getElementById("yearPickSelect").addEventListener("change", (e) => {
    if (e.target.value !== "") pickSeason(Number(e.target.value));
  });
}

async function pickLeague(competitionId, season) {
  const comp = competitionsById[competitionId];
  if (!comp) return;
  currentCompetitionId = competitionId;
  if (comp.country_id != null) document.getElementById("leagueCountrySelect").value = String(comp.country_id);
  populateLevelOptions(comp.country_id);
  const levelSel = document.getElementById("leagueLevelSelect");
  if (levelSel && comp.tier != null) levelSel.value = String(comp.tier);
  populateLeagueOptions(comp.country_id, comp.tier);
  const seasons = populateYearOptions();

  leagueArtifact = null;
  try {
    leagueArtifact = await Money.loadJSON(`data/leagues/${competitionId}.json`);
  } catch (e) {
    console.warn(`no league artifact for ${competitionId}`, e);
  }

  // Default to the latest season with data when none was asked for.
  const target = season != null && seasons.includes(season) ? season : seasons[0];
  if (target != null) pickSeason(target);
}

function pickSeason(season) {
  currentSeason = season;
  document.getElementById("yearPickSelect").value = String(season);

  const params = new URLSearchParams(location.search);
  params.set("league", currentCompetitionId);
  params.set("year", String(season));
  history.replaceState(null, "", `${location.pathname}?${params}`);

  teamRows = squadBySeasonAll
    .filter((r) => r.league === currentCompetitionId && r.season === season)
    .map((r) => buildSeasonRow(r, clubsById, competitionsById));

  buildStructure();
  SeasonTable.wireSortableHeaders({
    tableId: "leagueYearTeamsTable", sortState: teamSortState,
    onSort: () => { SeasonTable.sortRows(teamRows, teamSortState); renderTeamsTable(); },
  });
  teamSortState.key = "final_position";
  teamSortState.dir = "asc";
  SeasonTable.sortRows(teamRows, teamSortState);
  renderDynamic();
}

function buildStructure() {
  const comp = competitionsById[currentCompetitionId];
  const compName = prettifyLeagueName(comp.name);
  const transfers = seasonTransfers();
  document.getElementById("leagueYearDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${logoImgHTML(competitionLogoUrl(currentCompetitionId), compName, { size: "lg" })}
      <div>
        <h2 class="team-header-name">${compName} — ${seasonLabel(currentSeason)}</h2>
        <div class="muted">${comp.country_name || ""} · <a href="leagues.html?league=${currentCompetitionId}">whole-league view</a></div>
        <div class="allstar-links">
          <a class="allstar-link" href="allstar.html?scope=league&league=${currentCompetitionId}"><span class="st">★</span> <span>League All-Star<br><span class="d">${compName}'s best 26 by value, all-time</span></span></a>
          <a class="allstar-link" href="allstar.html?scope=league-season&league=${currentCompetitionId}&year=${currentSeason}"><span class="st">★</span> <span>Season All-Star<br><span class="d">Best 26 of ${seasonLabel(currentSeason)}</span></span></a>
        </div>
      </div>
      <div class="team-header-season">
        <div class="kpi-label">Combined squad value</div>
        <div class="kpi-value" id="leagueYearTotal">—</div>
        <div class="muted" id="leagueYearTotalNote" style="font-size:0.72rem;"></div>
      </div>
    </section>

    <div id="leagueYearCoverage"></div>

    <section class="panel">
      <h2>Teams — standings, records, values</h2>
      <p class="muted" style="font-size:0.85rem;">Default order is the league finish; click any column to re-sort. Record is the league W-D-L.</p>
      <div class="table-scroll bref-table-wrap">
        <table class="bref-table" id="leagueYearTeamsTable">
          <thead>${SeasonTable.headRowHTML()}</thead>
          <tbody id="leagueYearTeamsTbody"></tbody>
        </table>
      </div>
    </section>

    ${transfers ? `
    <section class="moves-grid">
      <div class="panel">
        <h2>Top transfers — by value at the time</h2>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Season</th><th>Player</th><th>From</th><th>To</th><th>Type</th><th>Fee</th><th>Value then</th><th>Peak since</th></tr></thead>
            <tbody id="leagueYearTransfersNowTbody"></tbody>
          </table>
        </div>
      </div>
      <div class="panel">
        <h2>Top transfers — by what they became</h2>
        <p class="muted" style="font-size:0.8rem;">Ranked by the player's peak value from the move onward — the deals that mattered most in hindsight.</p>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Season</th><th>Player</th><th>From</th><th>To</th><th>Type</th><th>Fee</th><th>Value then</th><th>Peak since</th></tr></thead>
            <tbody id="leagueYearTransfersPeakTbody"></tbody>
          </table>
        </div>
      </div>
    </section>` : `
    <section class="panel">
      <p class="muted">No transfer records for this league season${leagueArtifact ? "" : " (league artifact not generated yet — re-run precompute.py)"}.</p>
    </section>`}
  `;
}

function seasonTransfers() {
  if (!leagueArtifact || !leagueArtifact.season_transfers) return null;
  const moves = leagueArtifact.season_transfers[String(currentSeason)];
  return moves && moves.length ? moves : null;
}

function renderDynamic() {
  renderTeamsTable();
  renderTransfers();
  renderTotal();
  makeTablesSortable(document.getElementById("leagueYearDetail"));
}

function renderTotal() {
  // Incomplete squads understate their value, so the league total sums only
  // the complete ones and says how many it left out -- otherwise a couple of
  // thin rosters would drag the "combined value" well below the real figure.
  const complete = teamRows.filter((r) => !r.sparse);
  const excluded = teamRows.length - complete.length;
  const total = complete.reduce((sum, r) => sum + (r.actual_value || 0), 0);
  document.getElementById("leagueYearTotal").textContent =
    Money.fmtMoney(total, { year: currentSeason });
  const note = document.getElementById("leagueYearTotalNote");
  if (note) {
    note.textContent = excluded > 0
      ? `${complete.length} of ${teamRows.length} teams (excludes ${excluded} incomplete)`
      : `all ${complete.length} teams`;
  }

  // Season-level coverage banner: if too few of this league-season's clubs
  // are complete, the whole picture is unreliable, not just a couple of rows.
  const cov = document.getElementById("leagueYearCoverage");
  if (cov) {
    const wellCovered = teamRows.some((r) => r.league_coverage_ok);
    // Missing-teams check (Item H): whole clubs absent vs. how many actually
    // played this league-season -- a different problem from roster thinness.
    const ref = teamRows.find((r) => r.teams_expected != null);
    const missingTeams =
      ref && ref.teams_present != null && ref.teams_expected != null && ref.teams_present < ref.teams_expected;
    const banners = [];
    if (missingTeams) {
      banners.push(
        `⚠ Only ${ref.teams_present} of ${ref.teams_expected} clubs that played this league season are in the data — ` +
        `whole clubs are missing, so this league's combined value is understated. Not a fair comparison against fully-covered seasons.`
      );
    }
    if (!wellCovered && teamRows.length) {
      banners.push(
        `⚠ Incomplete season — the source dataset has thin roster coverage for much of this league that year (common pre-2012 ` +
        `and outside the top leagues), so standings values and the combined total are understated. Teams marked ⚠ fall below a full senior squad.`
      );
    }
    cov.innerHTML = banners.length
      ? `<section class="panel">${banners.map((b) => `<p class="muted sparse-banner" style="margin:0 0 6px;">${b}</p>`).join("")}</section>`
      : "";
  }
}

function renderTeamsTable() {
  SeasonTable.renderRows({ rows: teamRows, tbodyId: "leagueYearTeamsTbody" });
}

function renderTransfers() {
  const moves = seasonTransfers();
  if (!moves) return;
  const nowBody = document.getElementById("leagueYearTransfersNowTbody");
  const peakBody = document.getElementById("leagueYearTransfersPeakTbody");
  const byNow = [...moves].sort((a, b) =>
    Math.max(b.transfer_fee_eur || 0, b.value_at_transfer_eur || 0)
    - Math.max(a.transfer_fee_eur || 0, a.value_at_transfer_eur || 0));
  const byPeak = [...moves].sort((a, b) => (b.future_peak_value_eur || 0) - (a.future_peak_value_eur || 0));
  nowBody.innerHTML = byNow.slice(0, 12).map((m) => leagueTransferRowHTML(m, currentSeason)).join("");
  peakBody.innerHTML = byPeak.slice(0, 12).map((m) => leagueTransferRowHTML(m, currentSeason)).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("leagueYearDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load league-season data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p></section>`;
  });
});
