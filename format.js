// Tiny shared formatting helpers used across every page.

// Squad-wise views (team/league/nation pages, season tables) start here --
// precompute drops earlier club-seasons entirely (MIN_SQUAD_SEASON there;
// keep the two in sync). Player pages still show older seasons as history,
// they just can't link to team pages that no longer exist.
const MIN_SQUAD_SEASON = 2012;

function seasonLabel(season) {
  return `${season}/${String(season + 1).slice(2)}`;
}

// Same Aug-Jul season convention as season_of() in precompute.py -- keep
// the two in sync if that boundary ever changes.
function seasonOfDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.getMonth() + 1 >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

function monthYearLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// Player age. `dob` is a "YYYY-MM-DD" birth date (extra time part tolerated).
// ageAtDate = exact age on a given date (used on the value graph, which has
// real snapshot dates). ageInSeason = age as of July 1 of the season's start
// year -- the convention for season tables/rosters, just before an Aug-Jul
// season begins (keep in sync with precompute's average_age reference).
function ageAtDate(dob, date) {
  if (!dob) return null;
  const b = new Date(String(dob).slice(0, 10) + "T00:00:00");
  const d = date instanceof Date ? date : new Date(String(date).slice(0, 10) + "T00:00:00");
  if (isNaN(b) || isNaN(d)) return null;
  let age = d.getFullYear() - b.getFullYear();
  const m = d.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && d.getDate() < b.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
}

function ageInSeason(dob, season) {
  return ageAtDate(dob, new Date(`${season}-07-01T00:00:00`));
}

function ordinal(n) {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
}

// Click-to-sort for any statically-rendered table (roster, moves, transfer
// lists, top players...): sorts the existing DOM rows in place by the
// clicked column, no re-render. Cell values parse from text -- our own
// money format ("$23.4M", "€555K", optionally "≈"-prefixed), plain numbers,
// season labels ("2015/16" sorts by start year) -- falling back to
// case-insensitive text. Tables whose headers carry data-key are skipped:
// those are SeasonTable-managed and already sort via wireSortableHeaders.
function _sortableCellValue(td) {
  const text = td.textContent.trim();
  if (!text || text === "—") return null;
  const m = text.replace(/[≈,\s]/g, "").match(/^[\$€£]?(-?\d+(?:\.\d+)?)([KMB])?/i);
  if (m) {
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || "").toUpperCase()] || 1;
    return Number(m[1]) * mult;
  }
  return text.toLowerCase();
}

function makeTablesSortable(root) {
  (root || document).querySelectorAll("table").forEach((table) => {
    if (table.dataset.sortableWired || table.querySelector("th[data-key]")) return;
    table.dataset.sortableWired = "1";
    const headers = [...table.querySelectorAll("thead th")];
    headers.forEach((th, colIdx) => {
      th.classList.add("sortable-th");
      th.addEventListener("click", () => {
        const tbody = table.querySelector("tbody");
        if (!tbody) return;
        const dir = th.dataset.sortDir === "desc" ? "asc" : "desc";
        headers.forEach((h) => { delete h.dataset.sortDir; h.classList.remove("sorted-asc", "sorted-desc"); });
        th.dataset.sortDir = dir;
        th.classList.add(dir === "asc" ? "sorted-asc" : "sorted-desc");
        const mult = dir === "asc" ? 1 : -1;
        const rows = [...tbody.children];
        rows.sort((ra, rb) => {
          const va = _sortableCellValue(ra.children[colIdx]);
          const vb = _sortableCellValue(rb.children[colIdx]);
          if (va == null && vb == null) return 0;
          if (va == null) return 1; // blanks always last, either direction
          if (vb == null) return -1;
          if (typeof va === "string" || typeof vb === "string") {
            return String(va).localeCompare(String(vb)) * mult;
          }
          return (va - vb) * mult;
        });
        rows.forEach((r) => tbody.appendChild(r));
      });
    });
  });
}

// Tenure-backfilled roster/career values (see inject_tenure_roster_rows in
// precompute.py) carry value_approx/value_as_of: the player was confirmed at
// the club that season via their transfer timeline, but no valuation
// snapshot landed inside the season window, so the figure shown is their
// nearest real snapshot. Rendered with a leading "≈" + tooltip rather than
// passed off as an in-season number.
function approxValueHTML(rec, formatted) {
  if (!rec || !rec.value_approx) return formatted;
  const tip = `Value as of ${rec.value_as_of || "a nearby date"} -- the nearest recorded snapshot; ` +
    `no valuation was recorded inside this season, but the player's transfer timeline confirms ` +
    `they were at the club.`;
  return `<span class="approx-value" title="${tip}">≈ ${formatted}</span>`;
}

// competitions.json's "name" is a raw slug ("premier-league", "laliga"),
// not a display name -- title-cases it into something readable ("Premier
// League") for tooltips/headers. Not a perfect proper-noun fixer (leaves
// "Laliga" rather than "LaLiga"), just enough to not show a raw slug.
function prettifyLeagueName(slug) {
  if (!slug) return slug;
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
