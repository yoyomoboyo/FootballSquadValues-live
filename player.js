// Player page: search a player, see their value over time (with transfer
// events marked), every club they played for, their transfers, and
// season-by-season stats when available.

let playersIndex = [];
let currentPayload = null; // players/{player_id}.json
let statsRows = [];
let chart = null;

const statsSortState = { key: "season", dir: "desc" };

async function init() {
  await Money.init();
  playersIndex = await Money.loadJSON("data/players_index.json");

  wireSearch();

  window.addEventListener("moneysettingschange", () => {
    if (currentPayload) renderDynamic();
  });

  const params = new URLSearchParams(location.search);
  const initialPlayer = params.get("player");
  if (initialPlayer) loadPlayerDetail(initialPlayer);
}

function wireSearch() {
  const input = document.getElementById("playerSearchInput");
  const results = document.getElementById("playerSearchResults");

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      results.innerHTML = "";
      return;
    }
    const matches = playersIndex.filter((p) => p.name && p.name.toLowerCase().includes(q)).slice(0, 20);
    results.innerHTML = matches
      .map((p) => `<li data-player-id="${p.player_id}">${playerImgHTML(p.image_url, p.name, { size: "sm" })}${p.name}` +
        `${p.current_club_name ? ` <span class="muted">— ${p.current_club_name}</span>` : ""}</li>`)
      .join("");
    results.hidden = matches.length === 0;
  });

  results.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-player-id]");
    if (!li) return;
    const pid = li.dataset.playerId;
    const p = playersIndex.find((x) => String(x.player_id) === String(pid));
    input.value = p ? p.name : "";
    results.hidden = true;
    results.innerHTML = "";
    loadPlayerDetail(pid);
  });

  document.addEventListener("click", (e) => {
    if (!results.contains(e.target) && e.target !== input) results.hidden = true;
  });
}

