// Nation Season page: one country's citizen pool as a national-team squad for a
// single season. The whole-history / value-over-time view lives on the Nation
// Franchise page (nations.html); this page is the per-season squad breakdown,
// mirroring the club-side Team Season page. Data: nations/{slug}.json +
// nations_index.json, precomputed offline.

let nationsIndex = [];
let clubsById = {};
let currentNation = null; // nations/{slug}.json
let currentSlug = null;
let currentSeason = null;

const POS_ORDER = [
  { key: "GK", label: "Goalkeepers" },
  { key: "DEF", label: "Defenders" },
  { key: "MID", label: "Midfielders" },
  { key: "ATT", label: "Attackers" },
  { key: "other", label: "Other" },
];

async function init() {
  await Money.init();
  const [index, clubs] = await Promise.all([
    Money.loadJSON("data/nations_index.json"),
    Money.loadJSON("data/clubs.json"),
  ]);
  nationsIndex = index;
  clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));

  populateNationOptions();
  wireControls();

  const params = new URLSearchParams(location.search);
  const nation = params.get("nation");
  const mode = params.get("mode");
  if (mode) document.getElementById("nationModeSelect").value = mode;
  if (nation) {
    await pickNation(nation, params.get("year") != null ? Number(params.get("year")) : null);
  } else {
    renderPrompt();
  }

  window.addEventListener("moneysettingschange", () => {
    if (currentNation) renderDynamic();
  });
}

function currentMode() {
  return document.getElementById("nationModeSelect").value || "top26_value";
}

