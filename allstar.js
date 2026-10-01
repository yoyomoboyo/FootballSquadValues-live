// All-Star Squad page — scope-aware. A best-26 (or Starting XI) by transfer
// value, split by position in the national-team shape, at four scopes:
//   team          — one club, all years (computed client-side from
//                    teams/{id}.json + player_values.json)
//   league        — one top-flight league, all years (allstar/leagues/{id}.json)
//   league-season — one league, one season (same file, seasons[year])
//   nation        — one national team, all years (nations/{slug}.json all_star)
// Nation-Season is the existing nation-season.html squad, so it's not here.
//
// Every scope produces the same unified candidate shape, so one selector
// (AS.select26 / AS.selectXI) and one renderer serve them all. Each candidate
// carries its peak value IN SCOPE (+year/club) and its all-time peak at any
// club, and the "Rank by" toggle chooses which drives selection.

const AS = (() => {
  const POS_BUCKET = { Goalkeeper: "GK", Defender: "DEF", Midfield: "MID", Attack: "ATT" };
  const GROUPS = [
    { key: "GK", label: "Goalkeepers" }, { key: "DEF", label: "Defenders" },
    { key: "MID", label: "Midfielders" }, { key: "ATT", label: "Attackers" },
    { key: "other", label: "Other" },
  ];
  const QUOTAS = [["GK", 3], ["DEF", 7], ["MID", 7], ["ATT", 6]];
  const SQUAD_SIZE = 26;

  function select26(cands, key) {
    const byPos = {};
    cands.forEach((c) => (byPos[c.pos] = byPos[c.pos] || []).push(c));
    Object.values(byPos).forEach((a) => a.sort((x, y) => y[key] - x[key]));
    const picked = [], used = new Set();
    for (const [pos, q] of QUOTAS) {
      (byPos[pos] || []).slice(0, q).forEach((c) => { picked.push(c); used.add(c.player_id); });
    }
    cands.filter((c) => !used.has(c.player_id)).sort((x, y) => y[key] - x[key])
      .forEach((c) => { if (picked.length < SQUAD_SIZE) { picked.push(c); used.add(c.player_id); } });
    return picked;
  }

  function selectXI(cands, key) {
    const by = { GK: [], DEF: [], MID: [], ATT: [] };
    cands.forEach((c) => { if (by[c.pos]) by[c.pos].push(c); });
    Object.values(by).forEach((a) => a.sort((x, y) => y[key] - x[key]));
    const pick = [], used = new Set();
    let att = 0;
    const take = (c) => { pick.push(c); used.add(c.player_id); if (c.pos === "ATT") att++; };
    if (by.GK[0]) take(by.GK[0]);
    by.DEF.slice(0, 3).forEach(take);
    by.MID.slice(0, 3).forEach(take);
    [...by.DEF.slice(3), ...by.MID.slice(3), ...by.ATT]
      .filter((c) => !used.has(c.player_id))
      .sort((x, y) => y[key] - x[key])
      .forEach((c) => {
        if (pick.length >= 11) return;
        if (c.pos === "ATT" && att >= 4) return;
        take(c);
      });
    return pick;
  }

  return { POS_BUCKET, GROUPS, select26, selectXI };
})();

let clubsById = {};
let competitions = [];
let nationsIndex = [];
let playerValues = null;
const state = { scope: "team", club: null, league: null, nation: null, season: null, fmt: "26", rank: "scope" };
let cands = [];   // unified candidate list for the current selection
let ctx = null;   // { title, subtitle, showClub, showRank, valueLabel, crest }

async function init() {
  await Money.init();
  const [clubs, comps, nidx] = await Promise.all([
    Money.loadJSON("data/clubs.json"),
    Money.loadJSON("data/competitions.json"),
    Money.loadJSON("data/nations_index.json").catch(() => []),
  ]);
  clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));
  competitions = comps.filter((c) => c.type === "domestic_league" && (c.tier == null || Number(c.tier) === 1))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  nationsIndex = nidx;

  readParams();
  buildControls();
  await loadSelection();

  window.addEventListener("moneysettingschange", () => { if (cands.length) renderSquad(); });
}

function readParams() {
  const p = new URLSearchParams(location.search);
  state.scope = p.get("scope") || (p.get("nation") ? "nation" : (p.get("league") ? (p.get("year") ? "league-season" : "league") : "team"));
  state.club = p.get("club");
  state.league = p.get("league");
  state.nation = p.get("nation");
  state.season = p.get("year");
  if (p.get("fmt")) state.fmt = p.get("fmt");
}

