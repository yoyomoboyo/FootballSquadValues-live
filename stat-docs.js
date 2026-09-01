// Single source of truth for what every stat/column on the site means.
// Drives BOTH the short hover blurbs on column headers (via statTitle / the
// linked "?" helper) AND the full data-dictionary page (data.html), so the two
// can never drift apart. Each entry: a short label, the anchor id used on
// data.html, a one-line `blurb` for the hover title, a longer `detail`, and an
// `example`. Keep blurbs to a sentence -- they surface as native tooltips.

const STAT_DOCS = {
  market_value: {
    label: "What market value is (and isn't)",
    blurb:
      "Every € figure is a transfer-market price — shaped by age, contract and demand. It is NOT a " +
      "rating of how good a player is.",
    detail:
      "All the euro figures on this site are Transfermarkt market values: an estimate of what a " +
      "player would cost in a transfer at that time. Market value is driven by age, contract length, " +
      "position, form and demand — not by a judgement of ability. A world-class veteran can be worth " +
      "a fraction of a rising prospect. Read every value here as a market price, never as a ranking " +
      "of who is the better footballer.",
    example:
      "Lionel Messi — regarded by many as the greatest of all time — carried a market value under " +
      "€20M in his mid-30s, far below rising players in their early 20s. The gap is about age and " +
      "resale, not ability.",
  },
  squad_value: {
    label: "Squad Value",
    blurb: "The squad's total market value that season — every player's value at the time, added up.",
    detail:
      "The combined Transfermarkt market value of the squad in that season, summing each player's " +
      "value as it stood at the time. This is the 'what was it worth then' figure, before any " +
      "hindsight, built from player-level valuation snapshots attributed to the club that season.",
    example:
      "Manchester City's 2017/18 squad had a Squad Value of about €971M — what those players were " +
      "worth during that season.",
  },
  future_value: {
    label: "Later Peak",
    blurb:
      "Adds up the highest value each player LATER reached, from that season onward. Not a forecast — " +
      "these are values that already happened; each player's high can fall in a different year.",
    detail:
      "For every player in the squad, take the highest market value they actually went on to reach " +
      "from that season onward (up to the present), then add those together. This is hindsight from " +
      "real recorded values — NOT a projection, model or prediction; nothing here is forecast. " +
      "Because each player's high falls in a different year, the sum is a paper figure that never " +
      "existed at one single moment (for the same players valued in one year, see Single-Year Peak). " +
      "Remember market value is a transfer price, not a rating of ability — see 'What market value is'.",
    example:
      "Manchester City's 2017/18 Later Peak is about €1.41B (+45% on the €971M at the time) — the sum " +
      "of each player's later recorded high, which for different players landed in different seasons.",
  },
  alltime_value: {
    label: "All-Time Peak",
    blurb: "Like Later Peak, but each player's highest recorded value EVER — before or after that season. Still real values, not a forecast.",
    detail:
      "Sums each player's single highest recorded market value at any point in their career, not just " +
      "from this season forward. Same footing as Later Peak: real recorded values (no projection), " +
      "and a sum of individual highs that never coincided in one year.",
    example:
      "Manchester City's 2017/18 All-Time Peak is about €1.52B (+57%), a little above its Later Peak " +
      "because a few players' career highs came earlier.",
  },
  peak_together: {
    label: "Single-Year Peak",
    blurb:
      "The most this season's players were worth in one single later year — valued together in the " +
      "same year, even after some had moved to other clubs.",
    detail:
      "Take the season's roster and, for each later year (that season onward, never earlier), add " +
      "up those same players' values in that one year; the Single-Year Peak is the highest of those " +
      "yearly totals. Unlike Later Peak / All-Time Peak, which add up each player's own best year " +
      "separately, this is measured within one single year — a figure that actually existed at one " +
      "moment. The players don't have to still be teammates; they're tracked wherever they end up.",
    example:
      "Manchester City's 2017/18 players hit a Single-Year Peak of about €1.11B in 2018/19 — what " +
      "those specific players were worth together that one year, versus €971M when the season was " +
      "played and a paper €1.41B Later Peak.",
  },
  peak_year: {
    label: "Peak Year",
    blurb: "The single later year in which this season's players were collectively worth the most.",
    detail:
      "The one year the roster's members were together worth the most, valued wherever they were by " +
      "then. It's always the season itself or later, never earlier.",
    example:
      "Manchester City's 2017/18 players reached their Single-Year Peak in 2018/19, so the Peak " +
      "Year is 2018/19.",
  },
  peak_pct: {
    label: "Peak %",
    blurb: "How much the squad grew from its value that season to its Single-Year Peak.",
    detail:
      "The percentage increase from Squad Value (that season) to Single-Year Peak. A high figure " +
      "means the players became much more valuable together shortly after; 0% means the season was " +
      "already their collective peak (or it's the current season, with no later years yet).",
    example: "Manchester City 2017/18: €971M → €1.11B Single-Year Peak is a Peak % of about +15%.",
  },
  future_pct: {
    label: "Later %",
    blurb: "Growth from the squad's value that season to its Later Peak.",
    detail: "The percentage increase from Squad Value to Later Peak (the sum of each player's later recorded high).",
    example: "Manchester City 2017/18: €971M → €1.41B Later Peak is about +45%.",
  },
  alltime_pct: {
    label: "All-Time %",
    blurb: "Growth from the squad's value that season to its All-Time Peak.",
    detail: "The percentage increase from Squad Value to All-Time Peak (the sum of each player's career-high value).",
    example: "Manchester City 2017/18: €971M → €1.52B All-Time Peak is about +57%.",
  },
  avg_age: {
    label: "Avg Age",
    blurb: "The squad's average age as of 1 July that season (just before the season starts).",
    detail:
      "Mean age of the players in the squad, measured on 1 July of the season's start year — the " +
      "same reference date used for player ages across the site, so a player's shown age and the " +
      "squad average always agree.",
    example: "Manchester City's 2017/18 squad averaged about 25.2 — the mean age across the roster on 1 July 2017.",
  },
  squad_size: {
    label: "Squad",
    blurb: "How many players in that season's squad have a recorded market value.",
    detail:
      "The count of players with a value that season. A fully-covered senior squad in this data " +
      "runs roughly 20–27 valued players; well below that usually means the source is missing real " +
      "squad members rather than the squad being genuinely tiny (see Incomplete squad).",
    example: "Manchester City's 2017/18 shows 25 — that many players had a recorded value that season.",
  },
  incomplete_squad: {
    label: "Incomplete squad ⚠",
    blurb: "Flags a season whose roster is too thin to trust — its total squad value is understated.",
    detail:
      "The source dataset's roster coverage is sparse for many clubs and seasons (especially before " +
      "2012 and outside the top leagues). When a season has too few valued players, its squad value " +
      "understates reality, so it's flagged with a ⚠ and hidden by default via the 'Hide incomplete " +
      "squads' toggle (a site-wide setting).",
    example: "A 2013 lower-league season showing only 8 valued players is marked incomplete.",
  },
  league_completeness: {
    label: "League completeness (missing clubs)",
    blurb:
      "Flags a league-season where whole clubs are absent from the data, so the league's combined " +
      "value is understated — different from a thin roster.",
    detail:
      "Separate from an incomplete squad (which is about roster thinness): this checks whether every " +
      "club that actually played a league that season is present in our data, comparing clubs we " +
      "have against the clubs that appeared in that competition's fixtures. If some clubs are missing " +
      "entirely, the league's combined value is understated and isn't a fair comparison against " +
      "fully-covered seasons. Top-flight coverage is otherwise near-complete, so this is a rare " +
      "safety-net flag shown on the league page.",
    example:
      "The Ukrainian Premier League 2022/23 shows 15 of 16 clubs — one club is missing from the data, " +
      "so that season's league total is flagged as understated.",
  },
  result: {
    label: "Result",
    blurb: "The club's league finish that season, plus any cup finals won (🏆).",
    detail:
      "Final league position for the season, with a trophy marker for domestic/continental cups won. " +
      "Promotion (▲) and relegation (▼) markers appear next to the team where detected.",
    example: "'2nd 🏆' means runners-up in the league and a cup won that season.",
  },
  record: {
    label: "Record",
    blurb: "League record as wins–draws–losses for that season.",
    detail: "The club's domestic-league win/draw/loss tally for the season.",
    example: "'28-6-4' is 28 wins, 6 draws, 4 losses.",
  },
  approx_value: {
    label: "≈ Approximate value",
    blurb: "A ≈ marks a value carried from the nearest snapshot because none was recorded in-window.",
    detail:
      "Some players were on a squad for a season but their only nearby valuation lands just outside " +
      "the season window. Rather than drop them (which would understate the squad), the nearest " +
      "snapshot within ~400 days is used and flagged with ≈ and an 'as of' date.",
    example: "'≈ €12M' means €12M is the closest recorded value, not one dated inside that season.",
  },
  todays_money: {
    label: "Today's money & currency",
    blurb: "With 'Today's money' on, historical values are inflation-adjusted to now; the currency selector converts them.",
    detail:
      "Values are stored in euros as recorded at the time. The 'Today's money' toggle adjusts older " +
      "figures for inflation so eras compare fairly; the currency selector converts the displayed " +
      "figure. Single-Year Peak is shown in its own Peak Year's money.",
    example: "A €50M value from 2012 shows higher with 'Today's money' on, reflecting inflation since.",
  },
  fifa_rank: {
    label: "FIFA rank",
    blurb: "The national team's official FIFA world ranking for that period.",
    detail:
      "Historical FIFA/Coca-Cola World Ranking, shown per season on national-team pages and as a " +
      "line on the nation chart.",
    example: "France read #2 in the FIFA ranking around 2018/19, just after winning the 2018 World Cup.",
  },
  intl_goals: {
    label: "International goals",
    blurb: "Goals a player scored for their national team, per season.",
    detail: "Per-season international goals from public national-team match data, shown on nation pages.",
    example: "On France's 2022/23 page, Kylian Mbappé's international-goals column reads 13 for that season.",
  },
  data_freshness: {
    label: "Data freshness",
    blurb: "Market values are frozen upstream since Feb 2026 — games/transfers still update, valuations don't.",
    detail:
      "The primary valuation feed stopped publishing new market values on 2026-02-27 (an upstream " +
      "issue), and the supplementary datalake froze in late 2025. Fixtures, transfers and " +
      "appearances still refresh, but valuations are as of those freeze dates. The footer notes the " +
      "current 'data as of' date.",
    example: "A 2025/26 value reflects the last figure published before the upstream freeze.",
  },
};

