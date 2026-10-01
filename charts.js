// Promotion/relegation timeline markers shared by the dashboard chart and
// the Teams page squad-value chart.
//
// seasonsInfo: [{season, status, tier, label}] sorted by season ascending,
// one entry per plotted point.
//   status: "top_flight" | "lower" | "unknown"
//   tier:   numeric division level when known (1 = top flight; 2+ via
//           ClubElo), null when only "somewhere lower" is known
//   label:  display name for that season's league ("GB1", "Championship",
//           "Serie B", ...), null if unknown
// unknown = season predates data coverage; no mark is ever inferred from it.
// A transition is only marked between two CONSECUTIVE seasons.

function _tierOf(info) {
  if (info.status === "top_flight") return 1;
  if (info.status === "lower") return info.tier || null;
  return null;
}

function leagueTransitionMarkers(seasonsInfo, baseColor) {
  const n = seasonsInfo.length;
  const pointStyle = new Array(n).fill("circle");
  const pointRadius = new Array(n).fill(3);
  const pointRotation = new Array(n).fill(0);
  const pointBackgroundColor = new Array(n).fill(baseColor);
  const transitions = new Array(n).fill(null);

  const promote = (i, cur) => {
    pointStyle[i] = "triangle";
    pointRadius[i] = 7;
    pointBackgroundColor[i] = "#22c55e";
    transitions[i] = `▲ Promoted to ${cur.label || "the top flight"}`;
  };
  const relegate = (i, cur) => {
    pointStyle[i] = "triangle";
    pointRotation[i] = 180;
    pointRadius[i] = 7;
    pointBackgroundColor[i] = "#f87171";
    transitions[i] = `▼ Relegated to ${cur.label || "a lower division"}`;
  };

  for (let i = 1; i < n; i++) {
    const prev = seasonsInfo[i - 1];
    const cur = seasonsInfo[i];
    if (cur.season !== prev.season + 1) continue;
    if (prev.status === "unknown" || cur.status === "unknown") continue;
    const prevT = _tierOf(prev);
    const curT = _tierOf(cur);
    if (prevT != null && curT != null) {
      if (curT < prevT) promote(i, cur);
      else if (curT > prevT) relegate(i, cur);
    } else if (prev.status === "top_flight" && cur.status === "lower") {
      relegate(i, cur);
    } else if (prev.status === "lower" && cur.status === "top_flight") {
      promote(i, cur);
    }
    // lower-with-known-tier vs lower-with-unknown-tier: direction can't be
    // determined, so no mark.
  }
  return { pointStyle, pointRadius, pointRotation, pointBackgroundColor, transitions };
}

function transitionNoteHTML(transitions) {
  const any = transitions.some((t) => t != null);
  return any ? `<span class="promo">▲ promoted</span> &nbsp; <span class="releg">▼ relegated</span>` : "";
}
