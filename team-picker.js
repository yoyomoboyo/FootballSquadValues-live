// Shared nation -> league -> team cascade + independent search box, used by
// both the Teams page (one season's roster/performance/moves) and the
// Franchise page (a team's whole history). Every page using this expects
// the same DOM ids: nationSelect, leagueSelect, teamSelect, teamSearchInput,
// teamSearchResults, and (optionally) top5Toggle. Manages the `club` URL
// query param itself (via history.replaceState, so picking doesn't add
// browser-history entries) since that part is identical on both pages;
// anything page-specific (e.g. the Teams page's extra `year` param) is left
// to the page's own onTeamPicked callback.

const TeamPicker = (() => {
  const TOP5_COMPETITION_IDS = new Set(["GB1", "ES1", "IT1", "L1", "FR1"]);

  let countries = [], competitions = [], clubs = [], clubsById = {};
  const state = { nationId: null, leagueId: null, clubId: null };
  let syncingFromPick = false;
  let onPick = () => {};

  function top5Enabled() {
    const el = document.getElementById("top5Toggle");
    return el ? el.checked : false;
  }

  function populateNationOptions() {
    const sel = document.getElementById("nationSelect");
    const sorted = [...countries]
      .filter((c) => c.total_clubs > 0)
      .sort((a, b) => (a.country_name || "").localeCompare(b.country_name || ""));
    sel.innerHTML =
      `<option value="">Any nation</option>` +
      sorted.map((c) => `<option value="${c.country_id}">${c.country_name}</option>`).join("");
  }

  function populateLeagueOptions() {
    const sel = document.getElementById("leagueSelect");
    let domestic = competitions.filter((c) => c.type === "domestic_league");
    if (top5Enabled()) domestic = domestic.filter((c) => TOP5_COMPETITION_IDS.has(c.competition_id));
    const filtered = state.nationId
      ? domestic.filter((c) => String(c.country_id) === String(state.nationId))
      : domestic;
    const sorted = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    sel.innerHTML =
      `<option value="">Any league</option>` +
      sorted.map((c) => `<option value="${c.competition_id}">${prettifyLeagueName(c.name)}${c.country_name ? " (" + c.country_name + ")" : ""}</option>`).join("");
  }

  function populateTeamSelectOptions() {
    const sel = document.getElementById("teamSelect");
    let filtered = clubs.filter((c) => c.has_team_data && c.name);
    if (top5Enabled()) filtered = filtered.filter((c) => TOP5_COMPETITION_IDS.has(c.competition_id));
    if (state.nationId) filtered = filtered.filter((c) => String(c.country_id) === String(state.nationId));
    if (state.leagueId) filtered = filtered.filter((c) => String(c.competition_id) === String(state.leagueId));
    const sorted = [...filtered].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    sel.innerHTML =
      `<option value="">Choose a team…</option>` +
      sorted.map((c) => `<option value="${c.club_id}">${c.name}${c.competition_name ? " — " + prettifyLeagueName(c.competition_name) : ""}</option>`).join("");
    sel.value = state.clubId || "";
  }

  function wireControls() {
    const nationSelect = document.getElementById("nationSelect");
    const leagueSelect = document.getElementById("leagueSelect");
    const teamSelect = document.getElementById("teamSelect");
    const searchInput = document.getElementById("teamSearchInput");
    const searchResults = document.getElementById("teamSearchResults");
    const top5Toggle = document.getElementById("top5Toggle");

    nationSelect.addEventListener("change", (e) => {
      state.nationId = e.target.value || null;
      if (!syncingFromPick) state.leagueId = null;
      populateLeagueOptions();
      if (!syncingFromPick) leagueSelect.value = "";
      populateTeamSelectOptions();
      if (!syncingFromPick) {
        state.clubId = null;
        onPick(null, null);
      }
    });

    leagueSelect.addEventListener("change", (e) => {
      state.leagueId = e.target.value || null;
      populateTeamSelectOptions();
      if (!syncingFromPick) {
        state.clubId = null;
        onPick(null, null);
      }
    });

    teamSelect.addEventListener("change", (e) => {
      if (e.target.value) pick(e.target.value);
    });

    if (top5Toggle) {
      top5Toggle.addEventListener("change", () => {
        populateLeagueOptions();
        if (state.leagueId && !TOP5_COMPETITION_IDS.has(state.leagueId) && top5Enabled()) {
          state.leagueId = null;
          leagueSelect.value = "";
        }
        populateTeamSelectOptions();
      });
    }

    searchInput.addEventListener("input", () => {
      const q = searchInput.value.trim().toLowerCase();
      if (!q) {
        searchResults.hidden = true;
        searchResults.innerHTML = "";
        return;
      }
      let candidates = clubs.filter((c) => c.has_team_data && c.name && c.name.toLowerCase().includes(q));
      if (top5Enabled()) candidates = candidates.filter((c) => TOP5_COMPETITION_IDS.has(c.competition_id));
      const matches = candidates.slice(0, 20);
      searchResults.innerHTML = matches
        .map((c) => `<li data-club-id="${c.club_id}">${c.name}${c.competition_name ? ` <span class="muted">— ${prettifyLeagueName(c.competition_name)}</span>` : ""}</li>`)
        .join("");
      searchResults.hidden = matches.length === 0;
    });

    searchResults.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-club-id]");
      if (!li) return;
      const clubId = li.dataset.clubId;
      searchInput.value = clubsById[clubId] ? clubsById[clubId].name : "";
      searchResults.hidden = true;
      searchResults.innerHTML = "";
      pick(clubId);
    });

    document.addEventListener("click", (e) => {
      if (!searchResults.contains(e.target) && e.target !== searchInput) {
        searchResults.hidden = true;
      }
    });
  }

  function pick(clubId, extra) {
    const club = clubsById[String(clubId)];
    if (!club) return;
    state.clubId = String(clubId);

    syncingFromPick = true;
    document.getElementById("nationSelect").value = club.country_id != null ? String(club.country_id) : "";
    state.nationId = club.country_id != null ? String(club.country_id) : null;
    populateLeagueOptions();
    document.getElementById("leagueSelect").value = club.competition_id || "";
    state.leagueId = club.competition_id || null;
    populateTeamSelectOptions();
    syncingFromPick = false;

    const params = new URLSearchParams(location.search);
    params.set("club", state.clubId);
    history.replaceState(null, "", `${location.pathname}?${params}`);

    onPick(state.clubId, club, extra);
  }

  // options: { onTeamPicked(clubId, club, extra), initialClubId, initialExtra }
  async function init(options = {}) {
    onPick = options.onTeamPicked || (() => {});
    [countries, competitions, clubs] = await Promise.all([
      Money.loadJSON("data/countries.json"),
      Money.loadJSON("data/competitions.json"),
      Money.loadJSON("data/clubs.json"),
    ]);
    clubsById = Object.fromEntries(clubs.map((c) => [String(c.club_id), c]));

    populateNationOptions();
    populateLeagueOptions();
    populateTeamSelectOptions();
    wireControls();

    if (options.initialClubId && clubsById[options.initialClubId]) {
      pick(options.initialClubId, options.initialExtra);
    }

    return { countries, competitions, clubs, clubsById };
  }

  return { init, pick, get clubsById() { return clubsById; }, get clubs() { return clubs; } };
})();
