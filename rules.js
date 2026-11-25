/*
 * Team game rules (Nov 13, 2026). Plain-language explanations for every game on the Team Game tab,
 * shown when a player taps "Rules ›" on the game card (Board > Team).
 * window.gameRules(game, scoring, minPlayers, counted) returns HTML.
 * Matches the sheet's math: Team Game tab, rows 7-41, and Team Game Y:AA.
 */
(function () {
  function e(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // What one player's number on a hole is, by scoring type.
  var SCORING = {
    Net: 'Each player\'s number on a hole is their <b>net score</b>: gross minus any handicap strokes they get on that hole.',
    Stableford: 'Each player\'s number on a hole is their <b>Stableford points</b>: net double bogey or worse 0, net bogey 1, net par 2, net birdie 3, net eagle 4, net double eagle 5.'
  };

  // Each game: summary (one line), how (team score on a hole), example, and optional extra notes.
  var GAMES = {
    'Min': {
      sum: 'Best ball: only the team\'s lowest number on each hole counts.',
      how: 'On every hole, take the <b>lowest</b> number on the team. That\'s the team\'s score for the hole. Everyone else is off the hook.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>4</b>.', Stableford: 'Points 3, 2 and 0 → team scores <b>0</b>. (In Stableford, Min really means the lowest points, so the weakest score counts. It\'s a "nobody gets carried" game.)' }
    },
    'Max': {
      sum: 'Only the team\'s highest number on each hole counts.',
      how: 'On every hole, take the <b>highest</b> number on the team.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>6</b>. (In Net, that\'s the worst ball, so everyone has to show up.)', Stableford: 'Points 3, 2 and 0 → team scores <b>3</b>. (In Stableford, that\'s the best ball.)' }
    },
    'Sum': {
      sum: 'Every player\'s number counts, added together.',
      how: 'On every hole, <b>add up</b> everyone\'s number.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>15</b>.', Stableford: 'Points 3, 2 and 0 → team scores <b>5</b>.' },
      note: 'Bigger teams pile up bigger numbers, so Sum is fairest when every team has the same number of players.'
    },
    'Avg': {
      sum: 'The team\'s average number on each hole.',
      how: 'On every hole, <b>average</b> everyone\'s number.',
      ex: { Net: 'Net 4, 5 and 6 → team scores <b>5</b>.', Stableford: 'Points 3, 2 and 0 → team scores <b>1.7</b>.' },
      note: 'Averaging keeps it fair when teams have different numbers of players.'
    },
    'Alt-Min-Max': {
      sum: 'Low ball on even holes, high ball on odd holes.',
      how: 'On <b>even</b> holes (10, 12, 14…) the team takes its <b>lowest</b> number. On <b>odd</b> holes (11, 13, 15…) it takes its <b>highest</b>.',
      ex: { Net: 'Hole 12, net 4 and 6 → <b>4</b>. Hole 13, net 4 and 6 → <b>6</b>.', Stableford: 'Hole 12, points 3 and 1 → <b>1</b>. Hole 13, points 3 and 1 → <b>3</b>.' },
      note: 'The hole-by-hole view tags each hole "Low" or "High" so you know which one counts.'
    },
    'Min-Max': {
      sum: 'High ball on even holes, low ball on odd holes (the flip side of Alt-Min-Max).',
      how: 'On <b>even</b> holes the team takes its <b>highest</b> number. On <b>odd</b> holes it takes its <b>lowest</b>.',
      ex: { Net: 'Hole 12, net 4 and 6 → <b>6</b>. Hole 13, net 4 and 6 → <b>4</b>.', Stableford: 'Hole 12, points 3 and 1 → <b>3</b>. Hole 13, points 3 and 1 → <b>1</b>.' },
      note: 'The hole-by-hole view tags each hole "Low" or "High".'
    },
    'Vegas': {
      sum: 'Two numbers become one: low score in front, high score behind.',
      how: 'On every hole, put the team\'s <b>lowest</b> number in front and its <b>highest</b> number behind it to make one number (low × 10 + high).',
      ex: { Net: 'Net 4 and 5 → <b>45</b>. Net 4 and 10 → <b>50</b> (4 × 10 + 10). One blow-up hole hurts.', Stableford: 'Points 1 and 3 → <b>13</b>.' },
      lowAlways: true,
      note: 'With more than two players, only the lowest and highest count. The middle scores are free.'
    },
    'Reverse Vegas': {
      sum: 'Vegas backwards: high score in front, low score behind.',
      how: 'On every hole, put the team\'s <b>highest</b> number in front and its <b>lowest</b> behind it (high × 10 + low).',
      ex: { Net: 'Net 4 and 5 → <b>54</b>. Net 4 and 7 → <b>74</b>. Your worst score sets the tens digit, so keep the big numbers off the card.', Stableford: 'Points 1 and 3 → <b>31</b>.' },
      lowAlways: true
    },
    '3 Man Vegas': {
      sum: 'Vegas with three numbers: a three-digit team score.',
      how: 'On every hole, line up three numbers: the team\'s <b>lowest</b>, then its <b>second-highest</b>, then its <b>highest</b> (low × 100 + second-highest × 10 + high).',
      ex: { Net: 'Net 4, 5 and 6 → <b>456</b>. Net 4, 5 and 9 → <b>459</b>.', Stableford: 'Points 0, 2 and 3 → <b>23</b> (023).' },
      lowAlways: true,
      note: 'With four players, the second-lowest score doesn\'t count (it\'s greyed out in the hole-by-hole view).'
    },
    'Vegas Bird Flip': {
      sum: 'Vegas, plus a twist: a team birdie flips everyone else\'s number.',
      how: 'Score it like Vegas: low × 10 + high on every hole. Then the twist: if <b>every player on a team</b> makes a net birdie on a hole, <b>every other team\'s number flips</b> to high-first on that hole.',
      ex: { Net: 'You have net 4 and 6 (46). Another team both make net birdie, so your 46 becomes <b>64</b>. Ouch.', Stableford: 'A team birdie means everyone on the team scored 3+ points. Your 13 becomes <b>31</b>.' },
      lowAlways: true,
      note: 'A team that made the team birdie itself is never flipped, even if another team also made one. The hole-by-hole view tags "🐦 Birdie" and "Flipped".'
    },
    // Nov 25, 2026 (Ty): four new games.
    'Daytona': {
      sum: 'Vegas, but you have to earn the low number in front.',
      how: 'Score it like Vegas (low × 10 + high), but the low score only goes first when <b>someone on the team makes net par or better</b>. If nobody does, the number flips: <b>high score first</b>.',
      ex: { Net: 'Par 4. Net 4 and 6 → <b>46</b> (someone made par). Net 5 and 6 → <b>65</b> (nobody did). Net 5 and 10 → <b>105</b>.', Stableford: 'Someone made net par (2+ points): points 1 and 2 → <b>12</b>. Nobody did: points 0 and 1 → <b>10</b>.' },
      lowAlways: true,
      note: 'With more than two players, only the lowest and highest count. The hole-by-hole view tags "Flipped" when nobody made par. Best played Net.'
    },
    'Money Ball': {
      sum: 'Each hole, one player on the team has the money ball, and their score counts twice.',
      how: 'Players take turns holding the money ball, one hole each, in the order the team is listed. On each hole the team score is <b>the money ball player\'s score twice, plus the best score from the rest of the team</b>.',
      ex: { Net: 'Ty and Clint are a team, and Ty has the money ball on hole 10. Ty makes net 5 and Clint makes net 4, so the team scores <b>5 + 5 + 4 = 14</b>. On hole 11 the money ball passes to Clint: Clint makes net 6 and Ty makes net 4, so the team scores <b>6 + 6 + 4 = 16</b>. A bad hole by whoever has the money ball hurts twice, so nobody can lean on their partner.', Stableford: 'Ty has the money ball and scores 3 points; Clint scores 2 → the team scores <b>3 + 3 + 2 = 8</b>. With points, a good hole by the money ball player counts twice.' },
      note: 'With three on a team, the money ball goes Player 1, 2, 3, then back to 1. The two players without it just count whichever of them did better. If teams get reshuffled for holes 7-12 or 13-18, the money ball starts over with the first player at hole 7 or 13. In the hole-by-hole view, a <b>$</b> marks who has the money ball.'
    },
    'Team Skins - Best Ball': {
      sum: 'Best ball against every other team, one hole at a time. Win it outright to take the skin.',
      how: 'On every hole, each team\'s number is its <b>best ball</b>. The team with the best one, <b>outright</b>, wins the skin. If two or more teams tie for best, nobody wins it and the skin <b>carries over</b>: the next hole is worth 2, then 3, until someone wins one outright.',
      ex: { Net: 'Hole 12: best balls 3, 3, 2 and 5 → the team with the 2 wins the skin (plus any that carried over).', Stableford: 'Hole 12: best balls 2, 2, 3 and 0 points → the team with the 3 wins it.' },
      win: '<b>Most skins wins.</b> Skins still riding after the last hole aren\'t won by anyone. Tied on skins → lowest combined net, then lowest combined putts.',
      note: 'A hole is decided once <b>every team</b> has finished it, and a carried skin waits for the hole before it. With Early and Late groups, the Early teams\' skins fill in as the Late group plays.'
    },
    'Team Skins - Combined Score': {
      sum: 'Everyone\'s score counts: the team\'s combined score against every other team, one hole at a time.',
      how: 'On every hole, each team\'s number is <b>everyone\'s scores combined</b>. The team with the best one, <b>outright</b>, wins the skin. If two or more teams tie for best, nobody wins it and the skin <b>carries over</b>: the next hole is worth 2, then 3, until someone wins one outright.',
      ex: { Net: 'Hole 12: Ty 3 + Tom 4 = 7, Schertzer 4 + Donnie 4 = 8, KOB 3 + Nick 3 = 6 → KOB and Nick win the skin.', Stableford: 'Points are added the same way, and the most points wins the hole.' },
      win: '<b>Most skins wins.</b> Skins still riding after the last hole aren\'t won by anyone. Tied on skins → lowest combined net, then lowest combined putts.',
      note: 'When teams are different sizes (a twosome against a threesome), teams are compared on their <b>average</b> per player so the threesome isn\'t punished for the extra score. A hole is decided once <b>every team</b> has finished it.'
    },
    'Low Ball/Low Total': {
      sum: 'Two points on every hole: one for the best ball, one for the best team score.',
      how: 'Every hole is worth <b>2 points</b>. <b>Low ball:</b> the team with the best single score gets 1 point. <b>Low total:</b> the team with the best team score gets 1 point (the team\'s average, so a threesome isn\'t punished). When teams tie, they <b>split the point</b>: two teams get ½ each, three get ⅓ each.',
      ex: { Net: 'Best balls 3, 3, 4 → the two teams with a 3 get ½ each. Team averages 4, 4.5, 5 → the team at 4 gets 1. That team scores 1½ on the hole.', Stableford: 'Best ball is the most points, and the best average is the highest. Same 2 points a hole.' },
      win: '<b>Most points wins.</b> Tied on points → lowest combined net, then lowest combined putts.',
      note: 'A hole is decided once <b>every team</b> has finished it.'
    }
  };

  window.gameRules = function (game, scoring, minPlayers, counted) {
    var g = GAMES[game];
    if (!g) return '<p>No write-up for this game yet.</p>';
    var sc = scoring === 'Stableford' ? 'Stableford' : 'Net';
    var lowWins = window.teamLowWins ? window.teamLowWins(game, sc) : (sc === 'Net' || g.lowAlways);
    var min = Number(minPlayers) || 1;
    var html = '<p class="glead">' + e(g.sum) + '</p>' +
      '<h4>Each hole</h4><p>' + SCORING[sc] + '</p><p>' + g.how + '</p>' +
      '<h4>Example</h4><p>' + (g.ex[sc] || g.ex.Net) + '</p>' +
      (g.note ? '<p>' + g.note + '</p>' : '') +
      '<h4>Winning</h4><p>' + (g.win || 'Add up the team\'s hole scores. <b>' + (lowWins ? 'Lowest' : 'Highest') + ' total wins</b>' +
      (g.lowAlways && sc === 'Stableford' ? ' (every Vegas game is low-wins, even with Stableford points)' : '') + '.') + '</p>' +
      '<h4>Fine print</h4><ul>' +
      '<li>A team\'s hole score shows up once <b>everyone</b> on the team has finished that hole.</li>' +
      (min > 1 ? '<li>Teams need at least <b>' + min + ' players</b>. A short-handed team gets no score until Ty adds someone.</li>' : '') +
      (counted && counted !== 'Total' ? '<li>Tonight only <b>' + e(counted.toLowerCase()) + '</b> count (teams get reshuffled every 6 holes).</li>' : '') +
      '<li>Handicap strokes come from each player\'s course handicap for tonight\'s nine, same as the match play.</li>' +
      '</ul>';
    return html;
  };
})();
