// Nation Seasons: every national-team pool x season as one sortable table,
// mirroring the club Team Seasons page. Reads data/nation_seasons.json
// (flat rows built by build_nation_artifacts).

let allRows = [];
const sortState = { key: "pool_value", dir: "desc" };

async function init() {
  await Money.init();
  allRows = await Money.loadJSON("data/nation_seasons.json");

  // Confederation filter options
  const confs = [...new Set(allRows.map((r) => r.confederation).filter(Boolean))].sort();
  document.getElementById("nsConf").innerHTML =
    `<option value="">All confederations</option>` +
    confs.map((c) => `<option value="${c}">${c}</option>`).join("");

  // Season filter options (desc)
  const years = [...new Set(allRows.map((r) => r.season))].sort((a, b) => b - a);
  document.getElementById("nsYear").innerHTML =
    `<option value="">All seasons</option>` +
    years.map((y) => `<option value="${y}">${seasonLabel(y)}</option>`).join("");

  // Nation search datalist
  const names = [...new Set(allRows.map((r) => r.name))].sort();
  document.getElementById("nsList").innerHTML =
    names.map((n) => `<option value="${n.replace(/"/g, "&quot;")}"></option>`).join("");

  ["nsSearch", "nsConf", "nsYear"].forEach((id) =>
    document.getElementById(id).addEventListener("input", render));
  document.getElementById("nsReset").addEventListener("click", () => {
    ["nsSearch", "nsConf", "nsYear"].forEach((id) => (document.getElementById(id).value = ""));
    render();
  });

  SeasonTable.wireSortableHeaders({ tableId: "nsTable", sortState, onSort: render });
  window.addEventListener("moneysettingschange", render);
  render();
}

function filtered() {
  const q = document.getElementById("nsSearch").value.trim().toLowerCase();
  const conf = document.getElementById("nsConf").value;
  const year = document.getElementById("nsYear").value;
  return allRows.filter((r) => {
    if (conf && r.confederation !== conf) return false;
    if (year && String(r.season) !== year) return false;
    if (q && !(r.name || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

function render() {
  const rows = filtered();
  SeasonTable.sortRows(rows, sortState);
  SeasonTable.updateSortIndicators("nsTable", sortState);

  const money = (v, y) => (v != null ? Money.fmtMoney(v, { year: y }) : "—");
  document.getElementById("nsTbody").innerHTML = rows
    .map((r) => `
      <tr>
        <td class="team-cell"><a href="nation-season.html?nation=${r.slug}&year=${r.season}">${r.name}</a></td>
        <td>${seasonLabel(r.season)}</td>
        <td>${r.confederation || "—"}</td>
        <td class="num">${money(r.pool_value, r.season)}</td>
        <td class="num">${money(r.pool_future, r.season)}</td>
        <td class="num">${money(r.all_value, r.season)}</td>
        <td class="num">${r.fifa_rank != null ? "#" + r.fifa_rank : "—"}</td>
        <td class="num">${r.pool_count != null ? r.pool_count : "—"}</td>
      </tr>`)
    .join("");

  document.getElementById("nsSummary").textContent =
    `${rows.length.toLocaleString()} nation-seasons`;
}

init().catch((err) => {
  console.error(err);
  document.querySelector("main").innerHTML =
    `<p style="color:#f87171;padding:20px;">Couldn't load nation seasons (${err.message}).</p>`;
});