function syncUrl() {
  const p = new URLSearchParams({ scope: state.scope });
  if (state.scope === "team" && state.club) p.set("club", state.club);
  if (state.scope.startsWith("league") && state.league) p.set("league", state.league);
  if (state.scope === "league-season" && state.season) p.set("year", state.season);
  if (state.scope === "nation" && state.nation) p.set("nation", state.nation);
  p.set("fmt", state.fmt);
  history.replaceState(null, "", `${location.pathname}?${p}`);
}

// ---- controls ----
function buildControls() {
  const scopes = [
    ["team", "Team"], ["league", "League"], ["league-season", "League-Season"], ["nation", "Nation"],
  ];
  document.getElementById("scopeSeg").innerHTML = scopes.map(([v, l]) =>
    `<button type="button" data-scope="${v}"${state.scope === v ? ' class="on"' : ""}>${l}</button>`).join("");
  document.getElementById("scopeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.scope = b.dataset.scope;
    Array.from(e.currentTarget.children).forEach((c) => c.classList.toggle("on", c === b));
    buildTargetControls();
    loadSelection();
  });
  buildTargetControls();
}

function buildTargetControls() {
  const el = document.getElementById("targetControls");
  if (state.scope === "team") {
    el.innerHTML = `
      <div class="picker-field picker-search">
        <label for="teamSearch">Team</label>
        <input id="teamSearch" list="clubList" placeholder="Search a club…" autocomplete="off">
        <datalist id="clubList">${Object.values(clubsById).sort((a, b) => (a.name || "").localeCompare(b.name || ""))
          .map((c) => `<option value="${(c.name || "").replace(/"/g, "&quot;")}">`).join("")}</datalist>
      </div>`;
    const input = document.getElementById("teamSearch");
    if (state.club && clubsById[state.club]) input.value = clubsById[state.club].name;
    input.addEventListener("change", () => {
      const match = Object.values(clubsById).find((c) => (c.name || "").toLowerCase() === input.value.trim().toLowerCase());
      if (match) { state.club = String(match.club_id); loadSelection(); }
    });
  } else if (state.scope === "nation") {
    el.innerHTML = `
      <div class="picker-field">
        <label for="nationSel">Nation</label>
        <select id="nationSel"><option value="">Choose a nation…</option>${[...nationsIndex]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((n) => `<option value="${n.slug}"${state.nation === n.slug ? " selected" : ""}>${n.name}</option>`).join("")}</select>
      </div>`;
    document.getElementById("nationSel").addEventListener("change", (e) => { state.nation = e.target.value; loadSelection(); });
  } else {
    // league or league-season
    const leagueOpts = competitions.map((c) =>
      `<option value="${c.competition_id}"${state.league === c.competition_id ? " selected" : ""}>${prettifyLeagueName(c.name)}${c.country_name ? " (" + c.country_name + ")" : ""}</option>`).join("");
    el.innerHTML = `
      <div class="picker-field">
        <label for="leagueSel">League</label>
        <select id="leagueSel"><option value="">Choose a league…</option>${leagueOpts}</select>
      </div>
      ${state.scope === "league-season" ? `
      <div class="picker-field">
        <label for="seasonSel">Season</label>
        <select id="seasonSel"><option value="">Choose a season…</option></select>
      </div>` : ""}`;
    document.getElementById("leagueSel").addEventListener("change", (e) => {
      state.league = e.target.value; state.season = null; loadSelection();
    });
    const ss = document.getElementById("seasonSel");
    if (ss) ss.addEventListener("change", (e) => { state.season = e.target.value; loadSelection(); });
  }
}

// ---- data loading per scope ----
async function loadSelection() {
  const el = document.getElementById("allstarDetail");
  const ready = (state.scope === "team" && state.club) ||
    (state.scope === "league" && state.league) ||
    (state.scope === "league-season" && state.league) ||
    (state.scope === "nation" && state.nation);
  if (!ready) {
    el.innerHTML = `<section class="panel"><p class="muted">Choose a ${scopeNoun()} above to build its All-Star squad.</p></section>`;
    return;
  }
  el.innerHTML = `<section class="panel"><p class="muted">Building the All-Star squad…</p></section>`;
  try {
    if (state.scope === "team") await loadTeam();
    else if (state.scope === "nation") await loadNation();
    else await loadLeague();
  } catch (err) {
    console.error(err);
    el.innerHTML = `<section class="panel"><p class="error-text">Couldn't build this All-Star squad (${err.message}).</p></section>`;
    return;
  }
  syncUrl();
  buildStructure();
  renderSquad();
}

function scopeNoun() {
  return { team: "team", league: "league", "league-season": "league and season", nation: "nation" }[state.scope];
}

