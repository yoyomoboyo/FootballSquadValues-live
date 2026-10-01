// Nation Franchise page: a country's citizen pool treated as a national team,
// across its whole history. Header + value-over-time chart (per squad mode) +
// an "every season" table whose rows open the Nation Season page for that one
// season. The per-season squad breakdown lives on nation-season.html — this
// page is the club-side Franchise analogue. Data: nations/{slug}.json +
// nations_index.json, precomputed offline.

let nationsIndex = [];
let currentNation = null; // nations/{slug}.json
let currentSlug = null;
let latestSeason = null;

async function init() {
  await Money.init();
  nationsIndex = await Money.loadJSON("data/nations_index.json");

  populateNationOptions();
  wireControls();

  const params = new URLSearchParams(location.search);
  const nation = params.get("nation");
  const mode = params.get("mode");
  // Old deep links pointed a single season at the consolidated page as
  // ?nation=X&year=Y. That view is now the Nation Season page, so forward
  // any link that names a season there rather than dropping the year.
  if (nation && params.get("year") != null) {
    const q = new URLSearchParams({ nation, year: params.get("year") });
    if (mode) q.set("mode", mode);
    location.replace(`nation-season.html?${q}`);
    return;
  }
  if (mode) document.getElementById("nationModeSelect").value = mode;
  if (nation) {
    await pickNation(nation);
  } else {
    renderLeaderboard();
  }

  window.addEventListener("moneysettingschange", () => {
    if (currentNation) renderDynamic();
    else renderLeaderboard();
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

// Resolve whatever the user typed/picked in the search box to a nation slug.
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
      if (slug) { pickNation(slug); search.value = ""; search.blur(); }
    };
    search.addEventListener("change", go);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
  }
  document.getElementById("nationSelect").addEventListener("change", (e) => {
    if (e.target.value) pickNation(e.target.value);
  });
  document.getElementById("nationModeSelect").addEventListener("change", () => {
    if (currentNation) { syncUrl(); renderDynamic(); }
  });
}

async function pickNation(slug) {
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
  latestSeason = seasons[0] ?? null;

  syncUrl();
  buildStructure();
  renderDynamic();
}

function syncUrl() {
  const params = new URLSearchParams();
  params.set("nation", currentSlug);
  params.set("mode", currentMode());
  history.replaceState(null, "", `${location.pathname}?${params}`);
}

// The default (no nation picked) view: a leaderboard of the most valuable
// national pools, so the page isn't empty on arrival.
function renderLeaderboard() {
  const rows = [...nationsIndex]
    .filter((n) => n.current_value != null)
    .sort((a, b) => (b.current_value || 0) - (a.current_value || 0))
    .slice(0, 40);
  document.getElementById("nationDetail").innerHTML = `
    <section class="panel">
      <h2>Most valuable national pools</h2>
      <p class="muted" style="font-size:0.85rem;">Top-26-by-value squad, latest season each. Pick a nation above for the full history.</p>
      <div class="table-scroll">
        <table id="nationLeaderTable">
          <thead><tr><th>#</th><th>Nation</th><th>FIFA</th><th class="num">Squad value</th><th class="num">Future value</th></tr></thead>
          <tbody>
            ${rows.map((n, i) => `<tr>
              <td class="num">${i + 1}</td>
              <td><a href="nations.html?nation=${n.slug}">${badgeImg(n.badge_url, n.name)}${n.name}</a></td>
              <td class="num">${n.fifa_ranking ? "#" + n.fifa_ranking : "—"}</td>
              <td class="num" data-money="v">${Money.fmtMoney(n.current_value, { year: n.latest_season })}</td>
              <td class="num" data-money="f">${Money.fmtMoney(n.current_future, { year: n.latest_season })}</td>
            </tr>`).join("")}
          </tbody>
        </table>
      </div>
    </section>`;
  makeTablesSortable(document.getElementById("nationDetail"));
}

function badgeImg(url, alt) {
  if (!url) return "";
  return `<img src="${url}" alt="${alt} badge" class="logo logo-xs" loading="lazy" onerror="this.style.display='none'"> `;
}

