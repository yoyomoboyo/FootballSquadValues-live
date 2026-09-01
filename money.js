// Shared currency/inflation/value-basis settings + conversion helpers.
// Loaded on every page before nav.js/app.js/teams.js. No runtime external
// API calls -- everything comes from the precomputed data/fx_cpi.json.

const Money = (() => {
  const STORAGE_KEY = "svt_money_settings_v1";
  const DEFAULTS = { currency: "EUR", inflationAdjust: false, valueBasis: "future" };
  const SYMBOLS = { EUR: "€", USD: "$", GBP: "£" };

  let FX = {};
  let CPI = {};
  let CPI_BASE_YEAR = null;
  let LATEST_FX_YEAR = null;
  let readyPromise = null;

  // In-memory cache -- convertEur()/fmtMoney() call getSettings() once (or
  // twice) per money cell, and a big table re-render can mean well over
  // 100k calls in one go. Re-reading + JSON.parse-ing localStorage that
  // often adds up (measured: ~10k calls/ms, so tens of ms on the Team
  // Seasons page alone), for a value that's only actually written by
  // setSettings() below -- cache it in memory and keep the two in sync,
  // rather than re-reading storage on every single call.
  let cachedSettings = null;

  function getSettings() {
    if (cachedSettings) return cachedSettings;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      cachedSettings = { ...DEFAULTS, ...stored };
    } catch (e) {
      cachedSettings = { ...DEFAULTS };
    }
    return cachedSettings;
  }

  function setSettings(partial) {
    const merged = { ...getSettings(), ...partial };
    cachedSettings = merged;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      // localStorage unavailable (e.g. private browsing) -- setting still
      // applies for this page load via the dispatched event, just won't persist.
    }
    window.dispatchEvent(new CustomEvent("moneysettingschange", { detail: merged }));
    return merged;
  }

  async function loadJSON(path) {
    // Precomputed data changes monthly at the same URLs; without this,
    // browsers can heuristically cache a JSON response for days (no
    // Cache-Control from a plain static host), silently showing stale data
    // after a refresh until the user hard-reloads.
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${path}: ${res.status}`);
    return res.json();
  }

  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = loadJSON("data/fx_cpi.json")
      .then((d) => {
        FX = d.fx_rates_annual || {};
        CPI = d.cpi_eurozone_annual || {};
        CPI_BASE_YEAR = d.cpi_base_year != null ? String(d.cpi_base_year) : null;
        LATEST_FX_YEAR = d.latest_fx_year != null ? String(d.latest_fx_year) : null;
      })
      .catch((err) => {
        console.error("Failed to load data/fx_cpi.json -- currency conversion will no-op.", err);
        FX = {}; CPI = {}; CPI_BASE_YEAR = null; LATEST_FX_YEAR = null;
      });
    return readyPromise;
  }

  // amountEur: a plain EUR figure. year: the season/point in time it
  // pertains to (nullable -> treated as "current/latest").
  function convertEur(amountEur, { year } = {}) {
    if (amountEur == null || isNaN(amountEur)) return null;
    const { currency, inflationAdjust } = getSettings();
    const yearKey = year != null ? String(year) : null;
    let value = amountEur;
    let fxYear = (yearKey != null && FX[yearKey]) ? yearKey : LATEST_FX_YEAR;

    if (inflationAdjust && CPI_BASE_YEAR != null) {
      // Deflate to base-year EUR terms FIRST (nominal -> real, still EUR),
      // THEN convert using the BASE year's FX rate -- using the historical
      // year's FX rate after deflating would reintroduce a stale exchange
      // rate inconsistent with a "today's money" framing.
      const cpiThen = (yearKey != null && CPI[yearKey] != null) ? CPI[yearKey] : CPI[CPI_BASE_YEAR];
      const cpiBase = CPI[CPI_BASE_YEAR];
      if (cpiThen) value = value * (cpiBase / cpiThen);
      fxYear = CPI_BASE_YEAR;
    }

    if (currency !== "EUR") {
      const rates = (fxYear != null && FX[fxYear]) ? FX[fxYear] : FX[LATEST_FX_YEAR];
      if (rates && rates[currency] != null) value = value * rates[currency];
    }
    return value;
  }

  // Format a number that is ALREADY in the display currency (e.g. chart data
  // that was pre-converted point-by-point via convertEur) -- no conversion.
  function fmtConverted(amount) {
    if (amount == null || isNaN(amount)) return "—";
    const symbol = SYMBOLS[getSettings().currency] || "€";
    const abs = Math.abs(amount);
    const sign = amount < 0 ? "-" : "";
    if (abs >= 1e9) return sign + symbol + (abs / 1e9).toFixed(2) + "B";
    if (abs >= 1e6) return sign + symbol + (abs / 1e6).toFixed(1) + "M";
    if (abs >= 1e3) return sign + symbol + (abs / 1e3).toFixed(0) + "K";
    return sign + symbol + Math.round(abs);
  }

  function fmtMoney(amountEur, { year } = {}) {
    return fmtConverted(convertEur(amountEur, { year }));
  }

  // Pick the future-looking or all-time-peak field from a record depending
  // on the current value-basis setting, e.g.
  // Money.pickPeak(row, "potential_value", "potential_value_alltime").
  function pickPeak(obj, futureKey, alltimeKey) {
    if (!obj) return null;
    return getSettings().valueBasis === "alltime" ? obj[alltimeKey] : obj[futureKey];
  }

  // Human-readable name for the active value-basis setting, so every column
  // header/chart legend/KPI label that shows a "potential"/"peak" figure can
  // say which definition it is instead of leaving that implicit.
  function peakLabel() {
    return getSettings().valueBasis === "alltime" ? "All-time peak" : "Future peak";
  }

  // Unit suffix for a millions-denominated figure in the active currency,
  // e.g. "(€M)" / "($M)" / "(£M)" -- for filter/input labels.
  function unitLabel() {
    return `(${SYMBOLS[getSettings().currency] || "€"}M)`;
  }

  return {
    getSettings, setSettings, init, convertEur, fmtMoney, fmtConverted, loadJSON, pickPeak,
    peakLabel, unitLabel,
  };
})();