async function loadTeam() {
  const [team, pv] = await Promise.all([
    Money.loadJSON(`data/teams/${state.club}.json`),
    playerValues ? Promise.resolve(playerValues) : Money.loadJSON("data/player_values.json"),
  ]);
  playerValues = pv;
  const club = Number(state.club);
  cands = (team.alltime_players || []).map((ap) => {
    const yrs = playerValues[String(ap.player_id)] || {};
    let vs = 0, ys = null, ve = 0, ye = null, ceid = null;
    for (const y in yrs) {
      const v = yrs[y].value_eur;
      if (v == null) continue;
      if (v > ve) { ve = v; ye = Number(y); ceid = yrs[y].club_id; }
      if (yrs[y].club_id === club && v > vs) { vs = v; ys = Number(y); }
    }
    if (!vs) { vs = ap.alltime_value_at_club_eur || 0; ys = ap.last_season; }
    if (!ve) { ve = vs; ye = ys; ceid = club; }
    const meta = (team.players || {})[String(ap.player_id)] || {};
    return {
      player_id: ap.player_id, name: ap.name,
      pos: AS.POS_BUCKET[ap.position] || "other", sub: ap.sub_position || ap.position || "—",
      country: ap.nationality || "—", dob: meta.date_of_birth || null,
      val_scope: vs, year_scope: ys, club_scope: team.name, club_scope_id: club,
      val_ever: ve, year_ever: ye, club_ever: clubName(ceid),
    };
  }).filter((c) => c.val_scope > 0);
  ctx = { title: `${team.name} — All-Star squad`, crest: team.crest_url,
    subtitle: "Best by transfer value across the club's whole history",
    showClub: false, showRank: true, valueLabel: "Value at club" };
}

async function loadLeague() {
  const payload = await Money.loadJSON(`data/allstar/leagues/${state.league}.json`);
  const name = prettifyLeagueName(payload.name || state.league);
  if (state.scope === "league-season") {
    const seasons = Object.keys(payload.seasons).map(Number).sort((a, b) => b - a);
    if (!state.season || !seasons.includes(Number(state.season))) state.season = String(seasons[0]);
    const ss = document.getElementById("seasonSel");
    if (ss && ss.dataset.forLeague !== state.league) {
      ss.innerHTML = `<option value="">Choose a season…</option>` +
        seasons.map((s) => `<option value="${s}">${seasonLabel(s)}</option>`).join("");
      ss.dataset.forLeague = state.league;
    }
    if (ss) ss.value = state.season;
    cands = (payload.seasons[state.season] || []).slice();
    ctx = { title: `${name} — All-Star XI`, crest: null,
      subtitle: `Best by value in ${name}, ${seasonLabel(Number(state.season))}`,
      showClub: true, showRank: false, valueLabel: "Value" };
  } else {
    cands = (payload.all_time || []).slice();
    ctx = { title: `${name} — All-Star squad`, crest: null,
      subtitle: `Best by transfer value across every ${name} club, all-time`,
      showClub: true, showRank: true, valueLabel: "Value in league" };
  }
}

async function loadNation() {
  const payload = await Money.loadJSON(`data/nations/${state.nation}.json`);
  cands = (payload.all_star_all_time || []).slice();
  ctx = { title: `${payload.name} — All-Star squad`, crest: payload.badge_url,
    subtitle: `${payload.name}'s best citizens ever, by transfer value`,
    showClub: true, showRank: false, valueLabel: "Peak value" };
}

function clubName(cid) {
  if (cid == null) return null;
  const c = clubsById[String(cid)];
  return c ? c.name : null;
}

