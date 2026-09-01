// Team Seasons: every club-season in squad_value_by_season.json as one big
// sortable, filterable table (basketball-reference-style stat table). Row
// building/sorting/rendering itself lives in season-table.js, shared with
// the Franchise and Leagues pages.

const TOP5_LEAGUE_KEYS = new Set(["comp:GB1", "comp:ES1", "comp:IT1", "comp:L1", "comp:FR1"]);

let allRows = [];
let filteredRows = [];
let clubsById = {};
let competitionsById = {};
let seasonMin = 1999;
let seasonMax = 2025;
// Current slider TRACK bounds -- unlike seasonMin/seasonMax (the full
// dataset span, used only to reset back to "no filter"), these resize to
// whatever team/country/league/top5 filter is active so the track itself
// never shows dead space for years the current selection has no data in
// (see autoFitYearRange).
let trackMin = 1999;
let trackMax = 2025;
const sortState = { key: "actual_value", dir: "desc" };

async function init() {
  await Money.init();
  const [squadBySeason, clubs, competitions] = await Promise.all([
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/clubs.json"),
    Money.loadJSON("data/competitions.json"),
  ]);
  clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));
  competitionsById = Object.fromEntries(competitions.map((c) => [c.competition_id, c]));

  allRows = squadBySeason.map((r) => buildSeasonRow(r, clubsById, competitionsById));
  const seasons = allRows.map((r) => r.season);
  seasonMin = Math.min(...seasons);
  seasonMax = Math.max(...seasons);
  trackMin = seasonMin;
  trackMax = seasonMax;

  populateCountryOptions(clubs);
  populateLeagueOptions();
  document.getElementById("hideSparseToggle").checked = SeasonTable.getHideSparse();
  setupYearRangeSlider();
  wireControls();
  SeasonTable.wireSortableHeaders({ tableId: "seasonsTable", sortState, onSort: () => { sortRows(); renderTable(); } });

  applyFiltersAndRender();
  updateUnitLabels();

  window.addEventListener("moneysettingschange", () => {
    updateUnitLabels();
    // Row membership/order never changes from a currency/inflation switch
    // alone (sort is always on the raw EUR figure) UNLESS a value-range
    // filter is active -- those compare a currency-CONVERTED figure against
    // a currency-REINTERPRETED-but-not-converted threshold, so which rows
    // pass genuinely can change. Skip the full filter/sort/rebuild in the
    // (common) case neither is active -- see updateMoneyCells in
    // season-table.js for why this matters on a 21k-row table.
    if (hasActiveValueFilters()) {
      applyFiltersAndRender();
    } else {
      SeasonTable.updateMoneyCells(filteredRows, "seasonsTbody");
    }
  });
}

function hasActiveValueFilters() {
  return ["minActualInput", "maxActualInput", "minFutureInput", "maxFutureInput"]
    .some((id) => document.getElementById(id).value.trim() !== "");
}

function updateUnitLabels() {
  document.querySelectorAll(".value-unit").forEach((el) => { el.textContent = Money.unitLabel(); });
}

// ---------------------------------------------------------------------------
// Filter controls
// ---------------------------------------------------------------------------

function populateCountryOptions(clubs) {
  const seen = new Map();
  clubs.forEach((c) => {
    if (c.country_id != null && c.country_name && !seen.has(String(c.country_id))) {
      seen.set(String(c.country_id), c.country_name);
    }
  });
  const sorted = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sel = document.getElementById("countryFilterSelect");
  sel.innerHTML =
    `<option value="">Any country</option>` +
    sorted.map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
}

function populateLeagueOptions() {
  const seen = new Map();
  allRows.forEach((r) => {
    if (r.league_key && !seen.has(r.league_key)) seen.set(r.league_key, r.league_label);
  });
  const sorted = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const sel = document.getElementById("leagueFilterSelect");
  sel.innerHTML =
    `<option value="">Any league</option>` +
    sorted.map(([key, label]) => `<option value="${key}">${label}</option>`).join("");
}

// Sets the slider TRACK bounds (both the <input>s' own min/max and the
// module-level trackMin/trackMax used to compute the fill visual) and snaps
// both thumbs to span the full new range.
function setTrackBounds(min, max) {
  trackMin = min;
  trackMax = max;
  const minInput = document.getElementById("yearRangeMin");
  const maxInput = document.getElementById("yearRangeMax");
  [minInput, maxInput].forEach((el) => {
    el.min = String(trackMin);
    el.max = String(trackMax);
    el.step = "1";
  });
  minInput.value = String(trackMin);
  maxInput.value = String(trackMax);
  [document.getElementById("yearFromInput"), document.getElementById("yearToInput")].forEach((el) => {
    el.min = String(trackMin);
    el.max = String(trackMax);
  });
  renderYearTicks();
}