function buildStructure() {
  const n = currentNation;
  const bits = [];
  if (n.fifa_ranking) bits.push(`FIFA <strong>#${n.fifa_ranking}</strong> <span class="muted">(current)</span>`);
  if (n.confederation) bits.push(n.confederation);
  if (n.coach_name) bits.push(`Coach: ${n.coach_name}`);
  bits.push(`${n.pool_size.toLocaleString()} players in pool`);

  document.getElementById("nationDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${badgeImg(n.badge_url, n.name) || ""}
      <div>
        <h2 class="team-header-name">${n.name}</h2>
        <div class="muted">${bits.join(" · ")}</div>
        <div class="allstar-links">
          <a class="allstar-link" href="allstar.html?scope=nation&nation=${n.slug}"><span class="st">★</span> <span>All-Star squad<br><span class="d">${n.name}'s best 26 citizens ever, by value</span></span></a>
        </div>
      </div>
      <div class="team-header-season">
        <div class="kpi-label" id="nationKpiLabel">Squad value</div>
        <div class="kpi-value" id="nationValue">—</div>
        <div class="muted" id="nationValueNote" style="font-size:0.72rem;"></div>
      </div>
    </section>

    <section class="panel">
      <h2 id="nationChartTitle">Squad value over time</h2>
      <canvas id="nationChart" height="110"></canvas>
    </section>

    <section class="panel">
      <h2>Every season</h2>
      <p class="muted" style="font-size:0.8rem;margin:-4px 0 12px">Click a season to open that squad.</p>
      <div id="nationSeasonTableWrap"></div>
    </section>
  `;
}

function renderDynamic() {
  document.getElementById("nationSelect").value = currentSlug;
  renderKpis();
  renderChart();
  renderSeasonTable();
}

function modeLabel() {
  return { top26_value: "Top 26 by value", top26_future: "Top 26 by future value", all: "Whole citizen pool" }[currentMode()];
}

function renderKpis() {
  const mode = currentMode();
  const entry = latestSeason != null ? (currentNation.seasons[String(latestSeason)] || {})[mode] : null;
  const valueEl = document.getElementById("nationValue");
  const noteEl = document.getElementById("nationValueNote");
  document.getElementById("nationKpiLabel").textContent = `${modeLabel()} · ${seasonLabel(latestSeason)} (latest)`;
  if (!entry) { valueEl.textContent = "—"; noteEl.textContent = ""; return; }
  valueEl.textContent = Money.fmtMoney(entry.value, { year: latestSeason });
  const future = Money.fmtMoney(entry.future, { year: latestSeason });
  const rank = (currentNation.seasons[String(latestSeason)] || {}).fifa_rank;
  const rankBit = rank ? ` · FIFA #${rank} that season` : "";
  noteEl.innerHTML = (mode === "all"
    ? `${entry.count} players · future value ${future}`
    : `future value ${future}`) + rankBit;
}

let nationChart = null;
function renderChart() {
  const mode = currentMode();
  const seasons = Object.keys(currentNation.seasons).map(Number).sort((a, b) => a - b);
  const valuePts = seasons.map((s) => {
    const e = currentNation.seasons[String(s)][mode];
    return e ? Money.convertEur(e.value, { year: s }) : null;
  });
  const futurePts = seasons.map((s) => {
    const e = currentNation.seasons[String(s)][mode];
    return e ? Money.convertEur(e.future, { year: s }) : null;
  });
  const rankPts = seasons.map((s) => currentNation.seasons[String(s)].fifa_rank ?? null);
  const anyRank = rankPts.some((r) => r != null);
  document.getElementById("nationChartTitle").textContent = `${modeLabel()} — value over time`;
  const canvas = document.getElementById("nationChart");
  if (nationChart) nationChart.destroy();
  const datasets = [
    { label: "Squad value", data: valuePts, borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.15)", tension: 0.25, fill: true, spanGaps: true, yAxisID: "y" },
    { label: "Future value", data: futurePts, borderColor: "#f59e0b", backgroundColor: "rgba(245,158,11,0.08)", tension: 0.25, fill: false, borderDash: [5, 4], spanGaps: true, yAxisID: "y" },
  ];
  if (anyRank) {
    datasets.push({
      label: "FIFA rank", data: rankPts, borderColor: "#a78bfa", backgroundColor: "#a78bfa",
      tension: 0.25, fill: false, spanGaps: true, yAxisID: "yRank", pointRadius: 2,
    });
  }
  nationChart = new Chart(canvas, {
    type: "line",
    data: { labels: seasons.map((s) => seasonLabel(s)), datasets },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      scales: {
        y: { ticks: { color: "#94a3b8", callback: (v) => Money.fmtConverted(v) }, grid: { color: "#334155" } },
        yRank: { display: anyRank, position: "right", reverse: true, min: 1, ticks: { color: "#a78bfa", callback: (v) => "#" + v }, grid: { drawOnChartArea: false } },
        x: { ticks: { color: "#94a3b8" }, grid: { color: "#33415530" } },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        tooltip: { callbacks: { label: (ctx) => ctx.dataset.yAxisID === "yRank"
          ? `${ctx.dataset.label}: #${ctx.parsed.y}`
          : `${ctx.dataset.label}: ${Money.fmtConverted(ctx.parsed.y)}` } },
      },
    },
  });
}

function renderSeasonTable() {
  const mode = currentMode();
  const isAll = mode === "all";
  const seasons = Object.keys(currentNation.seasons).map(Number).sort((a, b) => b - a);
  const rows = seasons.map((s) => {
    const meta = currentNation.seasons[String(s)] || {};
    const e = meta[mode];
    return { s, e, rank: meta.fifa_rank };
  });
  document.getElementById("nationSeasonTableWrap").innerHTML = `
    <div class="table-scroll">
    <table id="nationSeasonTable">
      <thead><tr>
        <th>Season</th>
        <th class="num">${isAll ? "Pool value" : "Squad value"}</th>
        <th class="num">Future value</th>
        <th class="num">FIFA</th>
        <th class="num">${isAll ? "Players" : ""}</th>
      </tr></thead>
      <tbody>
        ${rows.map(({ s, e, rank }) => `<tr>
          <td><a href="nation-season.html?nation=${currentSlug}&year=${s}&mode=${mode}">${seasonLabel(s)}</a></td>
          <td class="num" data-money="v">${e ? Money.fmtMoney(e.value, { year: s }) : "—"}</td>
          <td class="num" data-money="f">${e ? Money.fmtMoney(e.future, { year: s }) : "—"}</td>
          <td class="num">${rank ? "#" + rank : "—"}</td>
          <td class="num">${isAll ? (e ? e.count : "—") : ""}</td>
        </tr>`).join("")}
      </tbody>
    </table>
    </div>`;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("nationDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load Nations data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p></section>`;
  });
});