// ---- render ----
function buildStructure() {
  const crest = ctx.crest ? logoImgHTML(ctx.crest, "", { size: "lg" }) : "";
  const rankToggle = ctx.showRank ? `
    <div>
      <div class="muted" style="font-size:0.72rem;margin-bottom:4px">Rank by</div>
      <div class="seg-toggle" id="asRank">
        <button type="button" class="${state.rank === "scope" ? "on" : ""}" data-r="scope">Peak in scope</button>
        <button type="button" class="${state.rank === "ever" ? "on" : ""}" data-r="ever">All-time peak (any club)</button>
      </div>
    </div>` : "";
  document.getElementById("allstarDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${crest}
      <div>
        <h2 class="team-header-name">${ctx.title}</h2>
        <div class="muted">${ctx.subtitle}</div>
      </div>
      <div class="team-header-season">
        <div class="kpi-label">Combined value</div>
        <div class="kpi-value" id="asKpi">—</div>
        <div class="muted" id="asKpiNote" style="font-size:0.72rem;"></div>
      </div>
    </section>

    <section class="panel">
      <div class="allstar-toolbar">
        <div>
          <div class="muted" style="font-size:0.72rem;margin-bottom:4px">Roster</div>
          <div class="seg-toggle" id="asFmt">
            <button type="button" class="${state.fmt === "26" ? "on" : ""}" data-f="26">26-man squad</button>
            <button type="button" class="${state.fmt === "xi" ? "on" : ""}" data-f="xi">Starting XI</button>
          </div>
        </div>
        ${rankToggle}
        <div class="muted allstar-note" id="asNote"></div>
      </div>
      <div class="table-scroll bref-table-wrap">
        <table class="bref-table" id="asTable">
          <thead><tr>
            <th>Player</th>
            <th class="num" title="Season this value/age is from">Year</th>
            <th class="num">Age</th>
            <th>Country</th>
            <th>Pos</th>
            ${ctx.showClub ? "<th>Club</th>" : ""}
            <th class="num">${ctx.valueLabel}</th>
            <th class="num" title="The player's highest value at any club, ever">Top-ever</th>
            <th class="num" title="Growth from in-scope value to all-time peak">Δ%</th>
          </tr></thead>
          <tbody id="asTbody"></tbody>
        </table>
      </div>
    </section>
  `;
  document.getElementById("asFmt").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.fmt = b.dataset.f; toggleSeg("asFmt", b); syncUrl(); renderSquad();
  });
  const rankEl = document.getElementById("asRank");
  if (rankEl) rankEl.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    state.rank = b.dataset.r; toggleSeg("asRank", b); renderSquad();
  });
}

function toggleSeg(id, btn) {
  Array.from(document.getElementById(id).children).forEach((c) => c.classList.toggle("on", c === btn));
}

function renderSquad() {
  const key = (ctx.showRank && state.rank === "ever") ? "val_ever" : "val_scope";
  const squad = state.fmt === "xi" ? AS.selectXI(cands, key) : AS.select26(cands, key);
  const total = squad.reduce((s, c) => s + (c[key] || 0), 0);
  document.getElementById("asKpi").textContent = Money.fmtMoney(total);
  document.getElementById("asKpiNote").textContent =
    `${squad.length} players · ${state.fmt === "xi" ? "Starting XI" : "26-man squad"}`;
  document.getElementById("asNote").innerHTML = state.fmt === "xi"
    ? "<strong>Starting XI</strong>: 1 GK · min 3 DEF · min 3 MID · max 4 ATT, filled by value."
    : "<strong>26-man</strong> in the national-team shape (3·7·7·6, then best of the rest).";

  const byPos = {};
  squad.forEach((c) => (byPos[c.pos] = byPos[c.pos] || []).push(c));
  const cols = ctx.showClub ? 9 : 8;
  let html = "";
  for (const g of AS.GROUPS) {
    const rows = (byPos[g.key] || []).sort((a, b) => b[key] - a[key]);
    if (!rows.length) continue;
    html += `<tr class="pos-group-row"><td colspan="${cols}">${g.label} (${rows.length})</td></tr>`;
    html += rows.map((c) => rowHTML(c)).join("");
  }
  document.getElementById("asTbody").innerHTML = html;
}

function rowHTML(c) {
  const useEver = ctx.showRank && state.rank === "ever";
  const year = useEver ? c.year_ever : c.year_scope;
  const age = typeof ageInSeason === "function" ? ageInSeason(c.dob, year) : null;
  const pct = c.val_scope ? Math.round((c.val_ever - c.val_scope) / c.val_scope * 100) : 0;
  const clubCell = ctx.showClub
    ? `<td>${c.club_scope_id != null ? `<a href="franchise.html?club=${c.club_scope_id}">${c.club_scope || "—"}</a>` : (c.club_scope || "—")}</td>`
    : "";
  return `<tr>
    <td><a href="player.html?player=${c.player_id}">${c.name || "Player #" + c.player_id}</a></td>
    <td class="num muted">${year != null ? seasonLabel(year) : "—"}</td>
    <td class="num">${age != null ? age : "—"}</td>
    <td>${c.country || "—"}</td>
    <td>${c.sub || "—"}</td>
    ${clubCell}
    <td class="num">${Money.fmtMoney(c.val_scope, { year: c.year_scope })}</td>
    <td class="num">${Money.fmtMoney(c.val_ever, { year: c.year_ever })}</td>
    <td class="num" style="color:${c.val_ever > c.val_scope + 1 ? "var(--accent)" : "var(--muted)"}">${pct > 0 ? "+" : ""}${pct}%</td>
  </tr>`;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("allstarDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load All-Star data (${err.message}).</p></section>`;
  });
});
