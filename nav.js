// Shared header/nav, injected into every page's <div id="site-header"></div>
// so markup can't drift between pages. Also owns the currency/inflation/
// value-basis controls, since they need to live somewhere visible sitewide.

// Grouped nav. Top-level items are links; a `group` renders a hover-expanding
// dropdown whose own button links to the group's first page. The National Team
// group mirrors the club side: a Seasons table, a Franchise (whole history) and
// a single Season page.
const NAV_LINKS = [
  { page: "home", href: "index.html", label: "Home" },
  {
    label: "Club Soccer",
    group: [
      { page: "seasons", href: "seasons.html", label: "Team Seasons" },
      { page: "league-seasons", href: "league-seasons.html", label: "League Seasons" },
      { page: "leagues", href: "leagues.html", label: "Leagues" },
      { page: "franchise", href: "franchise.html", label: "Club Franchise" },
      { page: "teams", href: "teams.html", label: "Club Season" },
      { page: "allstars", href: "allstars.html", label: "All-Star Squads" },
    ],
  },
  {
    label: "National Teams",
    group: [
      { page: "nation-seasons", href: "nation-seasons.html", label: "Nation Seasons" },
      { page: "nation-franchise", href: "nations.html", label: "Nation Franchise" },
      { page: "nation-season", href: "nation-season.html", label: "Nation Season" },
    ],
  },
  { page: "player", href: "player.html", label: "Player" },
  { page: "globe", href: "globe.html", label: "Globe" },
  { page: "compare", href: "compare.html", label: "Compare" },
  { page: "data", href: "data.html", label: "Data" },
];

function navItemHTML(item, activePage) {
  if (item.group) {
    const groupActive = item.group.some((g) => g.page === activePage);
    const first = item.group[0];
    const children = item.group
      .map((g) => `<a href="${g.href}"${g.page === activePage ? ' class="active"' : ""}>${g.label}</a>`)
      .join("");
    return (
      `<div class="navitem">` +
      `<a href="${first.href}"${groupActive ? ' class="active"' : ""}>${item.label}<span class="caret">▾</span></a>` +
      `<div class="nav-drop">${children}</div>` +
      `</div>`
    );
  }
  return `<a href="${item.href}"${item.page === activePage ? ' class="active"' : ""}>${item.label}</a>`;
}

function siteHeaderHTML(activePage) {
  const links = NAV_LINKS.map((l) => navItemHTML(l, activePage)).join("");
  return `
    <div class="site-header">
      <div class="brand"><a href="index.html">Squad Value Tracker</a></div>
      <nav class="site-nav">${links}</nav>
      <div class="money-controls">
        <label for="currencySelect">Currency</label>
        <select id="currencySelect">
          <option value="EUR">EUR €</option>
          <option value="USD">USD $</option>
          <option value="GBP">GBP £</option>
        </select>
        <label class="toggle-label" for="inflationToggle">
          <input type="checkbox" id="inflationToggle"> Today's money
        </label>
        <label for="valueBasisSelect">Potential value</label>
        <select id="valueBasisSelect">
          <option value="future">Future peak</option>
          <option value="alltime">All-time peak</option>
        </select>
      </div>
    </div>`;
}

function wireMoneyControls() {
  const settings = Money.getSettings();
  const currencySelect = document.getElementById("currencySelect");
  const inflationToggle = document.getElementById("inflationToggle");
  const valueBasisSelect = document.getElementById("valueBasisSelect");
  if (!currencySelect || !inflationToggle || !valueBasisSelect) return;

  currencySelect.value = settings.currency;
  inflationToggle.checked = settings.inflationAdjust;
  valueBasisSelect.value = settings.valueBasis;

  currencySelect.addEventListener("change", (e) => Money.setSettings({ currency: e.target.value }));
  inflationToggle.addEventListener("change", (e) => Money.setSettings({ inflationAdjust: e.target.checked }));
  valueBasisSelect.addEventListener("change", (e) => Money.setSettings({ valueBasis: e.target.value }));
}

async function renderSiteHeader() {
  const el = document.getElementById("site-header");
  if (!el) return;
  el.innerHTML = siteHeaderHTML(document.body.dataset.page);
  await Money.init();
  wireMoneyControls();
  renderDataFreshness();
}

// Sitewide "values current as of ..." note in the footer. The upstream
// valuation feed has stalled before (dcaribou/transfermarkt-datasets#377,
// frozen for months while everything else updated), and without this the
// site presents months-old market values as if they were today's -- e.g. a
// player's live Transfermarkt value tripling while we still show the old
// number. Warns visibly once the newest valuation is more than ~10 weeks old
// (TM revalues each big league at least twice a season, so beyond that the
// data is genuinely behind, not just between update waves).
async function renderDataFreshness() {
  const footer = document.getElementById("footer");
  if (!footer) return;
  try {
    const meta = await Money.loadJSON("data/meta.json");
    if (!meta.latest_valuation_date) return;
    const latest = new Date(meta.latest_valuation_date + "T00:00:00");
    const days = Math.floor((Date.now() - latest) / 86400000);
    const pretty = latest.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const stale = days > 70;
    footer.insertAdjacentHTML(
      "beforeend",
      `<div class="data-freshness${stale ? " stale" : ""}">` +
        (stale ? "⚠ " : "") +
        `Market values current as of <strong>${pretty}</strong>` +
        (stale
          ? ` — ${Math.floor(days / 30)} months behind Transfermarkt's live pages. The upstream dataset's valuation feed has stalled ` +
            `(<a href="https://github.com/dcaribou/transfermarkt-datasets/issues/377" target="_blank" rel="noopener">known issue</a>); ` +
            `recent breakouts and new signings will show outdated values until it resumes.`
          : "") +
      `</div>`
    );
  } catch (e) { /* freshness note is best-effort; never break the page for it */ }
}

document.addEventListener("DOMContentLoaded", renderSiteHeader);
