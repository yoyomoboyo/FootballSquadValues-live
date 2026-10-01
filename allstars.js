// All-Star Squads directory — the Seasons-style index of every All-Star squad.
// Pick a scope (Teams / Leagues / Nations) and a format (26-man / Starting XI),
// then browse a sortable table of combined value, top player and average age;
// each row opens the full squad on allstar.html. Data: allstar/directory.json
// (per-squad summaries built in precompute).

let directory = { team: [], league: [], nation: [] };
let scope = "team";
let fmt = "26";
const sortState = { key: "combined", dir: "desc" };

async function init() {
  await Money.init();
  directory = await Money.loadJSON("data/allstar/directory.json");

  document.getElementById("dirScope").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    scope = b.dataset.s; toggleSeg("dirScope", b); render();
  });
  document.getElementById("dirFmt").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    fmt = b.dataset.f; toggleSeg("dirFmt", b); render();
  });
  document.getElementById("dirSearch").addEventListener("input", render);
  SeasonTable.wireSortableHeaders({ tableId: "dirTable", sortState, onSort: render });
  window.addEventListener("moneysettingschange", render);
  render();
}

function toggleSeg(id, btn) {
  Array.from(document.getElementById(id).children).forEach((c) => c.classList.toggle("on", c === btn));
}

const SCOPE_LINK = {
  team: (r) => `allstar.html?scope=team&club=${r.id}`,
  league: (r) => `allstar.html?scope=league&league=${r.id}`,
  nation: (r) => `allstar.html?scope=nation&nation=${r.id}`,
};

function displayName(r) {
  return scope === "league" ? prettifyLeagueName(r.name) : (r.name || String(r.id));
}

function rows() {
  const q = document.getElementById("dirSearch").value.trim().toLowerCase();
  return (directory[scope] || [])
    .map((r) => ({ ...r, combined: fmt === "xi" ? r.combined_xi : r.combined_26 }))
    .filter((r) => !q || displayName(r).toLowerCase().includes(q));
}

function render() {
  document.getElementById("dirNameHead").textContent =
    { team: "Team", league: "League", nation: "Nation" }[scope];
  const extraHead = document.getElementById("dirExtraHead");
  extraHead.textContent = scope === "team" ? "League" : "";
  extraHead.style.visibility = scope === "team" ? "visible" : "hidden";

  const list = rows();
  SeasonTable.sortRows(list, sortState);
  SeasonTable.updateSortIndicators("dirTable", sortState);

  document.getElementById("dirTbody").innerHTML = list.map((r) => {
    const extra = scope === "team" ? (r.extra ? prettifyLeagueName(r.extra) : "—") : "";
    const top = r.top_id != null
      ? `<a href="player.html?player=${r.top_id}">${r.top_name || "—"}</a>`
      : (r.top_name || "—");
    return `<tr>
      <td class="team-cell"><a href="${SCOPE_LINK[scope](r)}">${displayName(r)}</a></td>
      <td>${extra}</td>
      <td class="num">${Money.fmtMoney(r.combined)}</td>
      <td class="num"><span title="${(r.top_name || "").replace(/"/g, "&quot;")} — ${Money.fmtMoney(r.top_value)}">${top} · ${Money.fmtMoney(r.top_value)}</span></td>
      <td class="num">${r.avg_age != null ? r.avg_age : "—"}</td>
    </tr>`;
  }).join("");

  document.getElementById("dirSummary").textContent =
    `${list.length.toLocaleString()} ${scope === "nation" ? "nations" : scope + "s"} · ${fmt === "xi" ? "Starting XI" : "26-man squad"}`;
}

init().catch((err) => {
  console.error(err);
  document.querySelector("main").innerHTML =
    `<p style="color:#f87171;padding:20px;">Couldn't load the All-Star directory (${err.message}).</p>`;
});
