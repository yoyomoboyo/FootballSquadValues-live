// Shared crest/logo/badge <img> markup with a graceful fallback on 404/null.
// String-based (not a DOM builder) to match the template-literal + innerHTML
// style already used throughout app.js.

const DEFAULT_LOGO_FALLBACK = "assets/crest-placeholder.svg";
const DEFAULT_PLAYER_FALLBACK = "assets/player-placeholder.svg";

function logoImgHTML(url, altText, { size = "sm", fallback = DEFAULT_LOGO_FALLBACK } = {}) {
  const safeAlt = String(altText || "").replace(/"/g, "&quot;");
  const safeUrl = url || fallback;
  return (
    `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" class="logo logo-${size}" ` +
    `onerror="this.onerror=null;this.src='${fallback}';this.classList.add('logo-fallback');">`
  );
}

function playerImgHTML(url, altText, { size = "sm" } = {}) {
  const safeAlt = String(altText || "").replace(/"/g, "&quot;");
  const safeUrl = url || DEFAULT_PLAYER_FALLBACK;
  return (
    `<img src="${safeUrl}" alt="${safeAlt}" loading="lazy" class="player-photo player-photo-${size}" ` +
    `onerror="this.onerror=null;this.src='${DEFAULT_PLAYER_FALLBACK}';this.classList.add('logo-fallback');">`
  );
}

function competitionLogoUrl(competitionId) {
  return `https://tmssl.akamaized.net/images/logo/header/${competitionId}.png`;
}