async function loadPlayerDetail(playerId) {
  const el = document.getElementById("playerDetail");
  el.innerHTML = `<section class="panel"><p class="muted">Loading…</p></section>`;
  try {
    const res = await fetch(`data/players/${playerId}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    currentPayload = await res.json();
  } catch (err) {
    console.error(err);
    currentPayload = null;
    el.innerHTML = `<section class="panel"><p class="error-text">No career data available for this player. ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>? (${err.message})</p></section>`;
    return;
  }

  const params = new URLSearchParams(location.search);
  params.set("player", String(playerId));
  history.replaceState(null, "", `${location.pathname}?${params}`);

  statsRows = Object.entries(currentPayload.career).map(([season, c]) => ({
    season: Number(season), age: ageInSeason(currentPayload.date_of_birth, Number(season)), ...c,
  }));

  buildStructure();
  SeasonTable.wireSortableHeaders({
    tableId: "playerStatsTable", sortState: statsSortState,
    onSort: () => { SeasonTable.sortRows(statsRows, statsSortState); renderStatsTable(); },
  });
  SeasonTable.sortRows(statsRows, statsSortState);
  renderDynamic();
}

function buildStructure() {
  const p = currentPayload;
  document.getElementById("playerDetail").innerHTML = `
    <section class="panel team-header-strip">
      ${playerImgHTML(p.image_url, p.name, { size: "lg" })}
      <div>
        <h2 class="team-header-name">${p.name || p.player_id}</h2>
        <div class="muted">
          ${p.sub_position || p.position || ""} ${p.nationality ? "· " + p.nationality : ""}
          ${p.current_club_id ? ` · <a href="franchise.html?club=${p.current_club_id}">${p.current_club_name || "current club"}</a>` : (p.current_club_name ? ` · ${p.current_club_name}` : "")}
        </div>
      </div>
    </section>

    <section class="panel">
      <h2>Value over time</h2>
      <canvas id="playerChart" height="110"></canvas>
      <p class="muted" style="font-size:0.8rem;margin-top:6px;">Every recorded valuation update, not just one point per season -- larger amber points mark one near a tracked transfer, hover for details.</p>
    </section>

    <section class="panel">
      <h2>Season by season</h2>
      <div class="table-scroll bref-table-wrap">
        <table class="bref-table" id="playerStatsTable">
          <thead>
            <tr>
              <th data-key="season" data-type="num">Year</th>
              <th data-key="age" data-type="num" class="num">Age</th>
              <th data-key="club_name" data-type="text">Club</th>
              <th data-key="value_eur" data-type="num" class="num">Value</th>
              <th data-key="appearances" data-type="num" class="num">Apps</th>
              <th data-key="goals" data-type="num" class="num">G</th>
              <th data-key="assists" data-type="num" class="num">A</th>
              <th data-key="minutes_played" data-type="num" class="num">Mins</th>
              <th data-key="yellow_cards" data-type="num" class="num">Yellows</th>
            </tr>
          </thead>
          <tbody id="playerStatsTbody"></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2>Transfers</h2>
      ${renderTransfersList(p.moves)}
    </section>
  `;
  makeTablesSortable(document.getElementById("playerDetail"));
}

function renderDynamic() {
  renderChart();
  renderStatsTable();
}

// Moves rarely carry a real transfer_date (only the handful backed by an
// actual transfers.csv row do) -- for the rest, approximate a target date
// from the season alone (matching the "last season at the old club"/"first
// season at the new club" convention elsewhere): a transfer/status change
// lands around the start of the following season, a first-ever signing
// around the start of its own season. Used only to find which valuation
// snapshot to mark on the chart, never shown as if it were exact.
function approxMoveDate(m) {
  if (m.transfer_date) return new Date(m.transfer_date + "T00:00:00");
  return m.type === "signed"
    ? new Date(`${m.season}-08-01T00:00:00`)
    : new Date(`${m.season + 1}-07-01T00:00:00`);
}

function renderChart() {
  const history = (currentPayload.value_history || []).filter((h) => h.value_eur != null);
  const canvas = document.getElementById("playerChart");
  if (!history.length) {
    if (chart) { chart.destroy(); chart = null; }
    return;
  }
  const labels = history.map((h) => monthYearLabel(h.date));
  const values = history.map((h) => Money.convertEur(h.value_eur, { year: seasonOfDate(h.date) }));

  const pointRadius = new Array(history.length).fill(3);
  const pointBackgroundColor = new Array(history.length).fill("#38bdf8");
  const notes = new Array(history.length).fill(null);

  (currentPayload.moves || []).forEach((m) => {
    const target = approxMoveDate(m);
    let bestIdx = -1, bestDiff = Infinity;
    history.forEach((h, i) => {
      const diff = Math.abs(new Date(h.date + "T00:00:00") - target);
      if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
    });
    if (bestIdx === -1) return;
    pointRadius[bestIdx] = 7;
    pointBackgroundColor[bestIdx] = "#f59e0b";
    const fee = m.transfer_fee_eur ? `, fee ${Money.fmtMoney(m.transfer_fee_eur, { year: m.season })}` : "";
    const valAt = m.value_at_transfer_eur != null ? ` (valued at ${Money.fmtMoney(m.value_at_transfer_eur, { year: m.season })} at the time)` : "";
    const note = `${moveTypeLabel(m)}: ${m.from_club_name || "?"} → ${m.to_club_name || "?"}${fee}${valAt}`;
    notes[bestIdx] = notes[bestIdx] ? `${notes[bestIdx]} · ${note}` : note;
  });

  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Market value",
        data: history.map((h, i) => ({ x: labels[i], y: values[i] })),
        parsing: { yAxisKey: "y" },
        borderColor: "#38bdf8", backgroundColor: "rgba(56,189,248,0.15)",
        tension: 0.25, fill: true,
        pointRadius, pointBackgroundColor,
      }],
    },
    options: {
      responsive: true,
      scales: {
        y: { ticks: { color: "#94a3b8", callback: (v) => Money.fmtConverted(v) }, grid: { color: "#334155" } },
        x: {
          // Every point is its own valuation date (see the caption below the
          // chart), so labelling every tick with a full date would be
          // unreadably dense -- show a tick only where the year changes,
          // and leave the precise date to the tooltip on hover instead.
          ticks: {
            color: "#94a3b8",
            autoSkip: false,
            callback: (val, index) => {
              const cur = history[index] ? history[index].date.slice(0, 4) : null;
              const prev = index > 0 && history[index - 1] ? history[index - 1].date.slice(0, 4) : null;
              return cur !== prev ? cur : "";
            },
          },
          grid: { color: "#33415530" },
        },
      },
      plugins: {
        legend: { labels: { color: "#e2e8f0" } },
        tooltip: {
          callbacks: {
            title: (items) => {
              const h = history[items[0].dataIndex];
              return h ? new Date(h.date + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "";
            },
            afterTitle: (items) => {
              const h = history[items[0].dataIndex];
              const age = h ? ageAtDate(currentPayload.date_of_birth, h.date) : null;
              return age != null ? `Age ${age}` : "";
            },
            label: (ctx) => `Value: ${Money.fmtConverted(ctx.parsed.y)}`,
            afterLabel: (ctx) => notes[ctx.dataIndex] || "",
          },
        },
      },
    },
  });
}

function renderStatsTable() {
  const tbody = document.getElementById("playerStatsTbody");
  tbody.innerHTML = statsRows.map((r) => `
    <tr>
      <td>${seasonLabel(r.season)}</td>
      <td class="num">${r.age ?? "—"}</td>
      <td>${r.club_id
        ? (r.season >= MIN_SQUAD_SEASON
            ? `<a href="teams.html?club=${r.club_id}&year=${r.season}" title="See ${r.club_name || "this club"}'s ${seasonLabel(r.season)} squad">${r.club_name || "Club #" + r.club_id}</a>`
            : `<span title="Squad pages start in ${seasonLabel(MIN_SQUAD_SEASON)} — roster coverage before that is too thin to show as a team">${r.club_name || "Club #" + r.club_id}</span>`)
        : (r.status ? statusLabel(r.status) : "—")}</td>
      <td class="num">${approxValueHTML(r, Money.fmtMoney(r.value_eur, { year: r.season }))}</td>
      <td class="num">${r.appearances ?? "—"}</td>
      <td class="num">${r.goals ?? "—"}</td>
      <td class="num">${r.assists ?? "—"}</td>
      <td class="num">${r.minutes_played ?? "—"}</td>
      <td class="num">${r.yellow_cards ?? 0}</td>
    </tr>`).join("");
}

function statusLabel(status) {
  return { retired: "Retired", without_club: "No club", career_break: "Career break" }[status] || "Untracked";
}

function renderTransfersList(moves) {
  if (!moves || !moves.length) {
    return `<p class="muted">No transfer moves recorded for this player — the source dataset's transfer records are sparse for many players.</p>`;
  }
  return `
    <div class="table-scroll">
    <table>
      <thead><tr><th>Year</th><th class="num" title="Age at the time of the move">Age</th><th>From</th><th>To</th><th>Type</th><th>Value at transfer</th><th>Fee</th></tr></thead>
      <tbody>
        ${moves.map((m) => {
          const fromCell = m.from_club_id != null
            ? `<a href="franchise.html?club=${m.from_club_id}" target="_blank" rel="noopener">${m.from_club_name}</a>`
            : (m.from_club_name || "Unknown / untracked");
          const toCell = m.to_club_id != null
            ? `<a href="franchise.html?club=${m.to_club_id}" target="_blank" rel="noopener">${m.to_club_name}</a>`
            : (m.to_club_name || "Unknown / untracked");
          const dob = currentPayload.date_of_birth;
          const age = m.transfer_date && typeof ageAtDate === "function"
            ? ageAtDate(dob, m.transfer_date)
            : (typeof ageInSeason === "function" ? ageInSeason(dob, m.season) : null);
          return `<tr>
          <td>${seasonLabel(m.season)}</td>
          <td class="num">${age != null ? age : "—"}</td>
          <td class="muted">${fromCell}</td>
          <td class="muted">${toCell}</td>
          <td>${moveSourceTooltip(m) ? `<span title="${moveSourceTooltip(m)}">${moveTypeLabel(m)}</span>` : moveTypeLabel(m)}${m.source ? ` <a href="${m.source}" target="_blank" rel="noopener" title="Manually verified against this source">✓</a>` : ""}</td>
          <td>${m.value_at_transfer_eur != null ? Money.fmtMoney(m.value_at_transfer_eur, { year: m.season }) : "—"}</td>
          <td>${m.transfer_fee_eur != null ? Money.fmtMoney(m.transfer_fee_eur, { year: m.season }) : "—"}</td>
        </tr>`;
        }).join("")}
      </tbody>
    </table>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    document.getElementById("playerDetail").innerHTML =
      `<section class="panel"><p class="error-text">Couldn't load Player page data (${err.message}). ` +
      `Have you run <code>python scripts/precompute.py --out site/data</code>?</p></section>`;
  });
});
