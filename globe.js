// Spinnable orthographic world globe of every geolocated club.
// Data: data/clubs_geo.json (built by precompute.build_clubs_geo, coords from
// the committed Wikidata extract) + data/world_110m.json (Natural Earth 110m
// outline). Rendered on a canvas for smooth rotation with a few thousand
// markers. Confederation is derived from each club's position (point-in-country
// against the world outline) so it works even where clubs.json lacks a country.

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
  var CONTINENT_CONF = {
    "Europe": "UEFA", "South America": "CONMEBOL", "North America": "CONCACAF",
    "Africa": "CAF", "Asia": "AFC", "Oceania": "OFC",
  };
  // approx [lon, lat] to recentre the globe on when a confederation is picked
  var CONF_CENTROID = {
    UEFA: [15, 50], CONMEBOL: [-58, -20], CONCACAF: [-95, 22],
    CAF: [20, 2], AFC: [90, 30], OFC: [170, -22],
  };
  // Football confederation != geography for these: transcontinental or
  // cross-affiliated countries. Applied by name over the position-derived
  // continent so e.g. Turkish/Russian clubs read UEFA, not AFC.
  var COUNTRY_CONF_OVERRIDE = {
    "Türkiye": "UEFA", "Turkey": "UEFA", "Russia": "UEFA", "Kazakhstan": "UEFA",
    "Israel": "UEFA", "Cyprus": "UEFA", "Georgia": "UEFA", "Armenia": "UEFA",
    "Azerbaijan": "UEFA", "Australia": "AFC",
  };

  var canvas = document.getElementById("globeCanvas");
  var ctx = canvas.getContext("2d");
  var tooltip = document.getElementById("globeTooltip");

  var state = {
    clubs: [], world: null, land: null, borders: null, graticule: d3.geoGraticule10(),
    projection: null, path: null, rotate: [-10, -25], scale: 0, baseScale: 0,
    dpr: Math.max(1, Math.min(2, window.devicePixelRatio || 1)),
    size: 720, dragging: false, spin: true, hover: null,
    visible: [], // {x,y,club} for hit-testing, refreshed each render
    filters: { conf: "", tier: "", active: false },
  };

  // ---- coarse lon/lat -> confederation fallback (for coords not inside any
  // 110m polygon: small islands, offshore stadiums) ----
  function coarseConf(lon, lat) {
    if (lon >= -82 && lon <= -34 && lat <= 13) return "CONMEBOL";
    if (lon >= -170 && lon <= -52 && lat > 13) return "CONCACAF";
    if (lon >= -30 && lon <= 45 && lat >= 34) return "UEFA";
    if (lon >= -20 && lon <= 52 && lat < 34 && lat > -37) return "CAF";
    if (lon >= 112 && lat < -10) return "OFC";
    if (lon > 25) return "AFC";
    return "Other";
  }

  // Assign confederation to each club once (bbox pre-filter + geoContains).
  function assignConfederations() {
    var feats = state.world.features.map(function (f) {
      return { f: f, b: d3.geoBounds(f), conf: CONTINENT_CONF[f.properties.continent] || "Other" };
    });
    state.clubs.forEach(function (c) {
      if (c.country_name && COUNTRY_CONF_OVERRIDE[c.country_name]) {
        c.conf = COUNTRY_CONF_OVERRIDE[c.country_name];
        return;
      }
      var p = [c.lon, c.lat], hit = null;
      for (var i = 0; i < feats.length; i++) {
        var b = feats[i].b;
        if (p[0] < b[0][0] || p[0] > b[1][0] || p[1] < b[0][1] || p[1] > b[1][1]) continue;
        if (d3.geoContains(feats[i].f, p)) { hit = feats[i].conf; break; }
      }
      c.conf = hit || coarseConf(c.lon, c.lat);
    });
  }

  function tierRadius(c) {
    if (c.tier === 1) return 3.3;
    if (c.tier === 2) return 2.3;
    if (c.tier >= 3) return 1.8;
    return 2.7; // unknown tier: mostly unmapped top flights
  }

  function activeSet() {
    var f = state.filters;
    return state.clubs.filter(function (c) {
      if (f.conf && c.conf !== f.conf) return false;
      if (f.tier === "1" && c.tier !== 1) return false;
      if (f.tier === "2" && !(c.tier === 1 || c.tier === 2)) return false;
      if (f.active && !(c.last_season && c.last_season >= 2020)) return false;
      return true;
    });
  }

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function render() {
    var s = state.size, dpr = state.dpr;
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, s, s);

    // ocean sphere
    ctx.beginPath(); state.path({ type: "Sphere" });
    ctx.fillStyle = "rgba(56,189,248,0.06)"; ctx.fill();
    ctx.strokeStyle = "rgba(148,163,184,0.35)"; ctx.lineWidth = 1; ctx.stroke();

    // graticule
    ctx.beginPath(); state.path(state.graticule);
    ctx.strokeStyle = "rgba(148,163,184,0.10)"; ctx.lineWidth = 0.5; ctx.stroke();

    // land + borders
    ctx.beginPath(); state.path(state.land);
    ctx.fillStyle = "rgba(148,163,184,0.16)"; ctx.fill();
    ctx.beginPath(); state.path(state.borders);
    ctx.strokeStyle = "rgba(148,163,184,0.30)"; ctx.lineWidth = 0.4; ctx.stroke();

    // markers (near hemisphere only)
    var center = [-state.rotate[0], -state.rotate[1]];
    var rScale = Math.min(1.9, Math.sqrt(state.scale / state.baseScale));
    var clubs = activeSet();
    state.visible = [];
    for (var i = 0; i < clubs.length; i++) {
      var c = clubs[i];
      if (d3.geoDistance(center, [c.lon, c.lat]) > 1.5) continue;
      var xy = state.projection([c.lon, c.lat]);
      if (!xy) continue;
      var r = tierRadius(c) * rScale;
      ctx.beginPath();
      ctx.arc(xy[0], xy[1], r, 0, 2 * Math.PI);
      ctx.fillStyle = CONF_COLOR[c.conf] || CONF_COLOR.Other;
      ctx.globalAlpha = c.has_team_data ? 0.92 : 0.4;
      ctx.fill();
      ctx.globalAlpha = 1;
      state.visible.push({ x: xy[0], y: xy[1], r: r, c: c });
    }

    // highlight hovered
    if (state.hover) {
      var h = state.visible.find(function (v) { return v.c === state.hover; });
      if (h) {
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r + 2.5, 0, 2 * Math.PI);
        ctx.strokeStyle = cssVar("--text") || "#e2e8f0"; ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.restore();
  }

  function setSizeToContainer() {
    var wrap = canvas.parentElement;
    var w = Math.max(280, Math.min(720, wrap.clientWidth));
    state.size = w;
    canvas.style.width = w + "px";
    canvas.style.height = w + "px";
    canvas.width = Math.round(w * state.dpr);
    canvas.height = Math.round(w * state.dpr);
    if (!state.baseScale) { state.baseScale = w / 2.1; state.scale = state.baseScale; }
    else { // keep zoom ratio on resize
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
  function onDragStart(e) {
    state.dragging = true; canvas.classList.add("dragging");
    state._last = pointer(e);
    hideTooltip();
  }
  function onDragMove(e) {
    if (!state.dragging) return;
    var p = pointer(e), k = 90 / state.scale;
    var r = state.rotate;
    r[0] += (p[0] - state._last[0]) * k;
    r[1] -= (p[1] - state._last[1]) * k;
    r[1] = Math.max(-90, Math.min(90, r[1]));
    state._last = p;
    state.projection.rotate(r);
    render();
  }
  function onDragEnd() { state.dragging = false; canvas.classList.remove("dragging"); }

  function pointer(e) {
    var rect = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return [t.clientX - rect.left, t.clientY - rect.top];
  }

  function onWheel(e) {
    e.preventDefault();
    var f = Math.pow(1.0015, -e.deltaY);
    state.scale = Math.max(state.baseScale * 0.9, Math.min(state.baseScale * 9, state.scale * f));
    state.projection.scale(state.scale);
    render();
  }

  function nearest(px, py) {
    var best = null, bd = 12 * 12;
    for (var i = 0; i < state.visible.length; i++) {
      var v = state.visible[i], dx = v.x - px, dy = v.y - py, d = dx * dx + dy * dy;
      var thresh = Math.max(bd, (v.r + 4) * (v.r + 4));
      if (d < thresh && (best === null || d < best.d)) best = { v: v, d: d };
    }
    return best ? best.v : null;
  }

  function onMove(e) {
    if (state.dragging) return;
    var p = pointer(e), hit = nearest(p[0], p[1]);
    if (hit) {
      if (state.hover !== hit.c) { state.hover = hit.c; render(); }
      showTooltip(hit.c, e);
      canvas.style.cursor = hit.c.has_team_data ? "pointer" : "grab";
    } else {
      if (state.hover) { state.hover = null; render(); }
      hideTooltip();
      canvas.style.cursor = "grab";
    }
  }

  function onClick(e) {
    var p = pointer(e), hit = nearest(p[0], p[1]);
    if (hit && hit.c.has_team_data) {
      var y = hit.c.last_season ? "&year=" + hit.c.last_season : "";
      window.location.href = "teams.html?club=" + hit.c.club_id + y;
    }
  }

  function showTooltip(c, e) {
    var sub = [];
    if (c.competition_name) sub.push(c.competition_name.replace(/-/g, " "));
    if (c.country_name) sub.push(c.country_name);
    else sub.push(CONF_LABEL[c.conf] || "");
    tooltip.innerHTML = '<div class="gt-name">' + (c.name || "Club #" + c.club_id) + "</div>" +
      '<div class="gt-sub">' + sub.filter(Boolean).join(" · ") +
      (c.has_team_data ? "" : " · no page yet") + "</div>";
    tooltip.style.left = e.clientX + "px";
    tooltip.style.top = e.clientY + "px";
    tooltip.style.opacity = "1";
  }
  function hideTooltip() { tooltip.style.opacity = "0"; }

  // Smoothly rotate the globe to a target [λ, φ] rotation over ~700ms.
  function rotateTo(target) {
    var start = state.rotate.slice();
    var d0 = ((target[0] - start[0] + 540) % 360) - 180; // shortest way round
    var d1 = target[1] - start[1];
    var t0 = null, dur = 700;
    var wasSpin = state.spin; state.spin = false;
    d3.timer(function (elapsed) {
      var k = Math.min(1, elapsed / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      state.rotate = [start[0] + d0 * e, start[1] + d1 * e];
      state.projection.rotate(state.rotate);
      render();
      if (k >= 1) { state.spin = wasSpin; return true; }
    });
  }

  function tick() {
    if (state.spin && !state.dragging) {
      state.rotate[0] += 0.16;
      state.projection.rotate(state.rotate);
      render();
    }
  }

  function buildLegend() {
    var el = document.getElementById("globeLegend");
    el.innerHTML = Object.keys(CONF_LABEL).map(function (k) {
      return '<span><i style="background:' + CONF_COLOR[k] + '"></i>' + CONF_LABEL[k] + "</span>";
    }).join("");
  }

  function fillConfSelect() {
    var sel = document.getElementById("globeConf");
    Object.keys(CONF_LABEL).forEach(function (k) {
      if (k === "Other") return;
      var o = document.createElement("option"); o.value = k; o.textContent = CONF_LABEL[k];
      sel.appendChild(o);
    });
  }

  function updateStat() {
    var n = activeSet().length;
    document.getElementById("globeStat").textContent = n.toLocaleString() + " clubs shown";
  }

  function wireControls() {
    document.getElementById("globeConf").addEventListener("change", function (e) {
      state.filters.conf = e.target.value; updateStat();
      var cen = CONF_CENTROID[e.target.value];
      if (cen) rotateTo([-cen[0], -cen[1]]);
      else render();
    });
    document.getElementById("globeTier").addEventListener("change", function (e) {
      state.filters.tier = e.target.value; updateStat(); render();
    });
    document.getElementById("globeActive").addEventListener("change", function (e) {
      state.filters.active = e.target.checked; updateStat(); render();
    });
    document.getElementById("globeSpin").addEventListener("change", function (e) {
      state.spin = e.target.checked;
    });

    // stop auto-spin the first time the user grabs the globe
    canvas.addEventListener("mousedown", function () {
      if (state.spin) { state.spin = false; document.getElementById("globeSpin").checked = false; }
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
  }

  async function main() {
    try {
      var results = await Promise.all([
        Money.loadJSON("data/world_110m.json"),
        Money.loadJSON("data/clubs_geo.json"),
      ]);
      state.world = results[0];
      state.clubs = results[1];
    } catch (err) {
      document.querySelector(".globe-wrap").innerHTML =
        '<p class="muted" style="padding:40px">Could not load globe data. ' +
        "The map layer is generated at build time — if this persists the data build may not have run.</p>";
      console.error(err);
      return;
    }
    state.land = { type: "FeatureCollection", features: state.world.features };
    state.borders = state.land;
    assignConfederations();
    buildLegend();
    fillConfSelect();
    wireControls();
    setSizeToContainer();
    updateStat();
    d3.timer(tick);
  }

  document.addEventListener("DOMContentLoaded", main);
})();