// Evenly spaced whole-year guide labels under the slider (~6 of them) so the
// selected window is legible without dragging. Positioned with the same
// percent math as the fill; re-rendered whenever the track resizes.
function renderYearTicks() {
  const el = document.getElementById("yearRangeTicks");
  if (!el) return;
  const span = trackMax - trackMin;
  if (span <= 0) {
    el.innerHTML = `<span style="left:0%">${trackMin}</span>`;
    return;
  }
  // Evenly spaced across the whole track including both endpoints, so the
  // ends read exactly trackMin/trackMax and nothing crowds the right edge.
  const target = Math.min(6, span);
  const years = [];
  for (let i = 0; i <= target; i++) years.push(Math.round(trackMin + (span * i) / target));
  el.innerHTML = [...new Set(years)]
    .map((y) => {
      const pct = ((y - trackMin) / span) * 100;
      // Pin the extreme labels inside the track instead of centring them.
      const shift = pct <= 0 ? "0" : pct >= 100 ? "-100%" : "-50%";
      return `<span style="left:${pct}%;transform:translateX(${shift})">${y}</span>`;
    })
    .join("");
}

// Two overlaid native <input type="range"> sharing one visual track --
// simplest reliable way to get a dual-handle slider without a dependency.
// Dragging a native range fires 'input' continuously; the visual update is
// cheap but re-filtering/re-rendering the ~28k-row table is not, so the
// table refresh is debounced while the fill/label/boxes track the thumb in
// real time (this is what fixes the drag-time stutter).
let renderYearFilterDebounced = null;

function setupYearRangeSlider() {
  setTrackBounds(trackMin, trackMax);
  updateYearRangeVisual();

  renderYearFilterDebounced = debounce(applyFiltersAndRender, 110);

  const minInput = document.getElementById("yearRangeMin");
  const maxInput = document.getElementById("yearRangeMax");
  minInput.addEventListener("input", () => {
    if (Number(minInput.value) > Number(maxInput.value)) minInput.value = maxInput.value;
    updateYearRangeVisual();
    renderYearFilterDebounced();
  });
  maxInput.addEventListener("input", () => {
    if (Number(maxInput.value) < Number(minInput.value)) maxInput.value = minInput.value;
    updateYearRangeVisual();
    renderYearFilterDebounced();
  });

  // Explicit From/To year boxes: an alternative to dragging. Commit on
  // change (blur / Enter), clamp into the live track bounds, and let the
  // thumbs follow.
  const fromInput = document.getElementById("yearFromInput");
  const toInput = document.getElementById("yearToInput");
  function commitYearBoxes() {
    let from = Math.round(Number(fromInput.value));
    let to = Math.round(Number(toInput.value));
    if (!Number.isFinite(from)) from = trackMin;
    if (!Number.isFinite(to)) to = trackMax;
    from = Math.min(Math.max(from, trackMin), trackMax);
    to = Math.min(Math.max(to, trackMin), trackMax);
    if (from > to) { const t = from; from = to; to = t; }
    minInput.value = String(from);
    maxInput.value = String(to);
    updateYearRangeVisual();
    applyFiltersAndRender();
  }
  fromInput.addEventListener("change", commitYearBoxes);
  toInput.addEventListener("change", commitYearBoxes);
}

function updateYearRangeVisual() {
  const minInput = document.getElementById("yearRangeMin");
  const maxInput = document.getElementById("yearRangeMax");
  const lo = Number(minInput.value);
  const hi = Number(maxInput.value);
  const span = trackMax - trackMin || 1;
  const loPct = ((lo - trackMin) / span) * 100;
  const hiPct = ((hi - trackMin) / span) * 100;
  const fill = document.getElementById("yearRangeFill");
  fill.style.left = `${loPct}%`;
  fill.style.width = `${Math.max(0, hiPct - loPct)}%`;
  document.getElementById("yearRangeLabel").textContent = `${seasonLabel(lo)} – ${seasonLabel(hi)}`;
  // Keep the explicit boxes in step with the thumbs, but never clobber a box
  // the user is actively typing in.
  const fromInput = document.getElementById("yearFromInput");
  const toInput = document.getElementById("yearToInput");
  if (document.activeElement !== fromInput) fromInput.value = String(lo);
  if (document.activeElement !== toInput) toInput.value = String(hi);
}

// Which team/country/league/top5 combination is currently selected, using
// the full row set (not the year range or value filters, which shouldn't
// feed back into this) -- used to auto-fit the year slider to whatever
// span actually has data for that selection.
function computeYearBoundsForCurrentNonYearFilters() {
  const team = document.getElementById("teamFilterInput").value.trim().toLowerCase();
  const countryId = document.getElementById("countryFilterSelect").value;
  const leagueKey = document.getElementById("leagueFilterSelect").value;
  const top5Only = document.getElementById("top5Toggle").checked;
  const hideSparse = document.getElementById("hideSparseToggle").checked;
  const relevant = allRows.filter((r) => {
    if (team && !r.team.toLowerCase().includes(team)) return false;
    if (countryId && r.country_id !== countryId) return false;
    if (top5Only) {
      if (!r.league_key || !TOP5_LEAGUE_KEYS.has(r.league_key)) return false;
    } else if (leagueKey && r.league_key !== leagueKey) {
      return false;
    }
    if (hideSparse && r.sparse) return false;
    return true;
  });
  if (!relevant.length) return null;
  const seasons = relevant.map((r) => r.season);
  return { min: Math.min(...seasons), max: Math.max(...seasons) };
}

