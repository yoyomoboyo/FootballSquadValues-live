// Home landing page. Intro + a "season spotlight" hook + the menu into the rest
// of the site. The nations globe below the menu (nation-globe.js) replaced the
// old top-players table. Replaces the old per-club Dashboard (that view lives on
// the Teams/Franchise pages). No chart here, so Chart.js isn't loaded on this
// page. Money formatting/conversion comes from money.js.

// Top-five leagues by Transfermarkt competition id (bundesliga = L1).
const BIG5 = new Set(["GB1", "ES1", "IT1", "L1", "FR1"]);

let homeData = null;

async function main() {
  await Money.init();
  const [clubs, squadBySeason, meta] = await Promise.all([
    Money.loadJSON("data/clubs.json"),
    Money.loadJSON("data/squad_value_by_season.json"),
    Money.loadJSON("data/meta.json").catch(() => null),
  ]);
  homeData = {
    squadBySeason,
    clubsById: Object.fromEntries(clubs.map((c) => [c.club_id, c])),
    meta,
  };

  renderSpotlight();

  if (meta && meta.generated_at) {
    const generated = new Date(meta.generated_at);
    document.getElementById("footer").innerHTML +=
      ` &middot; Data last refreshed ${generated.toLocaleDateString()} &middot; ` +
      `${meta.num_clubs} clubs &middot; ${meta.num_players} players`;
  }

  window.addEventListener("moneysettingschange", () => {
    renderSpotlight();
  });
}

// Biggest "value risers": top-five-league club-seasons where the squad's value
// grew most into its eventual future peak (potential_value) -- i.e. the sides
// that were most undervalued at the time. One row per club (its best season),
// so a single club can't fill the whole list.
function renderSpotlight() {
  const { squadBySeason, clubsById } = homeData;
  const bestByClub = new Map();
  for (const r of squadBySeason) {
    if (!BIG5.has(r.league)) continue;
    if (r.actual_value == null || r.potential_value == null) continue;
    if (r.roster_complete === false) continue;
    const gap = r.potential_value - r.actual_value;
    if (gap <= 0) continue;
    const prev = bestByClub.get(r.club_id);
    if (!prev || gap > prev.gap) bestByClub.set(r.club_id, { r, gap });
  }
  const top = [...bestByClub.values()].sort((a, b) => b.gap - a.gap).slice(0, 5);

  const tbody = document.querySelector("#spotlightTable tbody");
  tbody.innerHTML = top
    .map(({ r, gap }) => {
      const c = clubsById[r.club_id] || {};
      const league = prettifyLeagueName(r.league_name || c.competition_name || "");
      return `<tr>
        <td><a href="teams.html?club=${r.club_id}&year=${r.season}">${c.name || "Club #" + r.club_id}</a></td>
        <td>${league}</td>
        <td class="num">${seasonLabel(r.season)}</td>
        <td class="num">${Money.fmtMoney(r.actual_value, { year: r.season })}</td>
        <td class="num">${Money.fmtMoney(r.potential_value, { year: r.season })}</td>
        <td class="num" style="color:var(--accent)">+${Money.fmtMoney(gap, { year: r.season })}</td>
      </tr>`;
    })
    .join("");
}

function renderTopPlayers() {
  document.getElementById("peakValueHeader").textContent = `${Money.peakLabel()} value`;
  const tbody = document.querySelector("#topPlayersTable tbody");
  tbody.innerHTML = homeData.topPlayers
    .slice(0, 20)
    .map((p) => {
      const peak = Money.pickPeak(p, "peak_value", "peak_value_alltime");
      return `<tr><td><a href="player.html?player=${p.player_id}">${p.name || p.player_id}</a></td>` +
        `<td class="num">${Money.fmtMoney(peak)}</td></tr>`;
    })
    .join("");
  makeTablesSortable(document.getElementById("topPlayersTable").parentElement);
}

main().catch((err) => {
  console.error(err);
  document.querySelector("main").innerHTML =
    `<p style="color:#f87171;padding:20px;">Couldn't load the homepage data (${err.message}).</p>`;
});
