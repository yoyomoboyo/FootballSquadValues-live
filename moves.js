// Shared transfer-move labeling/tooltip helpers -- used by the Teams page's
// moves panels and roster loan badges, and by the Player page's transfer
// list, since both render the same move-record shape (see
// moves_payload_for()/build_player_moves_index() in precompute.py).

// Player's age at the time of a move. Team move records carry the player's
// birth_year (added in precompute); the transfer's own year is used when a
// real transfer_date is on record, otherwise the season it's attributed to.
// Calendar-year age (no month), matching the "age behind a valuation" framing
// the rest of the site uses. Returns null when no birth year is known.
function moveAge(m, season) {
  if (m == null || m.birth_year == null) return null;
  const yearRef = m.transfer_date ? Number(m.transfer_date.slice(0, 4)) : season;
  if (yearRef == null || Number.isNaN(yearRef)) return null;
  const age = yearRef - m.birth_year;
  return age >= 14 && age < 60 ? age : null;
}

function moveTypeLabel(m) {
  if (m.type === "fee") return "Fee";
  if (m.type === "free") return "Free transfer";
  if (m.type === "loan") return "Loan";
  if (m.type === "loan_return") return "Returned from loan";
  if (m.type === "free_or_loan") return "Free/loan";
  if (m.type === "retired") return "Retired";
  if (m.type === "without_club") return "Left (no club)";
  if (m.type === "career_break") return "Career break";
  if (m.type === "transferred" || m.type === "transferred_in") return "Transferred";
  if (m.type === "signed") return "Signed";
  if (m.type === "untracked_departure") return "Departed";
  return m.type;
}

// Move types the source data has no actual transfer record for at all --
// inferred purely from one season's roster to the next, so there's no fee
// and no way to tell paid vs. free. Everything else ("fee"/"loan"/
// "free_or_loan") is backed by a real transfer record -- either a
// transfers.csv row or the supplementary datalake's transfer_history, whose
// rows carry explicit Loan/Return-from-loan labels (loan can also be
// inferred from a round-trip pattern, but that's high-confidence, not a
// guess).
const INFERRED_MOVE_TYPES = new Set(["transferred", "transferred_in", "signed", "untracked_departure"]);

// Surfaced as a tooltip on the Type cell so a blank Fee column reads as
// "not on record" rather than "the site got the deal wrong" -- the dataset
// simply has no transfer row for most permanent moves of this kind (see
// build_untracked_moves in precompute.py).
function moveSourceTooltip(m) {
  if (m.note) {
    // A hand-verified correction (see manual_transfer_overrides.json in
    // precompute.py) -- the dataset had this move wrong or missing
    // entirely, so this note explains what was checked and where.
    return m.note;
  }
  if (m.type === "free_or_loan") {
    // A real transfers.csv row with a zero/null fee that never round-tripped
    // back to the sending club -- could be a genuine free transfer, a loan
    // still in progress, OR a loan the receiving club later bought out
    // permanently (a buyout is usually its own zero-fee-to-real-fee
    // transfers.csv row for the SAME club pair, which just looks like an
    // ordinary later "Fee" transfer here -- confirmed on real data: this
    // dataset has no case of both the loan leg and the buyout leg tracked
    // together, so there's no separate "loan made permanent" type to show).
    return "A zero/null-fee transfer with no confirmed return -- could be a genuine free transfer, a loan " +
      "still in progress, or a loan later made permanent (which wouldn't show separately from an ordinary " +
      "transfer here). The source dataset doesn't distinguish these without a return leg.";
  }
  if (!INFERRED_MOVE_TYPES.has(m.type)) return null;
  return "Inferred from one season's roster to the next -- neither the primary dataset nor the " +
    "supplementary transfer-history source has a record for this move, so whether it was a fee " +
    "or a free transfer isn't known.";
}

// The dataset has no loan-terms field at all (no option/obligation-to-buy
// flag) -- the only "term" it can ever support is a fee tied to that
// specific transfer row, when one was recorded. Surfaced when present,
// never invented when absent.
function loanFeeSuffix(move, season) {
  return move.transfer_fee_eur ? ` · fee ${Money.fmtMoney(move.transfer_fee_eur, { year: season })}` : "";
}

// One row of a league transfer table (Leagues page's all-time list and the
// League-Year page's per-season panels render the same lean move shape from
// data/leagues/{competition_id}.json).
function leagueTransferRowHTML(m, season) {
  const club = (id, name) => id != null
    ? `<a href="teams.html?club=${id}&year=${season}" target="_blank" rel="noopener">${name || "Club #" + id}</a>`
    : (name || "—");
  return `<tr>
    <td>${seasonLabel(season)}</td>
    <td><a href="player.html?player=${m.player_id}">${m.player_name || m.player_id}</a></td>
    <td>${club(m.from_club_id, m.from_club_name)}</td>
    <td>${club(m.to_club_id, m.to_club_name)}</td>
    <td>${moveTypeLabel(m)}</td>
    <td class="num">${m.transfer_fee_eur ? Money.fmtMoney(m.transfer_fee_eur, { year: season }) : "—"}</td>
    <td class="num">${m.value_at_transfer_eur != null ? Money.fmtMoney(m.value_at_transfer_eur, { year: season }) : "—"}</td>
    <td class="num">${m.future_peak_value_eur != null ? Money.fmtMoney(m.future_peak_value_eur) : "—"}</td>
  </tr>`;
}

function loanTermsTooltip(move, season) {
  const fee = move.transfer_fee_eur
    ? `Loan fee on record: ${Money.fmtMoney(move.transfer_fee_eur, { year: season })}. `
    : "No loan fee on record (most loans show none). ";
  return `Confirmed via a later return to ${move.from_club_name || "their previous club"}. ${fee}`
    + "Buy option/obligation terms aren't in the source dataset, so they can't be shown.";
}