function populateNationOptions() {
  const sorted = [...nationsIndex].sort((a, b) => (b.current_value || 0) - (a.current_value || 0));
  const sel = document.getElementById("nationSelect");
  sel.innerHTML =
    `<option value="">Choose a nation…</option>` +
    sorted.map((n) => `<option value="${n.slug}">${n.name}${n.fifa_ranking ? ` — FIFA #${n.fifa_ranking}` : ""}</option>`).join("");
  sel.value = currentSlug || "";

  const list = document.getElementById("nationSearchList");
  if (list) {
    list.innerHTML = [...nationsIndex]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((n) => `<option value="${n.name.replace(/"/g, "&quot;")}"></option>`).join("");
  }
}

function nationSlugFromSearch(text) {
  const q = (text || "").trim().toLowerCase();
  if (!q) return null;
  const exact = nationsIndex.find((n) => n.name.toLowerCase() === q);
  if (exact) return exact.slug;
  const starts = nationsIndex.find((n) => n.name.toLowerCase().startsWith(q));
  return starts ? starts.slug : null;
}

function wireControls() {
  const search = document.getElementById("nationSearch");
  if (search) {
    const go = () => {
      const slug = nationSlugFromSearch(search.value);
      if (slug) { pickNation(slug, null); search.value = ""; search.blur(); }
    };
    search.addEventListener("change", go);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }
  document.getElementById("nationSelect").addEventListener("change", (e) => {
    if (e.target.value) pickNation(e.target.value, null);
  });
  document.getElementById("nationModeSelect").addEventListener("change", () => {
    if (currentNation) { syncUrl(); renderDynamic(); }
  });
  document.getElementById("nationYearSelect").addEventListener("change", (e) => {
    if (e.target.value !== "") { currentSeason = Number(e.target.value); syncUrl(); renderDynamic(); }
  });
}

async function pickNation(slug, season) {
  currentSlug = slug;
  document.getElementById("nationSelect").value = slug;
  let payload;
  try {
    payload = await Money.loadJSON(`data/nations/${slug}.json`);
  } catch (e) {
    document.getElementById("nationDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load this nation (${e.message}).</p></section>`;
    return;
  }
  currentNation = payload;

  const seasons = Object.keys(payload.seasons).map(Number).sort((a, b) => b - a);
  const yearSel = document.getElementById("nationYearSelect");
  yearSel.disabled = false;
  yearSel.innerHTML =
    `<option value="">Choose a season…</option>` +
    seasons.map((s) => `<option value="${s}">${seasonLabel(s)}</option>`).join("");
  currentSeason = season != null && seasons.includes(season) ? season : seasons[0];
  yearSel.value = String(currentSeason);

  syncUrl();
  buildStructure();
  renderDynamic();
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set("nation", currentSlug);
  params.set("mode", currentMode());
  if (currentSeason != null) params.set("year", String(currentSeason));
  history.replaceState(null, "", `${location.pathname}?${params}`);
  const fl = document.getElementById("franchiseLink");
  if (fl) fl.href = `nations.html?nation=${currentSlug}&mode=${currentMode()}`;
}

function renderPrompt() {
  document.getElementById("nationDetail").innerHTML = `
    <section class="panel">
      <p class="muted">Pick a nation and a season above — or open one from the
      <a href="nation-seasons.html">Nation Seasons table</a> — to see that squad.</p>
    </section>`;
}

function badgeImg(url, alt) {
  if (!url) return "";
  return `<img src="${url}" alt="${alt} badge" class="logo logo-xs" loading="lazy" onerror="this.style.display='none'"> `;
}

function buildStructure() {
  const n = currentNation;
  const bits = [];
  if (n.confederation) bits.push(n.confederation);
  if (n.coach_name) bits.push(`Coach: ${n.coach_name}`);
  bits.push(`${n.pool_size.toLocaleString()} players in pool`);

  document.getElementById("nationDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${badgeImg(n.badge_url, n.name) || ""}
      <div>
        <h2 class="team-header-name">${n.name}</h2>
        <div class="muted">${bits.join(" · ")}</div>
        <div class="muted" style="font-size:0.8rem;margin-top:2px;">
          <a id="franchiseLinkInline" href="nations.html?nation=${n.slug}">See ${n.name}'s whole history →</a>
        </div>
      </div>
      <div class="team-header-season">
        <div class="kpi-label" id="nationKpiLabel">Squad value</div>
        <div class="kpi-value" id="nationValue">—</div>
        <div class="muted" id="nationValueNote" style="font-size:0.72rem;"></div>
      </div>
    </section>

    <section class="panel">
      <h2 id="nationSquadTitle">Squad</h2>
      <div id="nationSquad"></div>
    </section>
  `;
}

function renderDynamic() {
  document.getElementById("nationSelect").value = currentSlug;
  const inline = document.getElementById("franchiseLinkInline");
  if (inline) inline.href = `nations.html?nation=${currentSlug}&mode=${currentMode()}`;
  renderKpis();
  renderSquad();
}

function modeLabel() {
  return { top26_value: "Top 26 by value", top26_future: "Top 26 by future value", all: "Whole citizen pool" }[currentMode()];
}

function seasonEntry() {
  return (currentNation.seasons[String(currentSeason)] || {})[currentMode()] || null;
}

function seasonMeta() {
  return currentNation.seasons[String(currentSeason)] || {};
}

function renderKpis() {
  const entry = seasonEntry();
  const valueEl = document.getElementById("nationValue");
  const noteEl = document.getElementById("nationValueNote");
  document.getElementById("nationKpiLabel").textContent = `${modeLabel()} · ${seasonLabel(currentSeason)}`;
  if (!entry) { valueEl.textContent = "—"; noteEl.textContent = ""; return; }
  valueEl.textContent = Money.fmtMoney(entry.value, { year: currentSeason });
  const future = Money.fmtMoney(entry.future, { year: currentSeason });
  const rank = seasonMeta().fifa_rank;
  const rankBit = rank ? ` · FIFA #${rank} that season` : "";
  noteEl.innerHTML = (currentMode() === "all"
    ? `${entry.count} players · future value ${future}`
    : `future value ${future}`) + rankBit;
}

function renderSquad() {
  const el = document.getElementById("nationSquad");
  const mode = currentMode();
  document.getElementById("nationSquadTitle").textContent = `Squad — ${modeLabel()} · ${seasonLabel(currentSeason)}`;

  if (mode === "all") {
    const entry = seasonEntry();
    el.innerHTML = `<p class="muted">This mode sums every one of the ${entry ? entry.count : 0} citizens with a recorded value that season, ` +
      `rather than picking a squad. Switch to a "Top 26" mode to see the selected players.</p>`;
    return;
  }
  const entry = seasonEntry();
  if (!entry || !entry.squad || !entry.squad.length) {
    el.innerHTML = `<p class="muted">No squad could be built for this season.</p>`;
    return;
  }
  const metric = mode === "top26_future" ? "future_value" : "value";
  const groups = POS_ORDER.map((g) => ({
    ...g,
    players: entry.squad
      .filter((p) => (p.pos || "other") === g.key)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0)),
  })).filter((g) => g.players.length);

  el.innerHTML = `
    <div class="table-scroll">
    <table id="nationSquadTable">
      <thead><tr>
        <th>Player</th><th>Pos</th>
        <th class="num" title="Age as of 1 July ${currentSeason}">Age</th>
        <th>Club</th>
        <th class="num">Value</th><th class="num">Future</th>
        <th class="num" title="Career international caps (current total)">Caps</th>
        <th class="num" title="Career international goals (current total)">Career G</th>
        <th class="num" title="International goals in this season (via martj42 goalscorers, matched by name — approximate)">${seasonLabel(currentSeason)} G</th>
      </tr></thead>
      <tbody>
        ${groups.map((g) => `
          <tr class="pos-group-row"><td colspan="9">${g.label} (${g.players.length})</td></tr>
          ${g.players.map((p) => squadRowHTML(p)).join("")}
        `).join("")}
      </tbody>
    </table>
    </div>`;
}

function squadRowHTML(p) {
  const club = p.club_id != null
    ? `<a href="teams.html?club=${p.club_id}&year=${currentSeason}" target="_blank" rel="noopener">${clubName(p.club_id)}</a>`
    : "—";
  const age = typeof ageInSeason === "function" ? ageInSeason(p.date_of_birth, currentSeason) : null;
  return `<tr>
    <td><a href="player.html?player=${p.player_id}" target="_blank" rel="noopener">${p.name || "Player #" + p.player_id}</a></td>
    <td>${p.position || "—"}</td>
    <td class="num">${age != null ? age : "—"}</td>
    <td>${club}</td>
    <td class="num" data-money="v">${p.value != null ? Money.fmtMoney(p.value, { year: currentSeason }) : "—"}</td>
    <td class="num" data-money="f">${p.future_value != null ? Money.fmtMoney(p.future_value, { year: currentSeason }) : "—"}</td>
    <td class="num">${p.caps != null ? p.caps : "—"}</td>
    <td class="num">${p.goals != null ? p.goals : "—"}</td>
    <td class="num">${p.intl_goals_season != null ? p.intl_goals_season : "—"}</td>
  </tr>`;
}

function clubName(clubId) {
  const c = clubsById[String(clubId)];
  return c ? c.name : `Club #${clubId}`;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("nationDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load Nations data (${err.message}).</p></section>`;
  });
});
