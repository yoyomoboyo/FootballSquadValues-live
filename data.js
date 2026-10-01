// Renders the data-dictionary page from STAT_DOCS (stat-docs.js) so the page and
// the hover blurbs used everywhere else stay in sync. Each term's section id is
// its STAT_DOCS key, matching the #anchors that statHeaderLabel() links to.

const DICT_GROUPS = [
  {
    title: "Squad value",
    intro: "The money columns on the season tables. First, what these values are (and aren't) — then the 'at the time' value, and three different peaks. None of the peaks is a forecast; they're all built from real recorded values.",
    keys: ["market_value", "squad_value", "future_value", "alltime_value", "peak_together", "peak_year",
           "peak_pct", "future_pct", "alltime_pct"],
  },
  {
    title: "Squad make-up",
    intro: "Who was in the squad and how complete our picture of it is.",
    keys: ["avg_age", "squad_size", "incomplete_squad", "league_completeness", "approx_value"],
  },
  {
    title: "Results",
    intro: "How the club did on the pitch that season.",
    keys: ["result", "record"],
  },
  {
    title: "National teams",
    intro: "Extra columns on the nations pages.",
    keys: ["fifa_rank", "intl_goals"],
  },
  {
    title: "Display & data notes",
    intro: "Settings that change how numbers are shown, and how fresh the underlying data is.",
    keys: ["todays_money", "data_freshness"],
  },
];

function renderDictionary() {
  const index = document.getElementById("dictIndex");
  const body = document.getElementById("dictBody");

  index.innerHTML = DICT_GROUPS
    .map((g) => g.keys.map((k) => STAT_DOCS[k]
      ? `<a href="#${k}">${STAT_DOCS[k].label}</a>` : "").join(""))
    .join("");

  body.innerHTML = DICT_GROUPS
    .map((g) => `
      <section class="panel dict-group">
        <h2>${g.title}</h2>
        <p class="muted dict-group-intro">${g.intro}</p>
        ${g.keys.map((k) => {
          const d = STAT_DOCS[k];
          if (!d) return "";
          return `
            <div class="dict-term" id="${k}">
              <h3>${d.label}</h3>
              <p>${d.detail}</p>
              <p class="dict-example"><span class="dict-example-tag">Example</span> ${d.example}</p>
            </div>`;
        }).join("")}
      </section>`)
    .join("");

  // Smooth-scroll + brief highlight when arriving via an anchor from another page.
  function flashTarget() {
    const id = location.hash.slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("dict-flash");
      void el.offsetWidth; // restart the animation
      el.classList.add("dict-flash");
    }
  }
  window.addEventListener("hashchange", flashTarget);
  flashTarget();
}

renderDictionary();