// Native-title hover blurb for a stat key ("" if unknown -> no title attr harm).
function statTitle(key) {
  const d = STAT_DOCS[key];
  return d ? d.blurb : "";
}

// A column-header label that links to the data dictionary and carries the blurb
// as a hover title. Use inside a <th> in place of the plain label text.
function statHeaderLabel(key, fallbackLabel) {
  const d = STAT_DOCS[key];
  if (!d) return fallbackLabel || key;
  return `<a class="stat-doc-link" href="data.html#${d.anchorOverride || key}" title="${d.blurb} (click for the data dictionary)">${fallbackLabel || d.label}</a>`;
}

// Maps a table's th[data-key] to its STAT_DOCS entry, so headers can be
// decorated in place without editing each <th>.
const DATA_KEY_TO_DOC = {
  actual_value: "squad_value",
  potential_value: "future_value",
  potential_value_alltime: "alltime_value",
  cohort_peak_value: "peak_together",
  cohort_peak_year: "peak_year",
  cohort_diff_pct: "peak_pct",
  future_diff_pct: "future_pct",
  alltime_diff_pct: "alltime_pct",
  average_age: "avg_age",
  squad_size: "squad_size",
  final_position: "result",
  wins: "record",
};

// Decorate a table's sortable headers with a blurb hover-title plus a small,
// non-sorting "?" that links to the matching data-dictionary term. Idempotent,
// so it's safe to call after every (re)render. `root` is a table element (or
// document); defaults to document.
function decorateStatHeaders(root) {
  const scope = root || document;
  scope.querySelectorAll("th[data-key]").forEach((th) => {
    if (th.dataset.docDecorated) return;
    const docKey = DATA_KEY_TO_DOC[th.dataset.key];
    const d = docKey && STAT_DOCS[docKey];
    if (!d) return;
    th.dataset.docDecorated = "1";
    th.setAttribute("title", d.blurb);
    const q = document.createElement("a");
    q.className = "stat-doc-q";
    q.href = `data.html#${docKey}`;
    q.textContent = "?";
    q.title = "Open the data dictionary";
    q.setAttribute("aria-label", `${d.label} — open the data dictionary`);
    q.addEventListener("click", (e) => e.stopPropagation());
    th.appendChild(q);
  });
}

if (typeof module !== "undefined") module.exports = { STAT_DOCS, statTitle, statHeaderLabel, decorateStatHeaders };
