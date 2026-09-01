// Shared "one row per club-season" sortable table -- the Team Seasons page
// (every row), the Franchise page (filtered to one club), and the Leagues
// page (filtered to one league) all show the same row shape drawn from
// squad_value_by_season.json, so the row-building, sorting, and rendering
// logic lives here once instead of being copy-pasted per page.

// Below this many valued players, a club-season's roster is almost
// certainly missing real squad members rather than the club genuinely
// having that few players -- source coverage is sparse for most clubs
// outside the top 5 leagues and recent seasons. This is the front-end
// mirror of precompute's ROSTER_COMPLETE_MIN and is used only as a fallback:
// rows now carry a precomputed `roster_complete` flag, which buildSeasonRow
// prefers. Deliberately stronger than the old "< 11" rule -- a real senior
// squad the source has covered runs ~20-27 valued players, so anything this
// thin is a coverage hole, not a small club.
const SPARSE_SQUAD_THRESHOLD = 15;

// Whether to hide sparse-squad rows, persisted across pages/sessions and
// shared by every page that embeds this table (Seasons, Franchise, Leagues)
// plus Teams/Dashboard/Compare, which use the flag/threshold directly rather
// than through renderRows. Defaults ON: measured on real data, 65% of all
// club-seasons in the dataset fall below the threshold (64% even restricted
// to seasons since 2018) -- showing that as the default view would make raw,
// mostly-empty rosters look authoritative rather than incomplete.
const HIDE_SPARSE_STORAGE_KEY = "squadValueTracker.hideSparse";

function getHideSparse() {
  const v = localStorage.getItem(HIDE_SPARSE_STORAGE_KEY);
  return v === null ? true : v === "true";
}

function setHideSparse(hide) {
  localStorage.setItem(HIDE_SPARSE_STORAGE_KEY, hide ? "true" : "false");
  window.dispatchEvent(new CustomEvent("sparsefilterchange"));
}

function buildSeasonRow(r, clubsById, competitionsById) {
  const club = clubsById[String(r.club_id)] || {};
  const actual = r.actual_value;
  const future = r.potential_value;
  const alltime = r.potential_value_alltime;

  // A real competition id now exists for both top flights AND the 2nd/3rd-tier
  // divisions (from team_competitions_seasons); only the vague ClubElo "lower"
  // rows have league == null and fall back to their tier name.
  function leagueLabel() {
    if (r.league) {
      const comp = competitionsById[r.league];
      return comp ? prettifyLeagueName(comp.name) : (r.league_name || r.league);
    }
    if (r.league_status === "lower" && r.league_name) return r.league_name;
    if (r.league_status === "lower") return "Lower division";
    return "—";
  }
  // Short form for compact cells -- the competition_id code ("GB1", "GB2")
  // when known; league-less lower rows keep their (already-short) tier name.
  function leagueAbbrev() {
    if (r.league) return r.league;
    return leagueLabel();
  }
  function leagueKey() {
    if (r.league) return `comp:${r.league}`;
    if (r.league_status === "lower" && r.league_name) return `lower:${r.league_name}`;
    return null;
  }

  return {
    club_id: r.club_id,
    team: club.name || `Club #${r.club_id}`,
    crest_url: club.crest_url,
    country_id: club.country_id != null ? String(club.country_id) : null,
    country_name: club.country_name,
    season: r.season,
    league_label: leagueLabel(),
    league_abbrev: leagueAbbrev(),
    league_key: leagueKey(),
    league_id: r.league || null,
    league_status: r.league_status,
    actual_value: actual,
    potential_value: future,
    potential_value_alltime: alltime,
    cohort_peak_value: r.cohort_peak_value != null ? r.cohort_peak_value : null,
    cohort_peak_year: r.cohort_peak_year != null ? r.cohort_peak_year : null,
    teams_present: r.teams_present != null ? r.teams_present : null,
    teams_expected: r.teams_expected != null ? r.teams_expected : null,
    teams_complete: r.teams_complete,
    future_diff_pct: actual ? ((future - actual) / actual) * 100 : null,
    alltime_diff_pct: actual ? ((alltime - actual) / actual) * 100 : null,
    cohort_diff_pct: actual && r.cohort_peak_value != null ? ((r.cohort_peak_value - actual) / actual) * 100 : null,
    average_age: r.average_age,
    wins: r.wins != null ? r.wins : null,
    draws: r.draws != null ? r.draws : null,
    losses: r.losses != null ? r.losses : null,
    squad_size: r.squad_size,
    // Prefer the precomputed completeness flag; fall back to the size rule
    // only for rows generated before it existed.
    sparse: r.roster_complete != null
      ? !r.roster_complete
      : (r.squad_size != null && r.squad_size < SPARSE_SQUAD_THRESHOLD),
    league_coverage_ok: r.league_coverage_ok === true,
    promoted: r.promoted === true,
    relegated: r.relegated === true,
    final_position: r.final_position != null ? r.final_position : null,
    cup_wins: r.cup_wins || [],
  };
}

