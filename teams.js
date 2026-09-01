// Teams page: nation -> league -> team cascade (plus an independent team
// search that bypasses it), an optional year picker, and a team/season
// detail view (roster, league/competition performance, notable transfer
// moves, and "squad time-travel" tracking a fixed roster across years).

const state = { clubId: null, season: null };

let clubsById = {};
let playerValues = {};
let currentClubPayload = null;
let timeTravelChart = null;

function potentialField(row, prefix) {
  const basis = Money.getSettings().valueBasis;
  return basis === "alltime" ? row[`${prefix}alltime_peak_value_eur`] : row[`${prefix}future_peak_value_eur`];
}

// ---------------------------------------------------------------------------
// Init + lookup data
// ---------------------------------------------------------------------------

async function init() {
  await Money.init();

  const params = new URLSearchParams(location.search);
  const initialClub = params.get("club");
  const initialYear = params.get("year");

  const [{ clubsById: pickerClubsById }, pv] = await Promise.all([
    TeamPicker.init({
      onTeamPicked: onTeamPicked,
      initialClubId: initialClub,
      initialExtra: { year: initialYear ? Number(initialYear) : null },
    }),
    Money.loadJSON("data/player_values.json"),
  ]);
  clubsById = pickerClubsById;
  playerValues = pv;

  document.getElementById("yearSelect").addEventListener("change", (e) => {
    state.season = e.target.value ? Number(e.target.value) : null;
    const p = new URLSearchParams(location.search);
    if (state.season) p.set("year", String(state.season)); else p.delete("year");
    history.replaceState(null, "", `${location.pathname}?${p}`);
    renderDetailForCurrentState();
  });

  window.addEventListener("moneysettingschange", () => {
    if (currentClubPayload) renderDetailForCurrentState();
  });
}

// If the cascade is changed away from a picked team (clubId/club null), or a
// team is picked (clubId/club set, optionally with { year } as extra),
// TeamPicker calls this -- it owns everything specific to the Teams page
// (the year param and lazy per-club fetch), while TeamPicker itself only
// owns the generic nation/league/team/search UI and the `club` URL param.
function onTeamPicked(clubId, club, extra) {
  if (!clubId) {
    clearDetailView();
    return;
  }
  const year = extra && extra.year;
  state.clubId = clubId;
  const p = new URLSearchParams(location.search);
  if (year) p.set("year", String(year)); else p.delete("year");
  history.replaceState(null, "", `${location.pathname}?${p}`);
  loadClubDetail(clubId, year);
}

// ---------------------------------------------------------------------------
// Club detail loading + year handling
// ---------------------------------------------------------------------------

