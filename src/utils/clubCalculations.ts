import type {
  ClubMilestonesSummary,
  ClubTrophyConfig,
  DisciplineIncident,
  DisciplineReason,
  MatchPerformance,
  MatchRecord,
  OpponentHeadToHead,
  Player,
  PlayerMilestoneLeader,
  PlayerPosition,
  PlayerPositionGroup,
  ScopedPlayerStats,
  SeriesEvent,
  StatsScope,
} from '../types';

export const PLAYER_POSITION_META: Record<
  PlayerPosition,
  { label: string; shortLabel: string; group: PlayerPositionGroup }
> = {
  GK: { label: 'Goalkeeper', shortLabel: 'Goalkeeper', group: 'GK' },
  CB: { label: 'Center Back', shortLabel: 'Center Back', group: 'DEF' },
  LB: { label: 'Left Back', shortLabel: 'Left Back', group: 'DEF' },
  RB: { label: 'Right Back', shortLabel: 'Right Back', group: 'DEF' },
  LWB: { label: 'Left Wing Back', shortLabel: 'Left Wing Back', group: 'DEF' },
  RWB: { label: 'Right Wing Back', shortLabel: 'Right Wing Back', group: 'DEF' },
  DEF: { label: 'Defender (General)', shortLabel: 'Defender', group: 'DEF' },
  CDM: { label: 'Defensive Midfielder', shortLabel: 'Def. Midfielder', group: 'MID' },
  CM: { label: 'Central Midfielder', shortLabel: 'Central Mid', group: 'MID' },
  CAM: { label: 'Attacking Midfielder', shortLabel: 'Attacking Mid', group: 'MID' },
  LM: { label: 'Left Midfielder', shortLabel: 'Left Mid', group: 'MID' },
  RM: { label: 'Right Midfielder', shortLabel: 'Right Mid', group: 'MID' },
  MID: { label: 'Midfielder (General)', shortLabel: 'Midfielder', group: 'MID' },
  LW: { label: 'Left Winger', shortLabel: 'Left Winger', group: 'FWD' },
  RW: { label: 'Right Winger', shortLabel: 'Right Winger', group: 'FWD' },
  CF: { label: 'Center Forward', shortLabel: 'Center Forward', group: 'FWD' },
  ST: { label: 'Striker', shortLabel: 'Striker', group: 'FWD' },
  FWD: { label: 'Forward (General)', shortLabel: 'Forward', group: 'FWD' },
};

export const PLAYER_POSITION_GROUPS: {
  group: PlayerPositionGroup;
  title: string;
  positions: PlayerPosition[];
}[] = [
  { group: 'GK', title: 'Goalkeeper', positions: ['GK'] },
  { group: 'DEF', title: 'Defenders', positions: ['CB', 'LB', 'RB', 'LWB', 'RWB', 'DEF'] },
  { group: 'MID', title: 'Midfielders', positions: ['CDM', 'CM', 'CAM', 'LM', 'RM', 'MID'] },
  { group: 'FWD', title: 'Forwards & Wingers', positions: ['ST', 'CF', 'LW', 'RW', 'FWD'] },
];

export const ALL_PLAYER_POSITIONS: PlayerPosition[] = PLAYER_POSITION_GROUPS.flatMap(
  (g) => g.positions
);

export function getPositionGroup(pos: PlayerPosition): PlayerPositionGroup {
  return PLAYER_POSITION_META[pos]?.group ?? 'MID';
}

export function getPositionLabel(pos: PlayerPosition): string {
  return PLAYER_POSITION_META[pos]?.label ?? pos;
}

export function isDefenderPosition(pos: PlayerPosition): boolean {
  return getPositionGroup(pos) === 'DEF';
}

export function isDefensiveOrKeeperPosition(pos: PlayerPosition): boolean {
  const grp = getPositionGroup(pos);
  return grp === 'GK' || grp === 'DEF';
}