const SeasonTable = (() => {
  // League finish + any cup finals won that season, combined into one
  // compact cell: "🏆 1st" for a title win, "#4" for a plain finish, plus a
  // 🏆 per cup won (hover for which) since winning a domestic/continental
  // cup is orthogonal to league position -- a club can do both, or either,
  // in the same season (e.g. Man City's 2022/23 treble season).
  function resultCellHTML(r) {
    let posText = "—";
    if (r.final_position === 1) {
      const leagueName = r.league_label && r.league_label !== "—" ? r.league_label : "the league";
      posText = `<span title="Champions — won ${leagueName} ${seasonLabel(r.season)}">🏆 1st</span>`;
    } else if (r.final_position != null) {
      posText = ordinal(r.final_position);
    }
    const cupBadges = (r.cup_wins || [])
      .map((c) => `<span title="Won ${prettifyLeagueName(c.competition_name)} ${seasonLabel(r.season)}">🏆</span>`)
      .join(" ");
    return cupBadges ? `${posText} ${cupBadges}` : posText;
  }

  function fmtPct(v) {
    if (v == null || isNaN(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(1)}%`;
  }

  // sortState: { key, dir }, mutated in place -- caller re-renders after.
  function sortRows(rows, sortState) {
    const { key, dir } = sortState;
    const mult = dir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always sort last regardless of direction
      if (bv == null) return -1;
      if (typeof av === "string") return av.localeCompare(bv) * mult;
      return (av - bv) * mult;
    });
    return rows;
  }

  function updateSortIndicators(tableId, sortState) {
    document.querySelectorAll(`#${tableId} th[data-key]`).forEach((th) => {
      th.classList.toggle("sorted-asc", th.dataset.key === sortState.key && sortState.dir === "asc");
      th.classList.toggle("sorted-desc", th.dataset.key === sortState.key && sortState.dir === "desc");
    });
  }

  // sortState is mutated on click; onSort is called after so the caller can
  // re-sort its own row array and re-render (this module doesn't own the
  // row array, only the header click -> sortState transition).
  function wireSortableHeaders({ tableId, sortState, onSort }) {
    document.querySelectorAll(`#${tableId} th[data-key]`).forEach((th) => {
      th.addEventListener("click", () => {
        const key = th.dataset.key;
        if (sortState.key === key) {
          sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
        } else {
          sortState.key = key;
          sortState.dir = th.dataset.type === "text" ? "asc" : "desc";
        }
        onSort();
        updateSortIndicators(tableId, sortState);
      });
    });
    // Add hover blurbs + a "?" link to the data dictionary on every stat header.
    if (typeof decorateStatHeaders === "function") {
      decorateStatHeaders(document.getElementById(tableId));
    }
    updateSortIndicators(tableId, sortState);
  }

  function renderRows({ rows, tbodyId, resultsSummaryId, totalCount }) {
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = rows
      .map((r) => {
        const futureCls = r.future_diff_pct == null ? "" : r.future_diff_pct >= 0 ? "pct-pos" : "pct-neg";
        const alltimeCls = r.alltime_diff_pct == null ? "" : r.alltime_diff_pct >= 0 ? "pct-pos" : "pct-neg";
        const cohortCls = r.cohort_diff_pct == null ? "" : r.cohort_diff_pct >= 0 ? "pct-pos" : "pct-neg";
        const sparseTitle = r.sparse
          ? `Only ${r.squad_size} player${r.squad_size === 1 ? " has" : "s have"} a recorded value this season -- the source ` +
            `dataset's coverage is sparse for many clubs/seasons, especially outside the top 5 leagues and recent years. ` +
            `Treat this season's total squad value with caution.`
          : "";
        // A yo-yo team can be BOTH (promoted into this season, then relegated
        // straight back out), so the two badges are independent, not either/or.
        const movementBadge =
          (r.promoted ? `<span class="move-badge promoted" title="Newly promoted into this season">▲</span>` : "") +
          (r.relegated ? `<span class="move-badge relegated" title="Relegated at the end of this season">▼</span>` : "");
        return `<tr${r.sparse ? ` class="sparse-row" title="${sparseTitle}"` : ""}>
          <td class="team-cell">
            <a href="teams.html?club=${r.club_id}&year=${r.season}" target="_blank" rel="noopener">
              ${logoImgHTML(r.crest_url, r.team, { size: "xs" })}${r.team}
            </a>${movementBadge}
          </td>
          <td>${seasonLabel(r.season)}</td>
          <td>${r.league_id
            ? `<a href="league-year.html?league=${r.league_id}&year=${r.season}" title="${r.league_label} — ${seasonLabel(r.season)}">${r.league_abbrev}</a>`
            : `<span title="${r.league_label}">${r.league_abbrev}</span>`}</td>
          <td>${resultCellHTML(r)}</td>
          <td class="num" title="League record: wins-draws-losses">${r.wins != null ? `${r.wins}-${r.draws}-${r.losses}` : "—"}</td>
          <td class="num" data-money="actual_value">${Money.fmtMoney(r.actual_value, { year: r.season })}</td>
          <td class="num" data-money="potential_value">${Money.fmtMoney(r.potential_value, { year: r.season })}</td>
          <td class="num" data-money="potential_value_alltime">${Money.fmtMoney(r.potential_value_alltime, { year: r.season })}</td>
          <td class="num" data-money="cohort_peak_value" data-money-year="${r.cohort_peak_year != null ? r.cohort_peak_year : r.season}">${r.cohort_peak_value != null ? Money.fmtMoney(r.cohort_peak_value, { year: r.cohort_peak_year != null ? r.cohort_peak_year : r.season }) : "—"}</td>
          <td class="num">${r.cohort_peak_year != null ? seasonLabel(r.cohort_peak_year) : "—"}</td>
          <td class="num ${futureCls}">${fmtPct(r.future_diff_pct)}</td>
          <td class="num ${alltimeCls}">${fmtPct(r.alltime_diff_pct)}</td>
          <td class="num ${cohortCls}">${fmtPct(r.cohort_diff_pct)}</td>
          <td class="num">${r.average_age != null ? r.average_age.toFixed(1) : "—"}</td>
          <td class="num">${r.squad_size != null ? r.squad_size : "—"}${r.sparse ? " ⚠" : ""}</td>
        </tr>`;
      })
      .join("");

    if (resultsSummaryId) {
      const el = document.getElementById(resultsSummaryId);
      if (el) {
        el.textContent = totalCount != null
          ? `${rows.length.toLocaleString()} of ${totalCount.toLocaleString()} team-seasons`
          : `${rows.length.toLocaleString()} team-seasons`;
      }
    }
  }

  // Currency/inflation-toggle changes don't add, remove, or reorder rows
  // (sorting is always on the raw EUR figure, and the percentage columns
  // are currency-invariant ratios computed once in buildSeasonRow) -- the
  // only thing that actually needs to change on screen is the text of the
  // money cells themselves. Rebuilding the whole table via renderRows on
  // every currency switch means re-generating and re-parsing a multi-
  // thousand-row HTML string just to change a few characters per row --
  // measured on the Team Seasons page's ~21k rows: ~600ms for a full
  // renderRows vs. ~100-150ms updating just these cells in place. Callers
  // still need the full renderRows path whenever the row SET can change
  // (e.g. an active currency-denominated value-range filter, where a row
  // can cross the threshold and enter/leave the filtered set).
  function updateMoneyCells(rows, tbodyId) {
    const trs = document.getElementById(tbodyId).children;
    rows.forEach((r, i) => {
      const tr = trs[i];
      if (!tr) return;
      tr.querySelectorAll("[data-money]").forEach((td) => {
        const yr = td.dataset.moneyYear ? Number(td.dataset.moneyYear) : r.season;
        td.textContent = Money.fmtMoney(r[td.dataset.money], { year: yr });
      });
    });
  }

  // The <thead> markup shared by every page embedding this table -- Team
  // Seasons ships it inline in its own HTML (needs the country/league/value
  // filters around it too), Franchise/Leagues can inject this directly.
  function headRowHTML() {
    return `
      <tr>
        <th data-key="team" data-type="text">Team</th>
        <th data-key="season" data-type="num">Year</th>
        <th data-key="league_label" data-type="text">League</th>
        <th data-key="final_position" data-type="text" title="League finish, plus any cup finals won that season">Result</th>
        <th data-key="wins" data-type="num" class="num" title="League record: wins-draws-losses">Record</th>
        <th data-key="actual_value" data-type="num" class="num">Squad Value</th>
        <th data-key="potential_value" data-type="num" class="num">Later Peak</th>
        <th data-key="potential_value_alltime" data-type="num" class="num">All-Time Peak</th>
        <th data-key="cohort_peak_value" data-type="num" class="num" title="Single-Year Peak: the highest combined value this season's players reached in one single later year — valued together in the same year (even after some moved clubs), unlike Later/All-Time Peak which sum each player's own best year separately — all built from real recorded values, never a projection">Single-Year Peak</th>
        <th data-key="cohort_peak_year" data-type="num" class="num" title="The single later year in which this season's players were collectively worth the most">Peak Year</th>
        <th data-key="future_diff_pct" data-type="num" class="num">Later %</th>
        <th data-key="alltime_diff_pct" data-type="num" class="num">All-Time %</th>
        <th data-key="cohort_diff_pct" data-type="num" class="num" title="% growth from the squad's value that season to its Single-Year Peak">Peak %</th>
        <th data-key="average_age" data-type="num" class="num">Avg Age</th>
        <th data-key="squad_size" data-type="num" class="num">Squad</th>
      </tr>`;
  }

  return {
    fmtPct, sortRows, wireSortableHeaders, updateSortIndicators, renderRows, updateMoneyCells, headRowHTML,
    SPARSE_SQUAD_THRESHOLD, getHideSparse, setHideSparse,
  };
})();