// Resizes the slider TRACK itself (not just the thumbs) to the actual
// min/max season present for whatever team/country/league/top5 filter is
// active -- picking a club that only has data 2015-2025 shouldn't leave the
// slider spanning a decade of dead space with nothing to show either side.
function autoFitYearRange() {
  const bounds = computeYearBoundsForCurrentNonYearFilters();
  setTrackBounds(bounds ? bounds.min : seasonMin, bounds ? bounds.max : seasonMax);
  updateYearRangeVisual();
}

function wireControls() {
  const debounced = debounce(() => { autoFitYearRange(); applyFiltersAndRender(); }, 200);
  document.getElementById("teamFilterInput").addEventListener("input", debounced);
  document.getElementById("countryFilterSelect").addEventListener("change", () => { autoFitYearRange(); applyFiltersAndRender(); });
  document.getElementById("leagueFilterSelect").addEventListener("change", () => { autoFitYearRange(); applyFiltersAndRender(); });
  document.getElementById("top5Toggle").addEventListener("change", () => {
    const on = document.getElementById("top5Toggle").checked;
    const leagueSel = document.getElementById("leagueFilterSelect");
    leagueSel.disabled = on;
    if (on) leagueSel.value = "";
    autoFitYearRange();
    applyFiltersAndRender();
  });
  document.getElementById("hideSparseToggle").addEventListener("change", (e) => {
    SeasonTable.setHideSparse(e.target.checked);
    autoFitYearRange();
    applyFiltersAndRender();
  });
  ["minActualInput", "maxActualInput", "minFutureInput", "maxFutureInput"].forEach((id) => {
    document.getElementById(id).addEventListener("input", debounced);
  });
  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    document.getElementById("teamFilterInput").value = "";
    document.getElementById("countryFilterSelect").value = "";
    document.getElementById("leagueFilterSelect").value = "";
    document.getElementById("leagueFilterSelect").disabled = false;
    document.getElementById("top5Toggle").checked = false;
    document.getElementById("hideSparseToggle").checked = true;
    SeasonTable.setHideSparse(true);
    document.getElementById("minActualInput").value = "";
    document.getElementById("maxActualInput").value = "";
    document.getElementById("minFutureInput").value = "";
    document.getElementById("maxFutureInput").value = "";
    setTrackBounds(seasonMin, seasonMax);
    updateYearRangeVisual();
    applyFiltersAndRender();
  });
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Value filters are typed in millions of the currently-selected display
// currency (and respect the "today's money" toggle) -- so switching
// currency reinterprets a typed "50" as 50 of the new currency rather than
// converting it, matching how every other money figure on the page behaves.
function millionsToInput(inputEl) {
  const v = parseFloat(inputEl.value);
  return isNaN(v) ? null : v * 1e6;
}

function applyFiltersAndRender() {
  const team = document.getElementById("teamFilterInput").value.trim().toLowerCase();
  const countryId = document.getElementById("countryFilterSelect").value;
  const leagueKey = document.getElementById("leagueFilterSelect").value;
  const top5Only = document.getElementById("top5Toggle").checked;
  const hideSparse = document.getElementById("hideSparseToggle").checked;
  const yearFrom = Number(document.getElementById("yearRangeMin").value);
  const yearTo = Number(document.getElementById("yearRangeMax").value);
  const minActual = millionsToInput(document.getElementById("minActualInput"));
  const maxActual = millionsToInput(document.getElementById("maxActualInput"));
  const minFuture = millionsToInput(document.getElementById("minFutureInput"));
  const maxFuture = millionsToInput(document.getElementById("maxFutureInput"));

  filteredRows = allRows.filter((r) => {
    if (team && !r.team.toLowerCase().includes(team)) return false;
    if (countryId && r.country_id !== countryId) return false;
    if (top5Only) {
      if (!r.league_key || !TOP5_LEAGUE_KEYS.has(r.league_key)) return false;
    } else if (leagueKey && r.league_key !== leagueKey) {
      return false;
    }
    if (hideSparse && r.sparse) return false;
    if (r.season < yearFrom || r.season > yearTo) return false;
    const actualDisp = Money.convertEur(r.actual_value, { year: r.season });
    const futureDisp = Money.convertEur(r.potential_value, { year: r.season });
    if (minActual != null && (actualDisp == null || actualDisp < minActual)) return false;
    if (maxActual != null && (actualDisp == null || actualDisp > maxActual)) return false;
    if (minFuture != null && (futureDisp == null || futureDisp < minFuture)) return false;
    if (maxFuture != null && (futureDisp == null || futureDisp > maxFuture)) return false;
    return true;
  });

  sortRows();
  renderTable();
}

function sortRows() {
  SeasonTable.sortRows(filteredRows, sortState);
}

function renderTable() {
  SeasonTable.renderRows({
    rows: filteredRows, tbodyId: "seasonsTbody",
    resultsSummaryId: "resultsSummary", totalCount: allRows.length,
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("resultsSummary").innerHTML =
      `<span class="error-text">Couldn't load season data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</span>`;
  });
});
