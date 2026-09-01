// League Seasons: every division x season as one sortable table — the
// league-level analogue of the club Team Seasons page. Aggregated in the
// browser from data/squad_value_by_season.json (top-flight rows summed per
// league+season), joined to competitions.json for name/country/level. Links
// each row to that league-season's standings (league-year.html).

let allRows = [];
const sortState = { key: "squad_value", dir: "desc" };

async function init() {
  await Money.init();
  const [squad, comps] = await Promise.all([
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/competitions.json"),
  ]);
  const compById = Object.fromEntries(comps.map((c) => [c.competition_id, c]));

  // Aggregate top-flight club-seasons into one row per league+season.
  const byKey = {};
  for (const r of squad) {
    if (r.league_status !== "top_flight" || !r.league) continue;
    const key = r.league + "|" + r.season;
    let g = byKey[key];
    if (!g) {
      const c = compById[r.league] || {};
      g = byKey[key] = {
        league: r.league,
        name: prettifyLeagueName(c.name || r.league_name || r.league),
        country: c.country_name || "—",
        tier: c.tier != null ? Number(c.tier) : (r.league_tier != null ? Number(r.league_tier) : null),
        season: r.season,
        clubs: 0, squad_value: 0, later_peak: 0,
        teams_expected: r.teams_expected != null ? Number(r.teams_expected) : null,
        teams_complete: r.teams_complete === false ? false : (r.teams_complete === true ? true : null),
      };
    }
    g.clubs += 1;
    if (r.actual_value != null) g.squad_value += r.actual_value;
    if (r.potential_value != null) g.later_peak += r.potential_value;
    // teams_present/expected/complete are per league-season, identical across
    // its rows; a single false anywhere marks the season understated.
    if (r.teams_complete === false) g.teams_complete = false;
  }
  allRows = Object.values(byKey);

  // Filter options
  const countries = [...new Set(allRows.map((r) => r.country).filter((c) => c && c !== "—"))].sort();
  document.getElementById("lsCountry").innerHTML =
    `<option value="">All countries</option>` +
    countries.map((c) => `<option value="${c.replace(/"/g, "&quot;")}">${c}</option>`).join("");

  const tiers = [...new Set(allRows.map((r) => r.tier).filter((t) => t != null))].sort((a, b) => a - b);
  document.getElementById("lsTier").innerHTML =
    `<option value="">All levels</option>` +
    tiers.map((t) => `<option value="${t}">${tierLabel(t)}</option>`).join("");

  const years = [...new Set(allRows.map((r) => r.season))].sort((a, b) => b - a);
  document.getElementById("lsYear").innerHTML =
    `<option value="">All seasons</option>` +
    years.map((y) => `<option value="${y}">${seasonLabel(y)}</option>`).join("");

  const names = [...new Set(allRows.map((r) => r.name))].sort();
  document.getElementById("lsList").innerHTML =
    names.map((n) => `<option value="${n.replace(/"/g, "&quot;")}"></option>`).join("");

  ["lsSearch", "lsCountry", "lsTier", "lsYear"].forEach((id) =>
    document.getElementById(id).addEventListener("input", render));
  document.getElementById("lsReset").addEventListener("click", () => {
    ["lsSearch", "lsCountry", "lsTier", "lsYear"].forEach((id) => (document.getElementById(id).value = ""));
    render();
  });

  SeasonTable.wireSortableHeaders({ tableId: "lsTable", sortState, onSort: render });
  window.addEventListener("moneysettingschange", render);
  render();
}

function tierLabel(t) {
  return ({ 1: "1st tier", 2: "2nd tier", 3: "3rd tier" })[t] || `Tier ${t}`;
}

function filtered() {
  const q = document.getElementById("lsSearch").value.trim().toLowerCase();
  const country = document.getElementById("lsCountry").value;
  const tier = document.getElementById("lsTier").value;
  const year = document.getElementById("lsYear").value;
  return allRows.filter((r) => {
    if (country && r.country !== country) return false;
    if (tier && String(r.tier) !== tier) return false;
    if (year && String(r.season) !== year) return false;
    if (q && !(r.name || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  SeasonTable.sortRows(rows, sortState);
  SeasonTable.updateSortIndicators("lsTable", sortState);

  const money = (v, y) => (v != null ? Money.fmtMoney(v, { year: y }) : "—");
  document.getElementById("lsTbody").innerHTML = rows
    .map((r) => {
      const warn = r.teams_complete === false
        ? ` <span title="Source is missing one or more clubs this season — total understated" style="color:var(--warn,#f59e0b)">⚠</span>`
        : "";
      return `
      <tr>
        <td class="team-cell"><a href="league-year.html?league=${r.league}&year=${r.season}">${r.name}</a>${warn}</td>
        <td>${r.country || "—"}</td>
        <td class="num">${r.tier != null ? r.tier : "—"}</td>
        <td>${seasonLabel(r.season)}</td>
        <td class="num">${r.clubs}${r.teams_expected ? "/" + r.teams_expected : ""}</td>
        <td class="num">${money(r.squad_value, r.season)}</td>
        <td class="num">${money(r.later_peak, r.season)}</td>
      </tr>`;
    })
    .join("");

  document.getElementById("lsSummary").textContent =
    `${rows.length.toLocaleString()} league-seasons`;
}

init().catch((err) => {
  console.error(err);
  document.querySelector("main").innerHTML =
    `<p style="color:#f87171;padding:20px;">Couldn't load league seasons (${err.message}).</p>`;
});