export function normalizeIgHandleKey(handle: string): string {
  return handle
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

export function getScopedPlayerStats(player: Player, scope: StatsScope): ScopedPlayerStats {
  const isKeeperOrDefender = isDefensiveOrKeeperPosition(player.position);

  if (scope === 'external') {
    return {
      games: player.extGames,
      goals: player.extGoals,
      assists: player.extAssists,
      avgRating: player.extGames > 0 ? Number((player.extRatingSum / player.extGames).toFixed(2)) : 0,
      penalties: player.extPenalties,
      redCards: player.extRedCards,
      yellowCards: player.extYellowCards,
      potm: player.extPotm,
      cleanSheets: isKeeperOrDefender ? player.extCleanSheets : null,
    };
  }

  if (scope === 'inter_club') {
    return {
      games: player.icGames,
      goals: player.icGoals,
      assists: player.icAssists,
      avgRating: player.icGames > 0 ? Number((player.icRatingSum / player.icGames).toFixed(2)) : 0,
      penalties: player.icPenalties,
      redCards: player.icRedCards,
      yellowCards: player.icYellowCards,
      potm: player.icPotm,
      cleanSheets: isKeeperOrDefender ? player.icCleanSheets : null,
    };
  }

  const totalGames = player.extGames + player.icGames;
  const totalRatingSum = player.extRatingSum + player.icRatingSum;
  return {
    games: totalGames,
    goals: player.extGoals + player.icGoals,
    assists: player.extAssists + player.icAssists,
    avgRating: totalGames > 0 ? Number((totalRatingSum / totalGames).toFixed(2)) : 0,
    penalties: player.extPenalties + player.icPenalties,
    redCards: player.extRedCards + player.icRedCards,
    yellowCards: player.extYellowCards + player.icYellowCards,
    potm: player.extPotm + player.icPotm,
    cleanSheets: isKeeperOrDefender ? player.extCleanSheets + player.icCleanSheets : null,
  };
}

export function computeSuggestedPotm(performances: MatchPerformance[]): {
  suggestedPotmId: string;
  suggestedPotmName: string;
  suggestedPotmReason: string;
} {
  if (!performances || performances.length === 0) {
    return {
      suggestedPotmId: '',
      suggestedPotmName: '',
      suggestedPotmReason: 'Add player performances to generate suggestion',
    };
  }

  let bestPerf: MatchPerformance | null = null;
  let bestScore = -Infinity;

  for (const perf of performances) {
    const cleanSheetBonus = isDefensiveOrKeeperPosition(perf.position) && perf.cleanSheet ? 2.5 : 0;
    const score =
      perf.rating * 1.5 +
      perf.goals * 3.0 +
      perf.assists * 2.0 +
      cleanSheetBonus -
      perf.yellowCards * 0.75 -
      perf.redCards * 3.0;

    if (score > bestScore) {
      bestScore = score;
      bestPerf = perf;
    }
  }

  if (!bestPerf) {
    return { suggestedPotmId: '', suggestedPotmName: '', suggestedPotmReason: '' };
  }

  const highlights: string[] = [];
  if (bestPerf.goals > 0) highlights.push(`${bestPerf.goals}G`);
  if (bestPerf.assists > 0) highlights.push(`${bestPerf.assists}A`);
  if (isDefensiveOrKeeperPosition(bestPerf.position) && bestPerf.cleanSheet) {
    highlights.push('Clean Sheet');
  }
  highlights.push(`${bestPerf.rating.toFixed(1)} rating`);

  return {
    suggestedPotmId: bestPerf.playerId,
    suggestedPotmName: bestPerf.playerName,
    suggestedPotmReason: highlights.join(' · '),
  };
}

export function computeSuggestedPots(
  seriesId: string,
  matches: MatchRecord[],
  players: Player[]
): { suggestedPotsId: string; suggestedPotsName: string } {
  const seriesMatches = matches.filter((m) => m.seriesId === seriesId && m.status === 'completed');
  const scoreMap = new Map<string, { name: string; score: number }>();

  for (const match of seriesMatches) {
    for (const perf of match.performances) {
      const prev = scoreMap.get(perf.playerId) || { name: perf.playerName, score: 0 };
      const potmBonus = match.officialPotmId === perf.playerId ? 4 : 0;
      const csBonus = isDefensiveOrKeeperPosition(perf.position) && perf.cleanSheet ? 2 : 0;
      const delta = perf.rating + perf.goals * 2.5 + perf.assists * 1.8 + potmBonus + csBonus - perf.redCards * 2;
      scoreMap.set(perf.playerId, { name: perf.playerName, score: prev.score + delta });
    }
  }

  let bestId = '';
  let bestName = '';
  let topScore = -Infinity;

  for (const [playerId, info] of scoreMap.entries()) {
    if (info.score > topScore) {
      topScore = info.score;
      bestId = playerId;
      bestName = info.name;
    }
  }

  if (!bestId && players.length > 0) {
    const sorted = [...players].sort((a, b) => {
      const sa = getScopedPlayerStats(a, 'combined');
      const sb = getScopedPlayerStats(b, 'combined');
      return sb.potm * 3 + sb.goals + sb.assists - (sa.potm * 3 + sa.goals + sa.assists);
    });
    return { suggestedPotsId: sorted[0].id, suggestedPotsName: sorted[0].name };
  }

  return { suggestedPotsId: bestId, suggestedPotsName: bestName };
}

export function computeClubMilestones(
  matches: MatchRecord[],
  series: SeriesEvent[],
  trophyConfig: ClubTrophyConfig
): ClubMilestonesSummary {
  const completedExternal = matches
    .filter((m) => m.status === 'completed' && m.matchType === 'external')
    .sort((a, b) => a.dateIso.localeCompare(b.dateIso));

  const interClubPlayed = matches.filter(
    (m) => m.status === 'completed' && m.matchType === 'inter_club'
  ).length;

  let goalsScored = 0;
  let goalsConceded = 0;
  let wins = 0;
  let losses = 0;
  let draws = 0;
  let cleanSheets = 0;

  let biggestWinDiff = 0;
  let biggestWinLabel = 'None recorded';
  let biggestLossDiff = 0;
  let biggestLossLabel = 'None recorded';

  const resultsSequence: ('W' | 'L' | 'D')[] = [];

  for (const match of completedExternal) {
    goalsScored += match.goalsFor;
    goalsConceded += match.goalsAgainst;
    if (match.goalsAgainst === 0) cleanSheets += 1;

    const diff = match.goalsFor - match.goalsAgainst;
    if (diff > 0) {
      wins += 1;
      resultsSequence.push('W');
      if (diff > biggestWinDiff || (diff === biggestWinDiff && match.goalsFor > 0)) {
        biggestWinDiff = diff;
        biggestWinLabel = `${match.goalsFor}-${match.goalsAgainst} vs ${match.opponentName}`;
      }
    } else if (diff < 0) {
      losses += 1;
      resultsSequence.push('L');
      const absDiff = Math.abs(diff);
      if (absDiff > biggestLossDiff) {
        biggestLossDiff = absDiff;
        biggestLossLabel = `${match.goalsFor}-${match.goalsAgainst} vs ${match.opponentName}`;
      }
    } else {
      draws += 1;
      resultsSequence.push('D');
    }
  }

  const lastFive = resultsSequence.slice(-5);

  const firstFromSeries = series.filter((s) => s.placement === '1st').length;
  const secondFromSeries = series.filter((s) => s.placement === '2nd').length;
  const thirdFromSeries = series.filter((s) => s.placement === '3rd').length;

  return {
    gamesPlayed: completedExternal.length,
    interClubPlayed,
    goalsScored,
    goalsConceded,
    wins,
    losses,
    draws,
    cleanSheets,
    biggestWin: biggestWinLabel,
    biggestLoss: biggestLossLabel,
    lastFive,
    firstPlaceTrophies: firstFromSeries + trophyConfig.firstPlaceBonus,
    secondPlaceTrophies: secondFromSeries + trophyConfig.secondPlaceBonus,
    thirdPlaceTrophies: thirdFromSeries + trophyConfig.thirdPlaceBonus,
  };
}

export function computePlayerMilestones(players: Player[]): PlayerMilestoneLeader[] {
  if (players.length === 0) {
    return [
      { label: 'Most Goals', playerName: 'No data yet', position: null, value: 0, unit: 'goals' },
      { label: 'Most Assists', playerName: 'No data yet', position: null, value: 0, unit: 'assists' },
      { label: 'Most Hat-Tricks', playerName: 'No data yet', position: null, value: 0, unit: 'hat-tricks' },
      { label: 'Most POTM Awards', playerName: 'No data yet', position: null, value: 0, unit: 'awards' },
      { label: 'Most Goals (Single Game)', playerName: 'No data yet', position: null, value: 0, unit: 'goals' },
      { label: 'Most Assists (Single Game)', playerName: 'No data yet', position: null, value: 0, unit: 'assists' },
      { label: 'Most Red Cards', playerName: 'No data yet', position: null, value: 0, unit: 'red cards' },
      { label: 'Most Yellow Cards', playerName: 'No data yet', position: null, value: 0, unit: 'yellow cards' },
    ];
  }

  const pickLeader = (
    label: string,
    unit: string,
    getter: (p: Player) => number
  ): PlayerMilestoneLeader => {
    let leader = players[0];
    let maxVal = getter(leader);
    for (const p of players) {
      const val = getter(p);
      if (val > maxVal) {
        maxVal = val;
        leader = p;
      }
    }
    return {
      label,
      playerName: maxVal > 0 ? leader.name : 'None yet',
      position: maxVal > 0 ? leader.position : null,
      value: maxVal,
      unit,
    };
  };

  return [
    pickLeader('Most Goals', 'goals', (p) => p.extGoals + p.icGoals),
    pickLeader('Most Assists', 'assists', (p) => p.extAssists + p.icAssists),
    pickLeader('Most Hat-Tricks', 'hat-tricks', (p) => p.hatTricks),
    pickLeader('Most POTM Awards', 'awards', (p) => p.extPotm + p.icPotm),
    pickLeader('Most Goals (Single Game)', 'goals', (p) => p.bestSingleGameGoals),
    pickLeader('Most Assists (Single Game)', 'assists', (p) => p.bestSingleGameAssists),
    pickLeader('Most Red Cards', 'red cards', (p) => p.extRedCards + p.icRedCards),
    pickLeader('Most Yellow Cards', 'yellow cards', (p) => p.extYellowCards + p.icYellowCards),
  ];
}

export function getFineAmountForReason(reason: DisciplineReason): 50 | 100 | 200 {
  switch (reason) {
    case 'yellow_card':
      return 50;
    case 'misbehavior':
      return 50;
    case 'red_card':
      return 100;
    case 'no_show':
      return 200;
  }
}

export function getReasonLabel(reason: DisciplineReason): string {
  switch (reason) {
    case 'yellow_card':
      return 'Yellow Card';
    case 'red_card':
      return 'Red Card';
    case 'misbehavior':
      return 'Teammate Misbehavior';
    case 'no_show':
      return 'Match No-Show (Confirmed IN)';
  }
}

export function computeDisciplineSummary(
  players: Player[],
  incidents: DisciplineIncident[]
) {
  const totalYellowFromPlayers = players.reduce(
    (sum, p) => sum + p.extYellowCards + p.icYellowCards,
    0
  );
  const totalRedFromPlayers = players.reduce(
    (sum, p) => sum + p.extRedCards + p.icRedCards,
    0
  );

  const incidentYellows = incidents.filter((i) => i.reason === 'yellow_card').length;
  const incidentReds = incidents.filter((i) => i.reason === 'red_card').length;

  const totalYellowCards = Math.max(totalYellowFromPlayers, incidentYellows);
  const totalRedCards = Math.max(totalRedFromPlayers, incidentReds);

  const pendingFinePkr = incidents
    .filter((i) => i.status === 'pending')
    .reduce((sum, i) => sum + i.finePkr, 0);

  const receivedFinePkr = incidents
    .filter((i) => i.status === 'paid')
    .reduce((sum, i) => sum + i.finePkr, 0);

  const pendingByPlayerMap = new Map<
    string,
    { playerId: string; playerName: string; totalPendingPkr: number; incidents: DisciplineIncident[] }
  >();

  for (const inc of incidents) {
    if (inc.status !== 'pending') continue;
    const key = inc.playerId || inc.playerName;
    const prev = pendingByPlayerMap.get(key) || {
      playerId: inc.playerId,
      playerName: inc.playerName,
      totalPendingPkr: 0,
      incidents: [],
    };
    prev.totalPendingPkr += inc.finePkr;
    prev.incidents.push(inc);
    pendingByPlayerMap.set(key, prev);
  }

  return {
    totalYellowCards,
    totalRedCards,
    pendingFinePkr,
    receivedFinePkr,
    pendingPlayers: Array.from(pendingByPlayerMap.values()).sort(
      (a, b) => b.totalPendingPkr - a.totalPendingPkr
    ),
  };
}

export function buildExternalInstagramAlert(params: {
  opponentName: string;
  dateDisplay: string;
  timeDisplay: string;
  venue: string;
}): string {
  const opp = params.opponentName.trim() || 'Opponent Team';
  const dt = params.dateDisplay.trim() || 'dd-mm-yy';
  const tm = params.timeDisplay.trim() || 'time';
  const loc = params.venue.trim() || 'location';

  return `🚨MATCH ALERT!!\n🦊FOXES FC Vs ${opp}⚡\n📅${dt} \n⏳${tm} \n📍venue :${loc}\n🗣️ If you want to be the part in this match so hurry up open the announcement gc and vote for IN!!! 🤗`;
}

export function buildInterClubInstagramAlert(params: {
  subTeamA: string;
  subTeamB: string;
  dateDisplay: string;
  timeDisplay: string;
  venue: string;
}): string {
  const teamA = params.subTeamA.trim() || 'ORANGE';
  const teamB = params.subTeamB.trim() || 'OBSIDIAN';
  const dt = params.dateDisplay.trim() || '20-11-26';
  const tm = params.timeDisplay.trim() || '7:30 PM';
  const loc = params.venue.trim() || 'Majeed town';

  return `🚨MATCH ALERT!!\n🦊FOXES ${teamA}💫 Vs 🦊 FOXES ${teamB}⚡\n📅${dt} ⏳${tm}\n📍venue :${loc}\n🗣️ If you want to be the part in this match so hurry up open the announcement gc and vote for IN!!! 🤗`;
}

export function normalizeOpponentDisplay(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeOpponentKey(name: string): string {
  return normalizeOpponentDisplay(name).toLowerCase();
}

export function computeOpponentHeadToHead(matches: MatchRecord[]): OpponentHeadToHead[] {
  const groups = new Map<string, MatchRecord[]>();

  for (const m of matches) {
    if (m.matchType !== 'external') continue;
    const key = normalizeOpponentKey(m.opponentName || '');
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(m);
    groups.set(key, list);
  }

  const results: OpponentHeadToHead[] = [];

  for (const [key, groupMatches] of groups.entries()) {
    const chronological = [...groupMatches].sort((a, b) =>
      a.dateIso.localeCompare(b.dateIso)
    );
    const newestFirst = [...chronological].reverse();

    // Pick canonical team name (most frequent casing, tie-broken by latest)
    const nameCounts = new Map<string, number>();
    for (const gm of chronological) {
      const clean = normalizeOpponentDisplay(gm.opponentName);
      nameCounts.set(clean, (nameCounts.get(clean) || 0) + 1);
    }
    let canonicalName = normalizeOpponentDisplay(newestFirst[0].opponentName);
    let maxCount = 0;
    for (const [candidate, count] of nameCounts.entries()) {
      if (count >= maxCount) {
        maxCount = count;
        canonicalName = candidate;
      }
    }

    const completed = chronological.filter((m) => m.status === 'completed');
    const scheduled = chronological.filter((m) => m.status === 'scheduled');

    let wins = 0;
    let draws = 0;
    let losses = 0;
    let goalsFor = 0;
    let goalsAgainst = 0;
    let cleanSheets = 0;
    const form: ('W' | 'D' | 'L')[] = [];

    for (const cm of completed) {
      goalsFor += cm.goalsFor;
      goalsAgainst += cm.goalsAgainst;
      if (cm.goalsAgainst === 0) cleanSheets += 1;

      if (cm.goalsFor > cm.goalsAgainst) {
        wins += 1;
        form.push('W');
      } else if (cm.goalsFor < cm.goalsAgainst) {
        losses += 1;
        form.push('L');
      } else {
        draws += 1;
        form.push('D');
      }
    }

    const played = completed.length;
    results.push({
      key,
      teamName: canonicalName,
      played,
      scheduled: scheduled.length,
      wins,
      draws,
      losses,
      goalsFor,
      goalsAgainst,
      goalDiff: goalsFor - goalsAgainst,
      cleanSheets,
      winRate: played > 0 ? Math.round((wins / played) * 100) : 0,
      lastMatchDate: newestFirst[0]?.dateIso || '',
      recentForm: form.slice(-5),
      matches: newestFirst,
    });
  }

  return results.sort(
    (a, b) =>
      b.played - a.played ||
      b.lastMatchDate.localeCompare(a.lastMatchDate) ||
      a.teamName.localeCompare(b.teamName)
  );
}
