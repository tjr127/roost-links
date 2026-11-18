// ===================================================================
// Guests in league-night tee-time groups (added Nov 18, 2026, Ty: "add Mike to the late group").
// League nights stay league-members-only for players, but Ty (admin) can put an active guest into Early or
// Late from Admin > Schedule ("Not in a group" list, tagged "guest"). Once Ty has set a guest's pick (a
// Tee Times row for that night with Early / Late / Either, or a group), the guest is part of that night's
// card like a league member: suggestion, 3 PM auto-close, groups alert text (with tees).
// Guests still get no alerts (recipients stay teeLeague_), aren't reminded, and get no tee time defaults.
// Edits in Web.gs: teePlayers_ replaced by this version; apiTee_ (league-tees) and apiTeeConfirm_ set
// TEE_GUESTS_OK_ for admins; teeConfirmAs_ uses teePlayers_ instead of teeLeague_; teeTimes_ (league-tees)
// adds t.guests.
// ===================================================================
var TEE_GUESTS_OK_ = false;   // true while an admin request runs: every active guest may be picked / grouped

/** Active guests (Players type not League, Active TRUE). */
function teeGuests_(ss) {
  return ss.getSheetByName('Players').getRange('A2:C40').getDisplayValues()
    .filter(function (r) { return r[0] && r[1] !== 'League' && r[2] === 'TRUE'; })
    .map(function (r) { return r[0]; });
}

/** Who is on the card: casual round = every active player; league night = league members plus guests Ty added. */
function teePlayers_(ss) {
  var guests = teeGuests_(ss);
  if (teeCasual_(ss)) return teeLeague_(ss).concat(guests);
  var league = teeLeague_(ss);
  if (TEE_GUESTS_OK_) return league.concat(guests);
  var night = teeNight_(ss);
  if (!night || !guests.length) return league;
  var rows = teeRows_(ss, night.key);
  return league.concat(guests.filter(function (n) {
    var r = rows[n];
    return r && (r.choice === 'Early' || r.choice === 'Late' || r.choice === 'Either' || r.group === 'Early' || r.group === 'Late');
  }));
}