async function loadClubDetail(clubId, requestedYear) {
  const el = document.getElementById("teamDetail");
  el.innerHTML = `<section class="panel"><p class="muted">Loading…</p></section>`;
  try {
    const res = await fetch(`data/teams/${clubId}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentClubPayload = await res.json();
  } catch (err) {
    console.error(err);
    currentClubPayload = null;
    el.innerHTML = `<section class="panel"><p class="error-text">No historical data available for this club yet. ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>? (${err.message})</p></section>`;
    return;
  }
  populateYearOptions();
  const hasRequestedYear = requestedYear && currentClubPayload.seasons[String(requestedYear)];
  state.season = hasRequestedYear ? requestedYear : null;
  document.getElementById("yearSelect").value = hasRequestedYear ? String(requestedYear) : "";
  renderDetailForCurrentState();
}

// "2014/15 · GB1" in a known top flight, "2014/15 · Championship" when
// ClubElo pins the lower tier, "2014/15 · lower div." when we only know they
// were below the top flight, plain season label otherwise.
function leagueSuffix(seasonData) {
  const lg = seasonData && seasonData.league;
  if (!lg) return "";
  if (lg.status === "top_flight" && lg.competition_id) return ` · ${lg.competition_id}`;
  if (lg.status === "lower") return lg.name ? ` · ${lg.name}` : " · lower div.";
  return "";
}

function populateYearOptions() {
  const sel = document.getElementById("yearSelect");
  const seasons = Object.keys(currentClubPayload.seasons).map(Number).sort((a, b) => b - a);
  const latest = currentClubPayload.latest_season;
  const latestData = currentClubPayload.seasons[String(latest)];
  sel.disabled = false;
  sel.innerHTML =
    `<option value="">Latest (${seasonLabel(latest)}${leagueSuffix(latestData)})</option>` +
    seasons.map((s) => {
      const sd = currentClubPayload.seasons[String(s)];
      return `<option value="${s}">${seasonLabel(s)}${leagueSuffix(sd)}</option>`;
    }).join("");
  sel.value = "";
}

function clearDetailView() {
  currentClubPayload = null;
  document.getElementById("yearSelect").innerHTML = `<option value="">Latest</option>`;
  document.getElementById("yearSelect").disabled = true;
  document.getElementById("teamDetail").innerHTML = "";
}

// ---------------------------------------------------------------------------
// Detail rendering
// ---------------------------------------------------------------------------

function renderDetailForCurrentState() {
  if (!currentClubPayload) return;
  const isLatest = state.season == null;
  const season = isLatest ? currentClubPayload.latest_season : state.season;
  const seasonData = currentClubPayload.seasons[String(season)];
  const el = document.getElementById("teamDetail");

  if (!seasonData) {
    el.innerHTML = `<section class="panel"><p class="muted">No data for that season.</p></section>`;
    return;
  }

  el.innerHTML = `
    ${renderHeaderStrip(currentClubPayload, season, isLatest, seasonData)}
    <section class="panel">
      <h2>Roster — ${seasonLabel(season)}</h2>
      ${renderRosterTable(seasonData.roster, currentClubPayload.players, season, seasonData.moves)}
      ${renderOutOnLoanList(seasonData.moves, season)}
    </section>
    <section class="panel">
      <h2>Performance — ${seasonLabel(season)}</h2>
      ${renderPerformance(seasonData.performance)}
    </section>
    <section class="moves-grid">
      <div class="panel">
        <h2>Biggest moves — at the time</h2>
        ${renderMovesTable(sortMoves(seasonData.moves, "at_the_time_score"), season)}
      </div>
      <div class="panel">
        <h2>Biggest moves — in hindsight</h2>
        <p class="muted" style="font-size:0.8rem;">Ranked by what the player's value eventually became (their peak from the move onward) — the Bellingham-to-Madrid / selling-Nico-Paz-too-soon view.</p>
        ${renderMovesTable(sortMoves(seasonData.moves, "future_peak_value_eur"), season, "peak")}
      </div>
    </section>
    <section class="panel">
      <h2>This squad's value across time</h2>
      <p class="muted">Tracks the ${seasonLabel(season)} roster's combined value across other years, wherever those players ended up.</p>
      <div id="timeTravelControls" class="picker-row"></div>
      <canvas id="timeTravelChart" height="90"></canvas>
      <div id="timeTravelNote" class="muted chart-note"></div>
      <div id="timeTravelTable"></div>
    </section>
  `;

  renderTimeTravel(seasonData.roster, currentClubPayload, season);
  makeTablesSortable(el);
}

// Squad size the same way squad_value_by_season.json computes it -- valued
// senior-roster players only, excluding folded-in reserve/youth entries
// (played_youth_level) that were never part of that count -- so this lines
// up with the same SPARSE_SQUAD_THRESHOLD used on Seasons/Franchise/Leagues.
function valuedSquadSize(roster) {
  return (roster || []).filter((r) => r.market_value_eur != null && !r.played_youth_level).length;
}

// This is a single-entity drill-down view -- there's nothing to "filter
// out" here, so an incomplete roster is flagged with a banner instead of
// hidden, unlike the list pages (Seasons/Franchise/Leagues) where the shared
// hide-sparse setting can drop the row entirely. Prefers the precomputed
// roster_complete flag; falls back to the size rule for older artifacts.
function sparseSquadBannerHTML(seasonData) {
  const roster = seasonData.roster;
  const size = valuedSquadSize(roster);
  const complete = seasonData.roster_complete != null
    ? seasonData.roster_complete
    : size >= SeasonTable.SPARSE_SQUAD_THRESHOLD;
  if (complete) return "";
  return `<p class="muted sparse-banner">⚠ Incomplete season — only ${size} player${size === 1 ? " has" : "s have"} a recorded value here, ` +
    `well short of a full senior squad (~20–27 in this data). The source's roster coverage is sparse for many clubs/seasons, ` +
    `especially pre-2012 and outside the top leagues, so this season's squad value is understated and it's excluded from ` +
    `league and aggregate views by default.</p>`;
}

function renderHeaderStrip(payload, season, isLatest, seasonData) {
  const lg = seasonData && seasonData.league;
  let leagueLine;
  if (lg && lg.status === "top_flight" && lg.competition_id) {
    const name = prettifyLeagueName(lg.name);
    leagueLine =
      `${logoImgHTML(competitionLogoUrl(lg.competition_id), name, { size: "xs" })}` +
      `<a href="league-year.html?league=${lg.competition_id}&year=${season}" title="See the ${name} ${seasonLabel(season)} season">${name || lg.competition_id}</a> (${lg.competition_id})`;
  } else if (lg && lg.status === "lower" && lg.name) {
    leagueLine = `${lg.name}${lg.tier ? ` (tier ${lg.tier})` : ""} — match data not covered by the dataset`;
  } else if (lg && lg.status === "lower") {
    leagueLine = `Below the top flight this season (lower leagues aren't covered by the dataset)`;
  } else {
    const name = prettifyLeagueName(payload.competition_name);
    leagueLine =
      `${payload.competition_id ? logoImgHTML(competitionLogoUrl(payload.competition_id), name, { size: "xs" }) : ""}` +
      `${name || ""}`;
  }
  const movementTag = seasonData.promoted
    ? `<span class="move-tag promoted" title="Newly promoted into the top flight this season">▲ Promoted</span>`
    : seasonData.relegated
    ? `<span class="move-tag relegated" title="Relegated out of the top flight at the end of this season">▼ Relegated</span>`
    : "";
  return `
    <section class="panel team-header-strip">
      ${logoImgHTML(payload.crest_url, `${payload.name} crest`, { size: "lg" })}
      <div>
        <h2 class="team-header-name"><a href="franchise.html?club=${payload.club_id}" class="title-link" title="See ${payload.name}'s full franchise history">${payload.name}</a></h2>
        <div class="muted">
          ${leagueLine} ${payload.country_name ? "· " + payload.country_name : ""} ${movementTag}
        </div>
        <div class="allstar-links">
          <a class="allstar-link" href="allstar.html?club=${payload.club_id}"><span class="st">★</span> <span>All-Star squad<br><span class="d">${payload.name}'s best 26 by value, all-time</span></span></a>
        </div>
      </div>
      <div class="team-header-season">
        <div class="kpi-label">${isLatest ? "Latest available season" : "Season"}</div>
        <div class="kpi-value">${seasonLabel(season)}${leagueSuffix(seasonData)}</div>
      </div>
    </section>
    ${sparseSquadBannerHTML(seasonData)}
  `;
}

// The dataset has no loan-terms field at all (no option/obligation-to-buy
// flag) -- the only "term" it can ever support is a fee tied to that
// specific transfer row, when one was recorded. Surfaced when present,
// never invented when absent.
function renderRosterTable(roster, playersProfile, season, moves) {
  if (!roster || !roster.length) return `<p class="muted">No roster data for this season.</p>`;
  const rows = [...roster].sort((a, b) => (potentialField(b, "") || 0) - (potentialField(a, "") || 0));
  // Confirmed loan-ins this season -- only loans we've actually seen resolve
  // (the player later returns) get labelled "loan" at all, so this is a
  // reliable-but-incomplete signal: a loan that started very recently and
  // hasn't resolved yet won't be caught here (see renderOutOnLoanList).
  const loanInByPlayer = new Map(
    (moves || []).filter((m) => m.direction === "in" && m.type === "loan").map((m) => [m.player_id, m])
  );
  return `
    <div class="table-scroll">
    <table>
      <thead><tr>
        <th>Player</th><th>Pos</th><th>Nat.</th><th>Age</th>
        <th>Value</th><th title="Highest value from this point forward">Future peak</th><th title="Highest value at any point in the player's career">All-time peak</th><th>Apps</th><th>G</th><th>A</th><th>Mins</th><th>Cards</th>
      </tr></thead>
      <tbody>
        ${rows.map((r) => {
          const p = playersProfile[String(r.player_id)] || {};
          const noValuation = r.played_youth_level && r.market_value_eur == null;
          const youthBadge = r.played_youth_level
            ? `<span class="status-badge status-youth" title="${noValuation
                ? "Played at reserve/youth level this season; no market valuation on record, which usually means not yet on a tracked pro contract."
                : "Also featured at reserve/youth level this season."}">U-level${noValuation ? " · unvalued" : ""}</span>`
            : "";
          const loanIn = loanInByPlayer.get(r.player_id);
          const loanBadge = loanIn ? `<span class="status-badge status-loan" title="${loanTermsTooltip(loanIn, season)}">On loan from ${loanIn.from_club_name || "elsewhere"}${loanFeeSuffix(loanIn, season)}</span>` : "";
          const midSeasonBadge = r.mid_season_note ? (() => {
            const n = r.mid_season_note;
            const arrived = n.direction === "arrived";
            const label = arrived
              ? `Joined from ${n.other_club_name || "elsewhere"} mid-season`
              : `Left for ${n.other_club_name || "elsewhere"} mid-season`;
            const tip = `${arrived ? "Arrived" : "Departed"} around ${n.date} -- this season is split between two ` +
              `clubs (most commonly a January transfer/loan window move), not a full season at just this one.`;
            return `<span class="status-badge status-move-${arrived ? "in" : "out"}" title="${tip}">${label}</span>`;
          })() : "";
          return `<tr>
            <td>${playerImgHTML(p.image_url, p.name)}<a href="player.html?player=${r.player_id}">${p.name || r.player_id}</a> ${youthBadge} ${loanBadge} ${midSeasonBadge}</td>
            <td>${p.sub_position || p.position || "—"}</td>
            <td>${p.nationality || "—"}</td>
            <td>${r.age_at_season_start ?? "—"}</td>
            <td>${approxValueHTML(r, Money.fmtMoney(r.market_value_eur, { year: season }))}</td>
            <td>${approxValueHTML(r, Money.fmtMoney(r.future_peak_value_eur, { year: season }))}</td>
            <td>${approxValueHTML(r, Money.fmtMoney(r.alltime_peak_value_eur, { year: season }))}</td>
            <td>${r.appearances ?? "—"}</td>
            <td>${r.goals ?? "—"}</td>
            <td>${r.assists ?? "—"}</td>
            <td>${r.minutes_played ?? "—"}</td>
            <td class="num">${r.yellow_cards ?? 0}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
}

// "Badge only, no value shift": a player out on loan still counts toward
// the loanee club's roster/value in the source data (that doesn't change
// here) -- this just makes it visible, on the OWNING club's own page, that
// they still hold this player's registration. Only covers loans we've
// confirmed resolved (the player returned); a loan still in progress as of
// the latest season can't be told apart from a permanent departure yet.
function renderOutOnLoanList(moves, season) {
  const loansOut = (moves || []).filter((m) => m.direction === "out" && m.type === "loan");
  if (!loansOut.length) return "";
  return `
    <div class="muted" style="margin-top:10px;font-size:0.85rem;">
      <strong>Also out on loan this season</strong> (still owned by this club at the time; value not counted in this squad's totals) —
      ${loansOut.map((m) => {
        const club = m.to_club_id != null
          ? `<a href="teams.html?club=${m.to_club_id}&year=${season}" target="_blank" rel="noopener">${m.to_club_name || "unknown club"}</a>`
          : (m.to_club_name || "unknown club");
        return `<span title="${loanTermsTooltip({ ...m, from_club_name: m.to_club_name }, season)}"><a href="player.html?player=${m.player_id}">${m.player_name || m.player_id}</a> (at ${club}${loanFeeSuffix(m, season)}, now worth ${Money.fmtMoney(m.value_now_eur)})</span>`;
      }).join(", ")}
    </div>
  `;
}

function renderPerformance(perf) {
  if (!perf || (!perf.domestic_league && !perf.other_competitions.length)) {
    return `<p class="muted">No match data for this season.</p>`;
  }
  let html = "";
  if (perf.domestic_league) {
    const d = perf.domestic_league;
    html += `
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">${prettifyLeagueName(d.competition_name)}</div><div class="kpi-value">${d.final_position != null ? "#" + d.final_position : "—"}</div></div>
        <div class="kpi"><div class="kpi-label">Record</div><div class="kpi-value">${d.wins}W ${d.draws}D ${d.losses}L</div></div>
        <div class="kpi"><div class="kpi-label">Goals</div><div class="kpi-value">${d.goals_for}–${d.goals_against}</div></div>
        <div class="kpi"><div class="kpi-label">Matches</div><div class="kpi-value">${d.matches_played}</div></div>
      </div>`;
  }
  if (perf.other_competitions && perf.other_competitions.length) {
    html += `
      <div class="table-scroll">
      <table>
        <thead><tr><th>Competition</th><th>Played</th><th>W</th><th>D</th><th>L</th><th>Goals</th></tr></thead>
        <tbody>
          ${perf.other_competitions.map((c) => `<tr>
            <td>${prettifyLeagueName(c.competition_name)}</td><td>${c.matches_played}</td><td>${c.wins}</td><td>${c.draws}</td><td>${c.losses}</td>
            <td>${c.goals_for}–${c.goals_against}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      </div>`;
  }
  return html;
}

function sortMoves(moves, scoreKey) {
  // One row per player per panel -- a loan out and its return would otherwise
  // fill the top-8 with the same name several times.
  const sorted = [...(moves || [])].sort((a, b) => (b[scoreKey] || 0) - (a[scoreKey] || 0));
  const seen = new Set();
  const out = [];
  for (const m of sorted) {
    if (seen.has(m.player_id)) continue;
    seen.add(m.player_id);
    out.push(m);
    if (out.length === 8) break;
  }
  return out;
}

// valueMode "peak": the Value column shows the player's eventual peak value
// from the move onward (future_peak_value_eur) -- what they ENDED UP being
// worth -- instead of the fee/value at the time. Used by the hindsight panel.
function renderMovesTable(moves, season, valueMode) {
  if (!moves.length) {
    return `<p class="muted">No transfer moves recorded for this season — the source dataset's
      transfer records are sparse for many clubs, and the most recent window often lags.</p>`;
  }
  const valueHeader = valueMode === "peak" ? "Peak value since" : "Value";
  return `
    <div class="table-scroll">
    <table>
      <thead><tr><th>Move</th><th>Player</th><th class="num" title="Age at the time of the move (as of the transfer year)">Age</th><th>Club</th><th>Type</th><th>${valueHeader}</th></tr></thead>
      <tbody>
        ${moves.map((m) => {
          const counterpartId = m.direction === "in" ? m.from_club_id : m.to_club_id;
          const knownStatusFallback = { retired: "Retired", without_club: "No club", career_break: "Career break" }[m.type];
          const counterpartName = m.direction === "in"
            ? (m.from_club_name || "Unknown / untracked")
            : (m.to_club_name || knownStatusFallback || "Unknown / untracked");
          const counterpartLink = counterpartId != null
            ? `<a href="teams.html?club=${counterpartId}" target="_blank" rel="noopener">${counterpartName}</a>`
            : counterpartName;
          const counterpartCell = m.direction === "in" ? `from ${counterpartLink}` : `to ${counterpartLink}`;
          const moveBadge = m.direction === "in"
            ? `<span class="status-badge status-move-in">Arrived</span>`
            : `<span class="status-badge status-move-out">Departed</span>`;
          const age = moveAge(m, season);
          return `<tr>
          <td>${moveBadge}</td>
          <td><a href="player.html?player=${m.player_id}">${m.player_name || m.player_id}</a></td>
          <td class="num">${age != null ? age : "—"}</td>
          <td class="muted">${counterpartCell}</td>
          <td>${moveSourceTooltip(m) ? `<span title="${moveSourceTooltip(m)}">${moveTypeLabel(m)}</span>` : moveTypeLabel(m)}</td>
          <td>${valueMode === "peak"
            ? `<span title="Their value at the time was ${Money.fmtMoney(m.value_at_transfer_eur, { year: season })}${m.transfer_fee_eur ? `; the fee was ${Money.fmtMoney(m.transfer_fee_eur, { year: season })}` : ""}.">${Money.fmtMoney(m.future_peak_value_eur)}</span>`
            : Money.fmtMoney(m.transfer_fee_eur || m.value_at_transfer_eur, { year: season })}</td>
        </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Squad time-travel
// ---------------------------------------------------------------------------

function squadValueAtYear(roster, targetSeason, anchorClubId) {
  let total = 0;
  let trackedCount = 0;
  const statuses = roster.map((p) => {
    const entry = (playerValues[String(p.player_id)] || {})[String(targetSeason)];
    if (!entry || entry.value_eur == null) return { player: p, status: "untracked", value: null, club_id: null };
    total += entry.value_eur;
    trackedCount += 1;
    // entry.status ("retired"/"without_club"/"career_break") is the
    // dataset's own explicit label for why club_id is null -- distinct from
    // genuinely not knowing (that's the "untracked" branch above).
    let status;
    if (entry.club_id != null) {
      status = String(entry.club_id) === String(anchorClubId) ? "same_team" : "different_team";
    } else if (entry.status) {
      status = entry.status;
    } else {
      status = "different_team";
    }
    return { player: p, value: entry.value_eur, status, club_id: entry.club_id };
  });
  return { total, trackedCount, statuses };
}

const TIME_TRAVEL_STATUS_LABELS = {
  same_team: "Still here",
  different_team: "Moved on",
  retired: "Retired",
  without_club: "No club",
  career_break: "Career break",
  untracked: "Untracked",
};

function renderTimeTravel(roster, payload, anchorSeason) {
  const seasonsSet = new Set([anchorSeason]);
  roster.forEach((p) => {
    Object.keys(playerValues[String(p.player_id)] || {}).forEach((s) => seasonsSet.add(Number(s)));
  });
  const seasons = [...seasonsSet].sort((a, b) => a - b);

  const controlsEl = document.getElementById("timeTravelControls");
  const defaultTarget = seasons.find((s) => s >= anchorSeason + 5) || seasons[seasons.length - 1];
  controlsEl.innerHTML = `
    <div class="picker-field">
      <label for="timeTravelYear">Jump to year</label>
      <select id="timeTravelYear">
        ${seasons.map((s) => `<option value="${s}"${s === defaultTarget ? " selected" : ""}>${seasonLabel(s)}</option>`).join("")}
      </select>
    </div>
  `;

  function renderAtYear(targetSeason) {
    const { total, statuses } = squadValueAtYear(roster, targetSeason, payload.club_id);
    document.getElementById("timeTravelTable").innerHTML = `
      <p><strong>${seasonLabel(targetSeason)} combined value: ${Money.fmtMoney(total, { year: targetSeason })}</strong></p>
      <div class="table-scroll">
      <table>
        <thead><tr><th>Player</th><th>Status</th><th>Club</th><th>Value that year</th></tr></thead>
        <tbody>
          ${statuses.map((s) => {
            const profile = payload.players[String(s.player.player_id)] || {};
            const clubName = s.club_id != null ? (clubsById[String(s.club_id)] ? clubsById[String(s.club_id)].name : `Club #${s.club_id}`) : "—";
            const clubCell = s.club_id != null
              ? `<a href="teams.html?club=${s.club_id}&year=${targetSeason}" target="_blank" rel="noopener">${clubName}</a>`
              : clubName;
            const statusLabel = TIME_TRAVEL_STATUS_LABELS[s.status] || "Untracked";
            return `<tr>
              <td>${playerImgHTML(profile.image_url, profile.name)}<a href="player.html?player=${s.player.player_id}">${profile.name || s.player.player_id}</a></td>
              <td><span class="status-badge status-${s.status}">${statusLabel}</span></td>
              <td>${clubCell}</td>
              <td>${s.value != null ? Money.fmtMoney(s.value, { year: targetSeason }) : "—"}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
      </div>
    `;
    makeTablesSortable(document.getElementById("timeTravelTable"));
  }

  const labels = seasons.map(seasonLabel);
  // Convert per-point so the curve itself responds to currency/inflation
  // settings, not just the labels.
  const totals = seasons.map((s) =>
    Money.convertEur(squadValueAtYear(roster, s, payload.club_id).total, { year: s })
  );

  // Promotion/relegation marks for the anchor club along this timeline.
  const seasonsInfo = seasons.map((s) => {
    const lg = payload.seasons[String(s)] && payload.seasons[String(s)].league;
    return {
      season: s,
      status: lg ? lg.status : "unknown",
      tier: lg ? lg.tier : null,
      label: lg ? (lg.status === "top_flight" ? lg.competition_id : lg.name) : null,
    };
  });
  const markers = leagueTransitionMarkers(seasonsInfo, "#22c55e");
  document.getElementById("timeTravelNote").innerHTML = transitionNoteHTML(markers.transitions);

  if (timeTravelChart) timeTravelChart.destroy();
  timeTravelChart = new Chart(document.getElementById("timeTravelChart"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "This squad's combined value",
        data: seasons.map((s, i) => ({ x: labels[i], y: totals[i], season: s })),
        parsing: { yAxisKey: "y" },
        borderColor: "#22c55e",
        backgroundColor: "rgba(34,197,94,0.10)",
        tension: 0.25,
        fill: true,
        pointStyle: markers.pointStyle,
        pointRadius: markers.pointRadius,
        pointRotation: markers.pointRotation,
        pointBackgroundColor: markers.pointBackgroundColor,
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
            label: (ctx) => Money.fmtConverted(ctx.parsed.y),
            afterLabel: (ctx) => markers.transitions[ctx.dataIndex] || "",
          },
        },
      },
    },
  });

  document.getElementById("timeTravelYear").addEventListener("change", (e) => renderAtYear(Number(e.target.value)));
  renderAtYear(defaultTarget);
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("teamDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load Teams page data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p></section>`;
  });
});
