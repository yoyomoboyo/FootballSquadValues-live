// Home-page globe: one dot per national team, placed at that country's map
// centroid, sized/coloured to show each nation's single most valuable player.
// Click a dot -> a card with the player's face, peak value/year/age, the club
// they were at "at the time", their current club, and links to explore the
// nation and the player in full. Replaces the old Home top-players table.
//
// Data: data/world_110m.json (Natural Earth outline, reused from the club globe)
// + data/nation_top_player.json (per-nation top player) + data/nations_index.json
// (nation name / confederation / crest). Nation coordinates are the country
// polygon's geographic centroid (d3.geoCentroid); a small alias/override map
// covers names that differ from the outline or have no distinct polygon
// (UK home nations, overseas territories, tiny island states).

(function () {
  "use strict";

  var CONF_COLOR = {
    UEFA: "#3b82f6", CONMEBOL: "#eab308", CONCACAF: "#ef4444",
    CAF: "#f97316", AFC: "#22c55e", OFC: "#14b8a6", Other: "#94a3b8",
  };
  var CONF_LABEL = {
    UEFA: "Europe (UEFA)", CONMEBOL: "South America (CONMEBOL)",
    CONCACAF: "N/C America (CONCACAF)", CAF: "Africa (CAF)",
    AFC: "Asia (AFC)", OFC: "Oceania (OFC)", Other: "Other",
  };

  // slug -> outline feature name, where the nation's name differs from the
  // Natural Earth 110m label.
  var NAME_ALIAS = {
    "bosnia-herzegovina": "Bosnia and Herz.",
    "central-african-republic": "Central African Rep.",
    "cote-d-ivoire": "Côte d'Ivoire",
    "czech-republic": "Czechia",
    "dominican-republic": "Dominican Rep.",
    "dr-congo": "Dem. Rep. Congo",
    "equatorial-guinea": "Eq. Guinea",
    "the-gambia": "Gambia",
    "korea-south": "South Korea",
    "turkiye": "Turkey",
    "united-states": "United States of America",
  };

  // slug -> [lon, lat] for nations with no distinct polygon in the 110m outline
  // (UK home nations, overseas territories, small island states).
  var COORD_OVERRIDE = {
    "england": [-1.5, 52.6], "scotland": [-4.2, 56.8], "wales": [-3.8, 52.3],
    "northern-ireland": [-6.5, 54.6], "faroe-islands": [-6.9, 62.0],
    "malta": [14.4, 35.9], "cape-verde": [-23.6, 16.0], "comoros": [43.3, -11.6],
    "reunion": [55.5, -21.1], "antigua-and-barbuda": [-61.8, 17.1],
    "barbados": [-59.5, 13.2], "curacao": [-69.0, 12.2], "grenada": [-61.7, 12.1],
    "guadeloupe": [-61.6, 16.2], "martinique": [-61.0, 14.6],
    "montserrat": [-62.2, 16.7], "french-guiana": [-53.1, 4.0],
  };

  var canvas = document.getElementById("natGlobeCanvas");
  if (!canvas) return; // page without the globe
  var ctx = canvas.getContext("2d");
  var tooltip = document.getElementById("natGlobeTooltip");
  var cardEl = document.getElementById("natGlobeCard");

  var state = {
    nations: [], world: null, land: null, graticule: d3.geoGraticule10(),
    projection: null, path: null, rotate: [-10, -32], scale: 0, baseScale: 0,
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    size: 640, dragging: false, spin: true, hover: null, selected: null,
    visible: [], filters: { conf: "" },
  };

  function norm(s) { return (s || "").toLowerCase().replace(/[^a-z]/g, ""); }

  function buildCoords() {
    var byNorm = {};
    state.world.features.forEach(function (f) { byNorm[norm(f.properties.name)] = f; });
    state.nations.forEach(function (n) {
      var ov = COORD_OVERRIDE[n.slug];
      if (ov) { n.lon = ov[0]; n.lat = ov[1]; return; }
      var feat = byNorm[norm(NAME_ALIAS[n.slug] || n.name || n.slug)];
      if (feat) {
        var c = d3.geoCentroid(feat);
        n.lon = c[0]; n.lat = c[1];
      }
    });
    var missing = state.nations.filter(function (n) { return n.lon == null; });
    state.nations = state.nations.filter(function (n) { return n.lon != null; });
    if (missing.length) console.warn("nation-globe: no coordinate for", missing.map(function (n) { return n.slug; }));
  }

  function radius(n) {
    var v = (n.peak_value || 0) / 1e6;
    return 2.6 + Math.min(4.6, Math.sqrt(v) / 3);
  }

  function activeSet() {
    var c = state.filters.conf;
    return c ? state.nations.filter(function (n) { return n.confederation === c; }) : state.nations;
  }

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function render() {
    var s = state.size, dpr = state.dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, s, s);

    ctx.beginPath(); state.path({ type: "Sphere" });
    ctx.fillStyle = "rgba(56,189,248,0.06)"; ctx.fill();
    ctx.strokeStyle = "rgba(148,163,184,0.35)"; ctx.lineWidth = 1; ctx.stroke();

    ctx.beginPath(); state.path(state.graticule);
    ctx.strokeStyle = "rgba(148,163,184,0.10)"; ctx.lineWidth = 0.5; ctx.stroke();

    ctx.beginPath(); state.path(state.land);
    ctx.fillStyle = "rgba(148,163,184,0.16)"; ctx.fill();
    ctx.beginPath(); state.path(state.land);
    ctx.strokeStyle = "rgba(148,163,184,0.30)"; ctx.lineWidth = 0.4; ctx.stroke();

    var center = [-state.rotate[0], -state.rotate[1]];
    var rScale = Math.min(1.9, Math.sqrt(state.scale / state.baseScale));
    var nations = activeSet();
    state.visible = [];
    for (var i = 0; i < nations.length; i++) {
      var n = nations[i];
      if (d3.geoDistance(center, [n.lon, n.lat]) > 1.57) continue;
      var xy = state.projection([n.lon, n.lat]);
      if (!xy) continue;
      var r = radius(n) * rScale;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = CONF_COLOR[n.confederation] || CONF_COLOR.Other;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      if (n === state.selected) {
        ctx.strokeStyle = cssVar("--text") || "#e2e8f0"; ctx.lineWidth = 2; ctx.stroke();
      }
      state.visible.push({ x: xy[0], y: xy[1], r: r, n: n });
    }

    if (state.hover && state.hover !== state.selected) {
      var h = state.visible.find(function (v) { return v.n === state.hover; });
      if (h) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r + 2.5, 0, 2 * Math.PI);
        ctx.strokeStyle = cssVar("--muted") || "#94a3b8"; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.restore();
  }

  function setSizeToContainer() {
    var wrap = canvas.parentElement;
    var w = Math.max(260, Math.min(560, wrap.clientWidth));
    state.size = w;
    canvas.style.width = w + "px";
    canvas.style.height = w + "px";
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(w * state.dpr);
    if (!state.baseScale) { state.baseScale = w / 2.1; state.scale = state.baseScale; }
    else {
      var ratio = state.scale / state.baseScale;
      state.baseScale = w / 2.1; state.scale = state.baseScale * ratio;
    }
    state.projection = d3.geoOrthographic()
      .translate([w / 2, w / 2]).clipAngle(90)
      .rotate(state.rotate).scale(state.scale);
    state.path = d3.geoPath(state.projection, ctx);
    render();
  }

  // ---- interaction ----
  function pointer(e) {
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return [t.clientX - rect.left, t.clientY - rect.top];
  }
  function onDragStart(e) { state.dragging = true; canvas.classList.add("dragging"); state._last = pointer(e); hideTooltip(); }
  function onDragMove(e) {
    if (!state.dragging) return;
    var p = pointer(e), k = 90 / state.scale, r = state.rotate;
    r[0] += (p[0] - state._last[0]) * k;
    r[1] -= (p[1] - state._last[1]) * k;
    r[1] = Math.max(-90, Math.min(90, r[1]));
    state._last = p;
    state.projection.rotate(r);
    render();
  }
  function onDragEnd() { state.dragging = false; canvas.classList.remove("dragging"); }
  function onWheel(e) {
    e.preventDefault();
    var f = Math.pow(1.0015, -e.deltaY);
    state.scale = Math.max(state.baseScale * 0.9, Math.min(state.baseScale * 9, state.scale * f));
    state.projection.scale(state.scale);
    render();
  }

  function nearest(px, py) {
    var best = null;
    for (var i = 0; i < state.visible.length; i++) {
      var v = state.visible[i], dx = v.x - px, dy = v.y - py, d = dx * dx + dy * dy;
      var thresh = Math.max(144, (v.r + 5) * (v.r + 5));
      if (d < thresh && (best === null || d < best.d)) best = { v: v, d: d };
    }
    return best ? best.v : null;
  }

  function onMove(e) {
    if (state.dragging) return;
    var p = pointer(e), hit = nearest(p[0], p[1]);
    if (hit) {
      if (state.hover !== hit.n) { state.hover = hit.n; render(); }
      showTooltip(hit.n, e);
      canvas.style.cursor = "pointer";
    } else {
      if (state.hover) { state.hover = null; render(); }
      hideTooltip();
      canvas.style.cursor = "grab";
    }
  }

  function onClick(e) {
    var p = pointer(e), hit = nearest(p[0], p[1]);
    if (hit) {
      state.selected = hit.n;
      state.spin = false;
      var spinBox = document.getElementById("natGlobeSpin");
      if (spinBox) spinBox.checked = false;
      rotateTo([-hit.n.lon, -hit.n.lat]);
      renderCard(hit.n);
      render();
    }
  }

  function showTooltip(n, e) {
    tooltip.innerHTML = '<div class="gt-name">' + esc(n.name) + "</div>" +
      '<div class="gt-sub">' + esc(n.player_name) + " · " + Money.fmtMoney(n.peak_value) + "</div>";
    tooltip.style.left = e.clientX + "px";
    tooltip.style.top = e.clientY + "px";
    tooltip.style.opacity = "1";
  }
  function hideTooltip() { tooltip.style.opacity = "0"; }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // Clubs that are placeholders in the source, not real teams.
  var PSEUDO_CLUB = { "Retired": 1, "Without Club": 1, "Career break": 1, "Unknown": 1 };

  function renderCard(n) {
    if (!cardEl) return;
    var initial = esc((n.player_name || "?").slice(0, 1));
    var blank = '<div class="ngc-face ngc-face-blank">' + initial + "</div>";
    var faceImg = n.image_url
      ? '<img class="ngc-face" src="' + esc(n.image_url) + '" alt="" loading="lazy">'
      : blank;
    var crest = n.badge_url ? '<img class="ngc-crest" src="' + esc(n.badge_url) + '" alt="" loading="lazy">' : "";
    var money = n.current_value ? " · " + Money.fmtMoney(n.current_value) : "";
    var nowLine = n.current_club_name
      ? (PSEUDO_CLUB[n.current_club_name] ? esc(n.current_club_name) : "Now at " + esc(n.current_club_name)) + money
      : "";
    cardEl.innerHTML =
      '<div class="ngc-top">' + faceImg +
        '<div class="ngc-head">' +
          '<div class="ngc-nation">' + crest + esc(n.name) +
            ' <span class="ngc-conf">' + esc(CONF_LABEL[n.confederation] || "") + "</span></div>" +
          '<div class="ngc-player">' + esc(n.player_name) + "</div>" +
        "</div></div>" +
      '<div class="ngc-stats">' +
        '<div class="ngc-stat"><span>Peak value</span><b>' + Money.fmtMoney(n.peak_value) +
          "</b> in " + n.peak_year + (n.peak_age != null ? " (age " + n.peak_age + ")" : "") + "</div>" +
        (n.at_time_club_name ? '<div class="ngc-stat"><span>At the time</span>' + esc(n.at_time_club_name) + "</div>" : "") +
        (nowLine ? '<div class="ngc-stat"><span>Today</span>' + nowLine + "</div>" : "") +
      "</div>" +
      '<div class="ngc-links">' +
        '<a href="nations.html?nation=' + encodeURIComponent(n.slug) + '">Explore ' + esc(n.name) + " →</a>" +
        '<a href="player.html?player=' + encodeURIComponent(n.player_id) + '">' + esc(n.player_name) + " page →</a>" +
      "</div>";
    cardEl.classList.add("has-selection");
    var img = cardEl.querySelector("img.ngc-face");
    if (img) img.onerror = function () { this.outerHTML = blank; };
  }

  function rotateTo(target) {
    var start = state.rotate.slice();
    var d0 = ((target[0] - start[0] + 540) % 360) - 180;
    var d1 = target[1] - start[1];
    var dur = 650;
    d3.timer(function (elapsed) {
      var k = Math.min(1, elapsed / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      state.rotate = [start[0] + d0 * e, start[1] + d1 * e];
      state.projection.rotate(state.rotate);
      render();
      if (k >= 1) return true;
    });
  }

  function tick() {
    if (state.spin && !state.dragging) {
      state.rotate[0] += 0.14;
      state.projection.rotate(state.rotate);
      render();
    }
  }

  function buildLegend() {
    var el = document.getElementById("natGlobeLegend");
    if (!el) return;
    el.innerHTML = Object.keys(CONF_LABEL).map(function (k) {
      return '<span><i style="background:' + CONF_COLOR[k] + '"></i>' + CONF_LABEL[k] + "</span>";
    }).join("");
  }

  function wireControls() {
    var conf = document.getElementById("natGlobeConf");
    if (conf) {
      Object.keys(CONF_LABEL).forEach(function (k) {
        if (k === "Other") return;
        var o = document.createElement("option"); o.value = k; o.textContent = CONF_LABEL[k];
        conf.appendChild(o);
      });
      conf.addEventListener("change", function (e) { state.filters.conf = e.target.value; render(); });
    }
    var spin = document.getElementById("natGlobeSpin");
    if (spin) spin.addEventListener("change", function (e) { state.spin = e.target.checked; });

    canvas.addEventListener("mousedown", function () {
      if (state.spin) { state.spin = false; if (spin) spin.checked = false; }
    });
    canvas.addEventListener("mousedown", onDragStart);
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
    canvas.addEventListener("touchstart", onDragStart, { passive: true });
    canvas.addEventListener("touchmove", function (e) { onDragMove(e); }, { passive: true });
    canvas.addEventListener("touchend", onDragEnd);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseleave", function () { state.hover = null; hideTooltip(); render(); });
    canvas.addEventListener("click", onClick);
    window.addEventListener("resize", setSizeToContainer);
    window.addEventListener("moneysettingschange", function () {
      if (state.selected) renderCard(state.selected);
    });
  }

  async function main() {
    try {
      await Money.init();
      var results = await Promise.all([
        Money.loadJSON("data/world_110m.json"),
        Money.loadJSON("data/nation_top_player.json"),
        Money.loadJSON("data/nations_index.json"),
      ]);
      state.world = results[0];
      var meta = {};
      results[2].forEach(function (r) { meta[r.slug] = r; });
      state.nations = results[1].map(function (e) {
        var m = meta[e.slug] || {};
        return {
          slug: e.slug,
          name: m.name || e.slug,
          confederation: m.confederation || "Other",
          badge_url: m.badge_url || null,
          player_id: e.player_id, player_name: e.name, image_url: e.image_url,
          peak_value: e.peak_value, peak_year: e.peak_year, peak_age: e.peak_age,
          at_time_club_name: e.at_time_club_name, at_time_club_id: e.at_time_club_id,
          current_club_name: e.current_club_name, current_club_id: e.current_club_id,
          current_value: e.current_value,
          lon: null, lat: null,
        };
      });
    } catch (err) {
      console.error(err);
      var wrap = document.querySelector(".natglobe-layout");
      if (wrap) wrap.innerHTML = '<p class="muted" style="padding:30px">Could not load the nations globe data.</p>';
      return;
    }
    state.land = { type: "FeatureCollection", features: state.world.features };
    buildCoords();
    buildLegend();
    wireControls();
    setSizeToContainer();
    d3.timer(tick);
  }

  document.addEventListener("DOMContentLoaded", main);
})();
