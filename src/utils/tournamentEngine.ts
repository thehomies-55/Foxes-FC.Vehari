import type {
  HybridGroupSize,
  MatchRecord,
  Player,
  PlayerPosition,
  RoundRobinMeetings,
  SeriesCategory,
  SeriesEvent,
  TournamentFormat,
  TournamentMatchSlot,
  TournamentSlotPlayerStat,
} from '../types';
import { isDefenderPosition } from './clubCalculations';

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  round_robin: 'Round Robin',
  knockout: 'Knockout',
  hybrid: 'Hybrid (Groups + Knockout + Final)',
  legged: 'Legged (All Teams Home & Away + Penalties)',
};

export const CATEGORY_LABELS: Record<SeriesCategory, string> = {
  tournament: 'Tournament',
  bilateral: 'Bilateral Series',
  triseries: 'Tri-Series',
  inter_club: 'Inter-Club Series',
};

export function parseTeamsList(
  teamsSummary: string,
  explicitTeams?: string[],
  category?: SeriesCategory
): string[] {
  if (explicitTeams && explicitTeams.length > 0) {
    const cleaned = explicitTeams.map((t) => t.trim()).filter(Boolean);
    if (cleaned.length > 0) return Array.from(new Set(cleaned));
  }

  const raw = (teamsSummary || '')
    .split(/,|·|\||\bvs\b|\bVS\b/g)
    .map((s) => s.trim())
    .filter(Boolean);

  const unique = Array.from(new Set(raw));
  if (unique.length >= 2) return unique;

  if (category === 'inter_club') {
    return ['Foxes ORANGE', 'Foxes OBSIDIAN'];
  }
  return ['Foxes FC', 'Opponent XI'];
}

export function resolveTournamentFormat(event: SeriesEvent): TournamentFormat {
  if (event.format) return event.format;
  const label = (event.tournamentType || '').toLowerCase();
  if (label.includes('legged') || label.includes('home & away') || event.category === 'bilateral') {
    return 'legged';
  }
  if (label.includes('hybrid') || label.includes('group')) {
    return 'hybrid';
  }
  if (label.includes('knockout') || label.includes('elimination')) {
    return 'knockout';
  }
  return 'round_robin';
}

export function formatTournamentDescriptor(
  format: TournamentFormat,
  roundRobinMeetings: RoundRobinMeetings = 1,
  hybridGroupSize: HybridGroupSize = 4
): string {
  if (format === 'round_robin') {
    const suffix =
      roundRobinMeetings === 1 ? 'Once (1x)' : roundRobinMeetings === 2 ? 'Twice (2x)' : 'Thrice (3x)';
    return `Round Robin · ${suffix}`;
  }
  if (format === 'knockout') {
    return 'Knockout Elimination';
  }
  if (format === 'hybrid') {
    return `Hybrid (Groups of ${hybridGroupSize} → SF → Final)`;
  }
  return 'Legged (Home & Away Aggregate)';
}

function formatIsoToDisplay(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso || 'TBD';
  return `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}`;
}

function buildRoundRobinPairs(teams: string[]): [string, string][][] {
  if (teams.length < 2) return [];
  const list = [...teams];
  if (list.length % 2 === 1) {
    list.push('__BYE__');
  }
  const n = list.length;
  const rounds: [string, string][][] = [];

  for (let r = 0; r < n - 1; r++) {
    const roundPairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const tA = list[i];
      const tB = list[n - 1 - i];
      if (tA !== '__BYE__' && tB !== '__BYE__') {
        roundPairs.push(r % 2 === 0 ? [tA, tB] : [tB, tA]);
      }
    }
    rounds.push(roundPairs);
    const fixed = list[0];
    const last = list.pop()!;
    list.splice(1, 0, last);
    list[0] = fixed;
  }

  return rounds;
}

type KnockoutSeedNode = { team?: string; placeholder?: string; fromSlotId?: string };

function buildKnockoutBracketFromNodes(params: {
  entries: KnockoutSeedNode[];
  startRoundNumber: number;
  idPrefix: string;
  defaultVenue: string;
  defaultDate: string;
}): TournamentMatchSlot[] {
  const { entries, startRoundNumber, idPrefix, defaultVenue, defaultDate } = params;
  if (entries.length < 2) return [];

  let bracketSize = 2;
  while (bracketSize < entries.length) bracketSize *= 2;
  const totalRounds = Math.log2(bracketSize);

  const getRoundTitle = (roundIdx: number) => {
    const rem = totalRounds - roundIdx;
    if (rem === 0) return 'Final';
    if (rem === 1) return 'Semi-Final';
    if (rem === 2) return 'Quarterfinal';
    return `Round of ${Math.pow(2, rem + 1)}`;
  };

  const getStageType = (roundIdx: number): TournamentMatchSlot['stageType'] => {
    const rem = totalRounds - roundIdx;
    if (rem === 0) return 'final';
    if (rem === 1) return 'semifinal';
    return 'knockout';
  };

  const padded: (KnockoutSeedNode | null)[] = [];
  const byes = bracketSize - entries.length;
  let idx = 0;
  for (let i = 0; i < bracketSize / 2; i++) {
    padded.push(entries[idx++] || null);
    if (i < byes) {
      padded.push(null);
    } else {
      padded.push(entries[idx++] || null);
    }
  }

  const slots: TournamentMatchSlot[] = [];
  let currentNodes: KnockoutSeedNode[] = [];

  const r1Title = getRoundTitle(1);
  const r1Type = getStageType(1);
  let r1MatchCounter = 1;

  for (let i = 0; i < padded.length; i += 2) {
    const nA = padded[i];
    const nB = padded[i + 1];
    if (nA && nB) {
      const id = `${idPrefix}_r1_${r1MatchCounter}`;
      const label = totalRounds === 1 ? 'Final' : `${r1Title} ${r1MatchCounter}`;
      slots.push({
        id,
        stage: label,
        stageType: r1Type,
        roundNumber: startRoundNumber,
        teamA: nA.team || '',
        teamB: nB.team || '',
        placeholderA: nA.placeholder || '',
        placeholderB: nB.placeholder || '',
        sourceSlotAId: nA.fromSlotId || '',
        sourceSlotBId: nB.fromSlotId || '',
        venue: defaultVenue,
        dateDisplay: defaultDate,
        status: 'scheduled',
        scoreA: 0,
        scoreB: 0,
      });
      currentNodes.push({ fromSlotId: id, placeholder: `Winner ${label}` });
      r1MatchCounter += 1;
    } else if (nA) {
      currentNodes.push(nA);
    } else if (nB) {
      currentNodes.push(nB);
    }
  }

  for (let roundIdx = 2; roundIdx <= totalRounds; roundIdx++) {
    const title = getRoundTitle(roundIdx);
    const stype = getStageType(roundIdx);
    const nextNodes: KnockoutSeedNode[] = [];
    let mCounter = 1;

    for (let i = 0; i < currentNodes.length; i += 2) {
      const nodeA = currentNodes[i];
      const nodeB = currentNodes[i + 1];
      if (!nodeA && !nodeB) continue;

      if (nodeA && !nodeB) {
        nextNodes.push(nodeA);
        continue;
      }
      if (!nodeA && nodeB) {
        nextNodes.push(nodeB);
        continue;
      }

      const id = `${idPrefix}_r${roundIdx}_${mCounter}`;
      const label = stype === 'final' ? 'Final' : `${title} ${mCounter}`;
      slots.push({
        id,
        stage: label,
        stageType: stype,
        roundNumber: startRoundNumber + roundIdx - 1,
        teamA: nodeA.team || '',
        teamB: nodeB.team || '',
        placeholderA: nodeA.placeholder || '',
        placeholderB: nodeB.placeholder || '',
        sourceSlotAId: nodeA.fromSlotId || '',
        sourceSlotBId: nodeB.fromSlotId || '',
        venue: defaultVenue,
        dateDisplay: defaultDate,
        status: 'scheduled',
        scoreA: 0,
        scoreB: 0,
      });
      nextNodes.push({ fromSlotId: id, placeholder: `Winner ${label}` });
      mCounter += 1;
    }

    currentNodes = nextNodes;
  }

  return slots;
}

export function generateTournamentFixtures(params: {
  teams: string[];
  format: TournamentFormat;
  roundRobinMeetings: RoundRobinMeetings;
  hybridGroupSize: HybridGroupSize;
  homeGround: string;
  startDate: string;
  clubName?: string;
}): TournamentMatchSlot[] {
  const teams = params.teams.map((t) => t.trim()).filter(Boolean);
  if (teams.length < 2) return [];

  const defaultVenue = params.homeGround || 'Vehari District Floodlit Turf';
  const defaultDate = formatIsoToDisplay(params.startDate);
  const clubKey = (params.clubName || 'Foxes FC').trim().toLowerCase();
  const slots: TournamentMatchSlot[] = [];

  const resolveTeamHomeVenue = (homeTeam: string): string => {
    const key = homeTeam.trim().toLowerCase();
    if (key === clubKey || key === 'foxes fc') {
      return defaultVenue;
    }
    if (key.startsWith('foxes ')) {
      return `${defaultVenue} (${homeTeam} Home)`;
    }
    return `${homeTeam} Home Ground`;
  };

  if (params.format === 'round_robin') {
    const meetings = params.roundRobinMeetings || 1;
    const baseRounds = buildRoundRobinPairs(teams);
    let globalRound = 1;

    for (let m = 1; m <= meetings; m++) {
      baseRounds.forEach((pairs) => {
        pairs.forEach(([a, b], pairIdx) => {
          const teamA = m % 2 === 0 ? b : a;
          const teamB = m % 2 === 0 ? a : b;
          slots.push({
            id: `rr_m${m}_r${globalRound}_${pairIdx + 1}`,
            stage:
              meetings > 1
                ? `Round ${globalRound} · Leg ${m}/${meetings}`
                : `Round ${globalRound}`,
            stageType: 'round_robin',
            roundNumber: globalRound,
            teamA,
            teamB,
            venue: defaultVenue,
            dateDisplay: defaultDate,
            status: 'scheduled',
            scoreA: 0,
            scoreB: 0,
          });
        });
        globalRound += 1;
      });
    }
    return slots;
  }

  if (params.format === 'legged') {
    const firstLegRounds = buildRoundRobinPairs(teams);
    if (teams.length === 2) {
      const team1 = teams[0];
      const team2 = teams[1];
      slots.push({
        id: 'leg_1_home',
        stage: 'Leg 1 · Home Ground',
        stageType: 'leg1',
        roundNumber: 1,
        teamA: team1,
        teamB: team2,
        venue: resolveTeamHomeVenue(team1),
        dateDisplay: defaultDate,
        status: 'scheduled',
        scoreA: 0,
        scoreB: 0,
        notes: `Tie 1 · ${team1} Home Leg`,
      });
      slots.push({
        id: 'leg_2_away',
        stage: 'Leg 2 · Away Ground',
        stageType: 'leg2',
        roundNumber: 2,
        teamA: team2,
        teamB: team1,
        venue: resolveTeamHomeVenue(team2),
        dateDisplay: defaultDate,
        status: 'scheduled',
        scoreA: 0,
        scoreB: 0,
        notes: `Tie 1 · ${team2} Home Ground · Aggregate & Penalties Decider`,
      });
      return slots;
    }

    const tieRegistry = new Map<string, { tieNum: number; homeTeam: string; awayTeam: string }>();
    let tieCounter = 1;

    firstLegRounds.forEach((pairs, rIdx) => {
      pairs.forEach(([homeTeam, awayTeam]) => {
        const pairKey = [homeTeam, awayTeam].sort().join('__vs__');
        const tieNum = tieCounter++;
        tieRegistry.set(pairKey, { tieNum, homeTeam, awayTeam });

        slots.push({
          id: `leg_t${tieNum}_1`,
          stage: `Tie ${tieNum} · Leg 1 (Home)`,
          stageType: 'leg1',
          roundNumber: rIdx + 1,
          teamA: homeTeam,
          teamB: awayTeam,
          venue: resolveTeamHomeVenue(homeTeam),
          dateDisplay: defaultDate,
          status: 'scheduled',
          scoreA: 0,
          scoreB: 0,
          notes: `Tie ${tieNum}: ${homeTeam} vs ${awayTeam} · ${homeTeam} Home Ground`,
        });
      });
    });

    const roundOffset = firstLegRounds.length;
    firstLegRounds.forEach((pairs, rIdx) => {
      pairs.forEach(([homeTeam, awayTeam]) => {
        const pairKey = [homeTeam, awayTeam].sort().join('__vs__');
        const tieInfo = tieRegistry.get(pairKey)!;

        slots.push({
          id: `leg_t${tieInfo.tieNum}_2`,
          stage: `Tie ${tieInfo.tieNum} · Leg 2 (Away)`,
          stageType: 'leg2',
          roundNumber: roundOffset + rIdx + 1,
          teamA: awayTeam,
          teamB: homeTeam,
          venue: resolveTeamHomeVenue(awayTeam),
          dateDisplay: defaultDate,
          status: 'scheduled',
          scoreA: 0,
          scoreB: 0,
          notes: `Tie ${tieInfo.tieNum}: ${homeTeam} vs ${awayTeam} · ${awayTeam} Home Ground · Aggregate & Penalties`,
        });
      });
    });

    return slots;
  }

  if (params.format === 'knockout') {
    return buildKnockoutBracketFromNodes({
      entries: teams.map((t) => ({ team: t })),
      startRoundNumber: 1,
      idPrefix: 'ko',
      defaultVenue,
      defaultDate,
    });
  }

  // HYBRID FORMAT: Groups of 2..5 -> Top 2 per group advance to Semi-Finals / Knockout -> Final
  const targetSize = Math.min(5, Math.max(2, params.hybridGroupSize || 4));
  let groupCount = 1;
  if (teams.length > targetSize) {
    groupCount = Math.ceil(teams.length / targetSize);
  } else if (teams.length >= 6) {
    groupCount = 2;
  }

  const groups: { name: string; teams: string[] }[] = Array.from(
    { length: groupCount },
    (_, i) => ({
      name: `Group ${String.fromCharCode(65 + i)}`,
      teams: [],
    })
  );

  teams.forEach((team, idx) => {
    const groupIdx = Math.min(groupCount - 1, Math.floor((idx * groupCount) / teams.length));
    groups[groupIdx].teams.push(team);
  });

  let maxGroupRound = 1;
  groups.forEach((group, gIdx) => {
    const rounds = buildRoundRobinPairs(group.teams);
    rounds.forEach((pairs, rIdx) => {
      const rNum = rIdx + 1;
      if (rNum > maxGroupRound) maxGroupRound = rNum;
      pairs.forEach(([a, b], pIdx) => {
        slots.push({
          id: `hyb_g${gIdx + 1}_r${rNum}_${pIdx + 1}`,
          stage: `${group.name} · Round ${rNum}`,
          stageType: 'group',
          groupName: group.name,
          roundNumber: rNum,
          teamA: a,
          teamB: b,
          venue: defaultVenue,
          dateDisplay: defaultDate,
          status: 'scheduled',
          scoreA: 0,
          scoreB: 0,
        });
      });
    });
  });

  const koStartRound = maxGroupRound + 1;
  if (groups.length === 2) {
    slots.push({
      id: 'hyb_sf_1',
      stage: 'Semi-Final 1',
      stageType: 'semifinal',
      roundNumber: koStartRound,
      teamA: '',
      teamB: '',
      placeholderA: `${groups[0].name} #1`,
      placeholderB: `${groups[1].name} #2`,
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
    slots.push({
      id: 'hyb_sf_2',
      stage: 'Semi-Final 2',
      stageType: 'semifinal',
      roundNumber: koStartRound,
      teamA: '',
      teamB: '',
      placeholderA: `${groups[1].name} #1`,
      placeholderB: `${groups[0].name} #2`,
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
    slots.push({
      id: 'hyb_final',
      stage: 'Final',
      stageType: 'final',
      roundNumber: koStartRound + 1,
      teamA: '',
      teamB: '',
      placeholderA: 'Winner Semi-Final 1',
      placeholderB: 'Winner Semi-Final 2',
      sourceSlotAId: 'hyb_sf_1',
      sourceSlotBId: 'hyb_sf_2',
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
  } else if (groups.length >= 3) {
    const qualifiers: KnockoutSeedNode[] = [];
    for (let i = 0; i < groups.length; i++) {
      const nextGroup = groups[(i + 1) % groups.length];
      qualifiers.push({ placeholder: `${groups[i].name} #1` });
      if (nextGroup.teams.length >= 2) {
        qualifiers.push({ placeholder: `${nextGroup.name} #2` });
      }
    }
    const koSlots = buildKnockoutBracketFromNodes({
      entries: qualifiers,
      startRoundNumber: koStartRound,
      idPrefix: 'hyb_ko',
      defaultVenue,
      defaultDate,
    });
    slots.push(...koSlots);
  } else if (teams.length >= 4) {
    slots.push({
      id: 'hyb_sf_1',
      stage: 'Semi-Final 1',
      stageType: 'semifinal',
      roundNumber: koStartRound,
      teamA: '',
      teamB: '',
      placeholderA: 'Group A #1',
      placeholderB: 'Group A #4',
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
    slots.push({
      id: 'hyb_sf_2',
      stage: 'Semi-Final 2',
      stageType: 'semifinal',
      roundNumber: koStartRound,
      teamA: '',
      teamB: '',
      placeholderA: 'Group A #2',
      placeholderB: 'Group A #3',
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
    slots.push({
      id: 'hyb_final',
      stage: 'Final',
      stageType: 'final',
      roundNumber: koStartRound + 1,
      teamA: '',
      teamB: '',
      placeholderA: 'Winner Semi-Final 1',
      placeholderB: 'Winner Semi-Final 2',
      sourceSlotAId: 'hyb_sf_1',
      sourceSlotBId: 'hyb_sf_2',
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
  } else {
    slots.push({
      id: 'hyb_final',
      stage: 'Final',
      stageType: 'final',
      roundNumber: koStartRound,
      teamA: '',
      teamB: '',
      placeholderA: 'Group A #1',
      placeholderB: 'Group A #2',
      venue: defaultVenue,
      dateDisplay: defaultDate,
      status: 'scheduled',
      scoreA: 0,
      scoreB: 0,
    });
  }

  return slots;
}

export interface StandingRow {
  team: string;
  groupName?: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  tiesWon: number;
  status: 'champion' | 'advancing' | 'active' | 'eliminated';
  statusLabel: string;
}

export interface ResolvedTournamentMatch extends TournamentMatchSlot {
  resolvedTeamA: string;
  resolvedTeamB: string;
  winner: string | null;
  loser: string | null;
  decidedByPenalties: boolean;
  resolvedBestPlayer: string;
  resolvedBestKeeper: string;
  resolvedBestDefender: string;
  resolvedPlayerStats: TournamentSlotPlayerStat[];
}

export interface TeamScheduleEntry {
  slotId: string;
  stage: string;
  roundNumber: number;
  homeOrAway: 'HOME' | 'AWAY';
  opponent: string;
  venue: string;
  dateDisplay: string;
  status: 'scheduled' | 'completed';
  scoreDisplay: string;
  outcomeCode: 'W' | 'D' | 'L' | 'TBD';
  bestPlayer: string;
  bestKeeper: string;
  bestDefender: string;
}

export interface TeamScheduleGroup {
  team: string;
  matches: TeamScheduleEntry[];
  playedCount: number;
  scheduledCount: number;
}

export interface TournamentPlayerRecord {
  playerName: string;
  teamName: string;
  goals: number;
  assists: number;
  cleanSheets: number;
  potmAwards: number;
  keeperAwards: number;
  defenderAwards: number;
  ratingSum: number;
  ratingCount: number;
  avgRating: number;
  positions: Set<PlayerPosition>;
  compositeScore: number;
}

export interface TournamentAutoAwards {
  topScorersLeaderboard: TournamentPlayerRecord[];
  topAssistersLeaderboard: TournamentPlayerRecord[];
  autoTopScorerName: string;
  autoTopScorerStat: string;
  autoTopAssisterName: string;
  autoTopAssisterStat: string;
  autoBestKeeperName: string;
  autoBestKeeperStat: string;
  autoBestDefenderName: string;
  autoBestDefenderStat: string;
  autoPotsName: string;
  autoPotsId: string;
  autoPotsReason: string;
}

export interface LeggedAggregateSummary {
  tieNumber: number;
  pairKey: string;
  team1: string;
  team2: string;
  leg1Id?: string;
  leg2Id?: string;
  leg1Completed: boolean;
  leg2Completed: boolean;
  leg1Score1: number;
  leg1Score2: number;
  leg2Score1: number;
  leg2Score2: number;
  team1Agg: number;
  team2Agg: number;
  penaltiesNeeded: boolean;
  penalties1: number;
  penalties2: number;
  winner: string | null;
  loser: string | null;
}

export interface EvaluatedTournamentState {
  format: TournamentFormat;
  teams: string[];
  resolvedMatches: ResolvedTournamentMatch[];
  teamSchedules: TeamScheduleGroup[];
  standings: StandingRow[];
  groupStandings: { groupName: string; rows: StandingRow[] }[];
  leggedSummary: LeggedAggregateSummary | null;
  leggedTies: LeggedAggregateSummary[];
  hasPendingTiebreaker: boolean;
  completedCount: number;
  totalCount: number;
  resolvedWinnerName: string;
  canShowBestPlayers: boolean;
  autoAwards: TournamentAutoAwards;
}

function getSlotWinnerLoser(slot: TournamentMatchSlot, teamA: string, teamB: string): {
  winner: string | null;
  loser: string | null;
  decidedByPenalties: boolean;
} {
  if (slot.status !== 'completed' || !teamA || !teamB) {
    return { winner: null, loser: null, decidedByPenalties: false };
  }
  if (slot.scoreA > slot.scoreB) {
    return { winner: teamA, loser: teamB, decidedByPenalties: false };
  }
  if (slot.scoreB > slot.scoreA) {
    return { winner: teamB, loser: teamA, decidedByPenalties: false };
  }
  const penA = Number(slot.penaltiesA) || 0;
  const penB = Number(slot.penaltiesB) || 0;
  if (penA > penB) {
    return { winner: teamA, loser: teamB, decidedByPenalties: true };
  }
  if (penB > penA) {
    return { winner: teamB, loser: teamA, decidedByPenalties: true };
  }
  return { winner: null, loser: null, decidedByPenalties: false };
}

function buildFallbackSlotsFromClubMatches(
  event: SeriesEvent,
  linkedClubMatches: MatchRecord[],
  clubName: string,
  teams: string[]
): TournamentMatchSlot[] {
  if (linkedClubMatches.length === 0) return [];
  const sorted = [...linkedClubMatches].sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  const format = resolveTournamentFormat(event);

  return sorted.map((m, idx) => {
    const isInter = m.matchType === 'inter_club';
    const teamA = isInter
      ? m.subTeamA
        ? `Foxes ${m.subTeamA}`
        : teams[0] || 'Foxes ORANGE'
      : clubName;
    const teamB = isInter
      ? m.subTeamB
        ? `Foxes ${m.subTeamB}`
        : teams[1] || 'Foxes OBSIDIAN'
      : m.opponentName || teams[1] || 'Opponent';

    const derivedAwards = deriveAwardsFromClubMatch(m);

    return {
      id: m.id,
      stage:
        format === 'legged'
          ? idx % 2 === 0
            ? 'Leg 1 · Home Ground'
            : 'Leg 2 · Away Ground'
          : `Match ${idx + 1}`,
      stageType: format === 'legged' ? (idx % 2 === 0 ? 'leg1' : 'leg2') : 'round_robin',
      roundNumber: idx + 1,
      teamA,
      teamB,
      venue: m.venue,
      dateDisplay: m.dateDisplay,
      status: m.status,
      scoreA: isInter ? m.subTeamAScore : m.goalsFor,
      scoreB: isInter ? m.subTeamBScore : m.goalsAgainst,
      bestPlayerName: derivedAwards.bestPlayer,
      bestKeeperName: derivedAwards.bestKeeper,
      bestDefenderName: derivedAwards.bestDefender,
      playerStats: derivedAwards.stats,
    };
  });
}

function deriveAwardsFromClubMatch(m: MatchRecord): {
  bestPlayer: string;
  bestKeeper: string;
  bestDefender: string;
  stats: TournamentSlotPlayerStat[];
} {
  const perfs = m.performances || [];
  const bestPlayer = (m.officialPotmName || m.suggestedPotmName || '').trim();

  const gkPerf = [...perfs]
    .filter((p) => p.position === 'GK')
    .sort((a, b) => Number(b.cleanSheet) - Number(a.cleanSheet) || b.rating - a.rating)[0];
  const defPerf = [...perfs]
    .filter((p) => isDefenderPosition(p.position))
    .sort(
      (a, b) =>
        Number(b.cleanSheet) - Number(a.cleanSheet) ||
        b.goals + b.assists - (a.goals + a.assists) ||
        b.rating - a.rating
    )[0];

  const stats: TournamentSlotPlayerStat[] = perfs.map((p) => ({
    playerName: p.playerName,
    position: p.position,
    goals: p.goals,
    assists: p.assists,
    rating: p.rating,
    cleanSheet: p.cleanSheet,
  }));

  return {
    bestPlayer,
    bestKeeper: gkPerf?.playerName || '',
    bestDefender: defPerf?.playerName || '',
    stats,
  };
}

function findMatchingClubMatch(
  slot: TournamentMatchSlot,
  teamA: string,
  teamB: string,
  linkedClubMatches: MatchRecord[],
  clubName: string
): MatchRecord | undefined {
  if (linkedClubMatches.length === 0) return undefined;
  const byId = linkedClubMatches.find((m) => m.id === slot.id);
  if (byId) return byId;

  const normA = teamA.trim().toLowerCase();
  const normB = teamB.trim().toLowerCase();
  const normClub = clubName.trim().toLowerCase();

  return linkedClubMatches.find((m) => {
    if (m.dateDisplay && slot.dateDisplay && m.dateDisplay !== slot.dateDisplay) {
      return false;
    }
    if (m.matchType === 'inter_club') {
      const subA = `foxes ${(m.subTeamA || '').trim().toLowerCase()}`;
      const subB = `foxes ${(m.subTeamB || '').trim().toLowerCase()}`;
      return (normA === subA && normB === subB) || (normA === subB && normB === subA);
    }
    const opp = (m.opponentName || '').trim().toLowerCase();
    return (
      ((normA === normClub || normA === 'foxes fc') && normB === opp) ||
      ((normB === normClub || normB === 'foxes fc') && normA === opp)
    );
  });
}

export function evaluateTournamentState(
  event: SeriesEvent,
  linkedClubMatches: MatchRecord[],
  clubName = 'Foxes FC',
  clubPlayers: Player[] = []
): EvaluatedTournamentState {
  const format = resolveTournamentFormat(event);
  const teams = parseTeamsList(event.teamsSummary, event.teams, event.category);

  const rawSlots =
    event.tournamentMatches && event.tournamentMatches.length > 0
      ? event.tournamentMatches
      : buildFallbackSlotsFromClubMatches(event, linkedClubMatches, clubName, teams);

  const allTeamNames = Array.from(
    new Set([
      ...teams,
      ...rawSlots.flatMap((s) => [s.teamA, s.teamB].filter(Boolean)),
    ])
  );

  // 1. Compute Group & Overall Tables from Round Robin / Group Stage / Legged matches
  const statsMap = new Map<string, StandingRow>();
  const ensureTeam = (team: string, groupName?: string) => {
    if (!statsMap.has(team)) {
      statsMap.set(team, {
        team,
        groupName,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
        tiesWon: 0,
        status: 'active',
        statusLabel: 'In Contention',
      });
    } else if (groupName && !statsMap.get(team)!.groupName) {
      statsMap.get(team)!.groupName = groupName;
    }
    return statsMap.get(team)!;
  };

  allTeamNames.forEach((t) => ensureTeam(t));

  rawSlots.forEach((slot) => {
    if (slot.groupName) {
      if (slot.teamA) ensureTeam(slot.teamA, slot.groupName);
      if (slot.teamB) ensureTeam(slot.teamB, slot.groupName);
    }
  });

  rawSlots.forEach((slot) => {
    if (slot.status !== 'completed' || !slot.teamA || !slot.teamB) return;
    if (format === 'hybrid' && slot.stageType !== 'group') return;

    const rowA = ensureTeam(slot.teamA, slot.groupName);
    const rowB = ensureTeam(slot.teamB, slot.groupName);
    rowA.played += 1;
    rowB.played += 1;
    rowA.gf += slot.scoreA;
    rowA.ga += slot.scoreB;
    rowB.gf += slot.scoreB;
    rowB.ga += slot.scoreA;
    rowA.gd = rowA.gf - rowA.ga;
    rowB.gd = rowB.gf - rowB.ga;

    if (slot.scoreA > slot.scoreB) {
      rowA.won += 1;
      rowA.points += 3;
      rowB.lost += 1;
    } else if (slot.scoreB > slot.scoreA) {
      rowB.won += 1;
      rowB.points += 3;
      rowA.lost += 1;
    } else {
      rowA.drawn += 1;
      rowB.drawn += 1;
      rowA.points += 1;
      rowB.points += 1;
    }
  });

  // Compute group standings for Hybrid
  const groupNames = Array.from(
    new Set(rawSlots.map((s) => s.groupName).filter(Boolean) as string[])
  ).sort();

  const groupStandings = groupNames.map((gName) => {
    const gSlots = rawSlots.filter((s) => s.groupName === gName);
    const groupDone = gSlots.length > 0 && gSlots.every((s) => s.status === 'completed');
    const rows = Array.from(statsMap.values())
      .filter((r) => r.groupName === gName)
      .sort((a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));

    rows.forEach((r, idx) => {
      if (groupDone) {
        if (idx < 2) {
          r.status = 'advancing';
          r.statusLabel = groupNames.length <= 2 ? 'Advances to Semi-Final' : 'Advances to Knockout';
        } else {
          r.status = 'eliminated';
          r.statusLabel = 'Eliminated (Group Stage)';
        }
      } else {
        r.status = idx < 2 ? 'advancing' : 'active';
        r.statusLabel = idx < 2 ? 'Top 2 Qualifying Spot' : 'In Contention';
      }
    });

    return { groupName: gName, rows };
  });

  const resolveGroupPlaceholder = (placeholder?: string): string => {
    if (!placeholder) return '';
    const match = placeholder.match(/^(Group [A-Z])\s*#(\d+)$/i);
    if (!match) return '';
    const gName = match[1];
    const seedPos = Number(match[2]) - 1;
    const gSlots = rawSlots.filter((s) => s.groupName === gName);
    const gComplete = gSlots.length > 0 && gSlots.every((s) => s.status === 'completed');
    if (!gComplete) return '';
    const gObj = groupStandings.find((g) => g.groupName === gName);
    return gObj?.rows[seedPos]?.team || '';
  };

  // 2. Iteratively resolve Knockout / Semi-Final / Final slots + Match-level Awards & Stats
  const resolvedById = new Map<string, ResolvedTournamentMatch>();
  const orderedSlots = [...rawSlots].sort((a, b) => a.roundNumber - b.roundNumber);
  const matchedClubMatchIds = new Set<string>();

  orderedSlots.forEach((slot) => {
    let rA = slot.teamA;
    let rB = slot.teamB;

    if (!rA && slot.sourceSlotAId && resolvedById.has(slot.sourceSlotAId)) {
      rA = resolvedById.get(slot.sourceSlotAId)!.winner || '';
    } else if (!rA && slot.placeholderA) {
      rA = resolveGroupPlaceholder(slot.placeholderA);
    }

    if (!rB && slot.sourceSlotBId && resolvedById.has(slot.sourceSlotBId)) {
      rB = resolvedById.get(slot.sourceSlotBId)!.winner || '';
    } else if (!rB && slot.placeholderB) {
      rB = resolveGroupPlaceholder(slot.placeholderB);
    }

    const displayA = rA || slot.placeholderA || 'TBD';
    const displayB = rB || slot.placeholderB || 'TBD';
    const { winner, loser, decidedByPenalties } = getSlotWinnerLoser(slot, rA, rB);

    const linkedMatch =
      slot.status === 'completed'
        ? findMatchingClubMatch(slot, displayA, displayB, linkedClubMatches, clubName)
        : undefined;
    if (linkedMatch) matchedClubMatchIds.add(linkedMatch.id);

    const linkedDerived = linkedMatch ? deriveAwardsFromClubMatch(linkedMatch) : null;

    const resolvedBestPlayer = (
      slot.bestPlayerName ||
      linkedDerived?.bestPlayer ||
      ''
    ).trim();
    const resolvedBestKeeper = (
      slot.bestKeeperName ||
      linkedDerived?.bestKeeper ||
      ''
    ).trim();
    const resolvedBestDefender = (
      slot.bestDefenderName ||
      linkedDerived?.bestDefender ||
      ''
    ).trim();
    const resolvedPlayerStats =
      slot.playerStats && slot.playerStats.length > 0
        ? slot.playerStats
        : linkedDerived?.stats || [];

    const resolved: ResolvedTournamentMatch = {
      ...slot,
      resolvedTeamA: displayA,
      resolvedTeamB: displayB,
      winner,
      loser,
      decidedByPenalties,
      resolvedBestPlayer,
      resolvedBestKeeper,
      resolvedBestDefender,
      resolvedPlayerStats,
    };
    resolvedById.set(slot.id, resolved);
  });

  const resolvedMatches = rawSlots.map((s) => resolvedById.get(s.id)!);

  if (format === 'knockout' || format === 'hybrid') {
    resolvedMatches.forEach((rm) => {
      if (format === 'hybrid' && rm.stageType === 'group') return;
      if (rm.status !== 'completed' || !rm.resolvedTeamA || !rm.resolvedTeamB) return;
      if (rm.resolvedTeamA === rm.placeholderA || rm.resolvedTeamB === rm.placeholderB) return;

      const rowA = ensureTeam(rm.resolvedTeamA);
      const rowB = ensureTeam(rm.resolvedTeamB);
      rowA.played += 1;
      rowB.played += 1;
      rowA.gf += rm.scoreA;
      rowA.ga += rm.scoreB;
      rowB.gf += rm.scoreB;
      rowB.ga += rm.scoreA;
      rowA.gd = rowA.gf - rowA.ga;
      rowB.gd = rowB.gf - rowB.ga;
      if (rm.winner === rm.resolvedTeamA) {
        rowA.won += 1;
        rowA.points += 3;
        rowB.lost += 1;
      } else if (rm.winner === rm.resolvedTeamB) {
        rowB.won += 1;
        rowB.points += 3;
        rowA.lost += 1;
      } else {
        rowA.drawn += 1;
        rowB.drawn += 1;
        rowA.points += 1;
        rowB.points += 1;
      }
    });
  }

  // 3. Determine All-Pairs Legged Aggregate Ties
  const leggedTies: LeggedAggregateSummary[] = [];
  if (format === 'legged' && allTeamNames.length >= 2) {
    const groupedPairs = new Map<string, ResolvedTournamentMatch[]>();
    resolvedMatches.forEach((rm) => {
      if (!rm.resolvedTeamA || !rm.resolvedTeamB) return;
      const pairKey = [rm.resolvedTeamA, rm.resolvedTeamB].sort().join('__vs__');
      const existing = groupedPairs.get(pairKey) || [];
      existing.push(rm);
      groupedPairs.set(pairKey, existing);
    });

    let tieIdx = 1;
    groupedPairs.forEach((pairSlots, pairKey) => {
      const sortedPairSlots = [...pairSlots].sort((a, b) => a.roundNumber - b.roundNumber);
      const leg1 = sortedPairSlots.find((s) => s.stageType === 'leg1') || sortedPairSlots[0];
      const leg2 =
        sortedPairSlots.find((s) => s.stageType === 'leg2' && s.id !== leg1?.id) ||
        sortedPairSlots[1];

      const team1 = leg1?.resolvedTeamA || allTeamNames[0];
      const team2 = leg1?.resolvedTeamB || allTeamNames[1];

      const l1Done = leg1?.status === 'completed';
      const l2Done = leg2?.status === 'completed';

      const leg1Score1 = l1Done ? (leg1.resolvedTeamA === team1 ? leg1.scoreA : leg1.scoreB) : 0;
      const leg1Score2 = l1Done ? (leg1.resolvedTeamA === team1 ? leg1.scoreB : leg1.scoreA) : 0;
      const leg2Score1 = l2Done ? (leg2.resolvedTeamA === team1 ? leg2.scoreA : leg2.scoreB) : 0;
      const leg2Score2 = l2Done ? (leg2.resolvedTeamA === team1 ? leg2.scoreB : leg2.scoreA) : 0;

      const team1Agg = leg1Score1 + leg2Score1;
      const team2Agg = leg1Score2 + leg2Score2;
      const penaltiesNeeded = Boolean(l1Done && l2Done && team1Agg === team2Agg);

      const penSource =
        leg2 && ((Number(leg2.penaltiesA) || 0) > 0 || (Number(leg2.penaltiesB) || 0) > 0)
          ? leg2
          : leg1;

      const pen1 =
        penSource && penaltiesNeeded
          ? penSource.resolvedTeamA === team1
            ? Number(penSource.penaltiesA) || 0
            : Number(penSource.penaltiesB) || 0
          : 0;
      const pen2 =
        penSource && penaltiesNeeded
          ? penSource.resolvedTeamA === team1
            ? Number(penSource.penaltiesB) || 0
            : Number(penSource.penaltiesA) || 0
          : 0;

      let winner: string | null = null;
      let loser: string | null = null;
      if (l1Done && l2Done) {
        if (team1Agg > team2Agg) {
          winner = team1;
          loser = team2;
        } else if (team2Agg > team1Agg) {
          winner = team2;
          loser = team1;
        } else if (pen1 > pen2) {
          winner = team1;
          loser = team2;
        } else if (pen2 > pen1) {
          winner = team2;
          loser = team1;
        }
      }

      if (winner) {
        const wRow = ensureTeam(winner);
        wRow.tiesWon += 1;
      }

      leggedTies.push({
        tieNumber: tieIdx++,
        pairKey,
        team1,
        team2,
        leg1Id: leg1?.id,
        leg2Id: leg2?.id,
        leg1Completed: Boolean(l1Done),
        leg2Completed: Boolean(l2Done),
        leg1Score1,
        leg1Score2,
        leg2Score1,
        leg2Score2,
        team1Agg,
        team2Agg,
        penaltiesNeeded,
        penalties1: pen1,
        penalties2: pen2,
        winner,
        loser,
      });
    });
  }

  const leggedSummary = leggedTies[0] || null;

  // 4. Build Per-Team Match Schedule (Every team's complete fixture list)
  const teamSchedules: TeamScheduleGroup[] = allTeamNames.map((teamName) => {
    const teamSlots = resolvedMatches
      .filter((rm) => rm.resolvedTeamA === teamName || rm.resolvedTeamB === teamName)
      .sort((a, b) => a.roundNumber - b.roundNumber);

    const entries: TeamScheduleEntry[] = teamSlots.map((rm) => {
      const isHome = rm.resolvedTeamA === teamName;
      const opponent = isHome ? rm.resolvedTeamB : rm.resolvedTeamA;
      const myScore = isHome ? rm.scoreA : rm.scoreB;
      const oppScore = isHome ? rm.scoreB : rm.scoreA;

      let outcomeCode: 'W' | 'D' | 'L' | 'TBD' = 'TBD';
      let scoreDisplay = 'Scheduled';

      if (rm.status === 'completed') {
        scoreDisplay = `${myScore} - ${oppScore}`;
        if (rm.winner === teamName) {
          outcomeCode = 'W';
        } else if (rm.loser === teamName) {
          outcomeCode = 'L';
        } else if (myScore > oppScore) {
          outcomeCode = 'W';
        } else if (myScore < oppScore) {
          outcomeCode = 'L';
        } else {
          outcomeCode = 'D';
        }
      }

      return {
        slotId: rm.id,
        stage: rm.stage,
        roundNumber: rm.roundNumber,
        homeOrAway: isHome ? 'HOME' : 'AWAY',
        opponent,
        venue: rm.venue,
        dateDisplay: rm.dateDisplay,
        status: rm.status,
        scoreDisplay,
        outcomeCode,
        bestPlayer: rm.resolvedBestPlayer,
        bestKeeper: rm.resolvedBestKeeper,
        bestDefender: rm.resolvedBestDefender,
      };
    });

    return {
      team: teamName,
      matches: entries,
      playedCount: entries.filter((e) => e.status === 'completed').length,
      scheduledCount: entries.filter((e) => e.status === 'scheduled').length,
    };
  });

  // 5. Auto-compute Player Records & Series Awards from Completed Match Records
  const playerAggMap = new Map<string, TournamentPlayerRecord>();
  const ensurePlayerRecord = (rawName: string, teamHint = ''): TournamentPlayerRecord | null => {
    const cleaned = rawName.trim();
    if (!cleaned) return null;
    const key = cleaned.toLowerCase();
    if (!playerAggMap.has(key)) {
      playerAggMap.set(key, {
        playerName: cleaned,
        teamName: teamHint,
        goals: 0,
        assists: 0,
        cleanSheets: 0,
        potmAwards: 0,
        keeperAwards: 0,
        defenderAwards: 0,
        ratingSum: 0,
        ratingCount: 0,
        avgRating: 0,
        positions: new Set<PlayerPosition>(),
        compositeScore: 0,
      });
    } else if (teamHint && !playerAggMap.get(key)!.teamName) {
      playerAggMap.get(key)!.teamName = teamHint;
    }
    return playerAggMap.get(key)!;
  };

  resolvedMatches.forEach((rm) => {
    if (rm.status !== 'completed') return;

    rm.resolvedPlayerStats.forEach((st) => {
      const rec = ensurePlayerRecord(st.playerName, st.teamName || '');
      if (!rec) return;
      rec.goals += Number(st.goals) || 0;
      rec.assists += Number(st.assists) || 0;
      if (st.cleanSheet) rec.cleanSheets += 1;
      if (st.position) rec.positions.add(st.position);
      if (typeof st.rating === 'number' && st.rating > 0) {
        rec.ratingSum += st.rating;
        rec.ratingCount += 1;
      }
    });

    if (rm.resolvedBestPlayer) {
      const rec = ensurePlayerRecord(rm.resolvedBestPlayer);
      if (rec) rec.potmAwards += 1;
    }
    if (rm.resolvedBestKeeper) {
      const rec = ensurePlayerRecord(rm.resolvedBestKeeper);
      if (rec) {
        rec.keeperAwards += 1;
        rec.positions.add('GK');
      }
    }
    if (rm.resolvedBestDefender) {
      const rec = ensurePlayerRecord(rm.resolvedBestDefender);
      if (rec) {
        rec.defenderAwards += 1;
        rec.positions.add('DEF');
      }
    }
  });

  // Also include any completed club matches linked by seriesId that weren't matched to a slot
  linkedClubMatches.forEach((m) => {
    if (m.status !== 'completed' || matchedClubMatchIds.has(m.id)) return;
    const derived = deriveAwardsFromClubMatch(m);
    derived.stats.forEach((st) => {
      const rec = ensurePlayerRecord(st.playerName, clubName);
      if (!rec) return;
      rec.goals += st.goals;
      rec.assists += st.assists;
      if (st.cleanSheet) rec.cleanSheets += 1;
      if (st.position) rec.positions.add(st.position);
      if (typeof st.rating === 'number' && st.rating > 0) {
        rec.ratingSum += st.rating;
        rec.ratingCount += 1;
      }
    });
    if (derived.bestPlayer) {
      const rec = ensurePlayerRecord(derived.bestPlayer, clubName);
      if (rec) rec.potmAwards += 1;
    }
    if (derived.bestKeeper) {
      const rec = ensurePlayerRecord(derived.bestKeeper, clubName);
      if (rec) {
        rec.keeperAwards += 1;
        rec.positions.add('GK');
      }
    }
    if (derived.bestDefender) {
      const rec = ensurePlayerRecord(derived.bestDefender, clubName);
      if (rec) {
        rec.defenderAwards += 1;
        rec.positions.add('DEF');
      }
    }
  });

  const allPlayerRecords = Array.from(playerAggMap.values()).map((rec) => {
    const avgRating = rec.ratingCount > 0 ? Number((rec.ratingSum / rec.ratingCount).toFixed(2)) : 0;
    const compositeScore =
      rec.potmAwards * 5 +
      rec.goals * 2.5 +
      rec.assists * 2.0 +
      rec.cleanSheets * 1.5 +
      rec.keeperAwards * 2.0 +
      rec.defenderAwards * 2.0 +
      rec.ratingSum;
    return {
      ...rec,
      avgRating,
      compositeScore,
    };
  });

  const topScorersLeaderboard = [...allPlayerRecords]
    .filter((r) => r.goals > 0)
    .sort(
      (a, b) =>
        b.goals - a.goals ||
        b.assists - a.assists ||
        b.potmAwards - a.potmAwards ||
        b.avgRating - a.avgRating ||
        a.playerName.localeCompare(b.playerName)
    );

  const topAssistersLeaderboard = [...allPlayerRecords]
    .filter((r) => r.assists > 0)
    .sort(
      (a, b) =>
        b.assists - a.assists ||
        b.goals - a.goals ||
        b.potmAwards - a.potmAwards ||
        b.avgRating - a.avgRating ||
        a.playerName.localeCompare(b.playerName)
    );

  const keeperLeader = [...allPlayerRecords]
    .filter((r) => r.keeperAwards > 0 || r.positions.has('GK'))
    .sort(
      (a, b) =>
        b.keeperAwards * 5 +
        b.cleanSheets * 3 +
        b.avgRating -
        (a.keeperAwards * 5 + a.cleanSheets * 3 + a.avgRating)
    )[0];

  const defenderLeader = [...allPlayerRecords]
    .filter(
      (r) =>
        r.defenderAwards > 0 ||
        Array.from(r.positions).some((pos) => isDefenderPosition(pos))
    )
    .sort(
      (a, b) =>
        b.defenderAwards * 5 +
        b.cleanSheets * 2.5 +
        b.goals * 1.5 +
        b.assists * 1.2 +
        b.avgRating -
        (a.defenderAwards * 5 +
          a.cleanSheets * 2.5 +
          a.goals * 1.5 +
          a.assists * 1.2 +
          a.avgRating)
    )[0];

  const potsLeader = [...allPlayerRecords].sort(
    (a, b) =>
      b.compositeScore - a.compositeScore ||
      b.potmAwards - a.potmAwards ||
      b.goals - a.goals ||
      b.assists - a.assists
  )[0];

  const topScorerRec = topScorersLeaderboard[0];
  const topAssisterRec = topAssistersLeaderboard[0];

  const matchedPotsPlayer = potsLeader
    ? clubPlayers.find(
        (p) => p.name.trim().toLowerCase() === potsLeader.playerName.trim().toLowerCase()
      )
    : undefined;

  const autoAwards: TournamentAutoAwards = {
    topScorersLeaderboard,
    topAssistersLeaderboard,
    autoTopScorerName: topScorerRec?.playerName || '',
    autoTopScorerStat: topScorerRec
      ? `${topScorerRec.goals} ${topScorerRec.goals === 1 ? 'Goal' : 'Goals'}`
      : '',
    autoTopAssisterName: topAssisterRec?.playerName || '',
    autoTopAssisterStat: topAssisterRec
      ? `${topAssisterRec.assists} ${topAssisterRec.assists === 1 ? 'Assist' : 'Assists'}`
      : '',
    autoBestKeeperName: keeperLeader?.playerName || '',
    autoBestKeeperStat: keeperLeader
      ? keeperLeader.keeperAwards > 0
        ? `${keeperLeader.keeperAwards} Best GK`
        : `${keeperLeader.cleanSheets} CS`
      : '',
    autoBestDefenderName: defenderLeader?.playerName || '',
    autoBestDefenderStat: defenderLeader
      ? defenderLeader.defenderAwards > 0
        ? `${defenderLeader.defenderAwards} Best DEF`
        : `${defenderLeader.cleanSheets} CS`
      : '',
    autoPotsName: potsLeader?.playerName || '',
    autoPotsId: matchedPotsPlayer?.id || '',
    autoPotsReason: potsLeader
      ? [
          potsLeader.potmAwards > 0 ? `${potsLeader.potmAwards} POTM` : '',
          potsLeader.goals > 0 ? `${potsLeader.goals}G` : '',
          potsLeader.assists > 0 ? `${potsLeader.assists}A` : '',
          potsLeader.cleanSheets > 0 ? `${potsLeader.cleanSheets} CS` : '',
        ]
          .filter(Boolean)
          .join(' · ')
      : '',
  };

  // 6. Mark Team Progression Status & Resolved Tournament Winner
  const completedCount = resolvedMatches.filter((m) => m.status === 'completed').length;
  const totalCount = resolvedMatches.length;
  const allMatchesDone = totalCount > 0 && completedCount === totalCount;
  const allLeggedTiesResolved =
    format !== 'legged' || (leggedTies.length > 0 && leggedTies.every((t) => Boolean(t.winner)));
  const hasPendingTiebreaker =
    format === 'legged' && allMatchesDone && !allLeggedTiesResolved;

  let autoWinner = '';

  if (format === 'legged') {
    if (allTeamNames.length === 2 && leggedSummary?.winner) {
      autoWinner = leggedSummary.winner;
      const wRow = statsMap.get(leggedSummary.winner);
      const lRow = leggedSummary.loser ? statsMap.get(leggedSummary.loser) : null;
      if (wRow) {
        wRow.status = 'champion';
        wRow.statusLabel = leggedSummary.penaltiesNeeded
          ? 'Winner (Penalties)'
          : 'Aggregate Winner';
      }
      if (lRow) {
        lRow.status = 'eliminated';
        lRow.statusLabel = 'Eliminated (Aggregate)';
      }
    } else {
      const sortedLegged = Array.from(statsMap.values()).sort(
        (a, b) =>
          b.points - a.points ||
          b.tiesWon - a.tiesWon ||
          b.gd - a.gd ||
          b.gf - a.gf ||
          a.team.localeCompare(b.team)
      );
      if (allMatchesDone && allLeggedTiesResolved && sortedLegged.length > 0) {
        autoWinner = sortedLegged[0].team;
        sortedLegged.forEach((r, idx) => {
          if (idx === 0) {
            r.status = 'champion';
            r.statusLabel = 'Champion (1st Place)';
          } else {
            r.status = 'eliminated';
            r.statusLabel = `Finished #${idx + 1}`;
          }
        });
      } else {
        sortedLegged.forEach((r, idx) => {
          r.status = idx === 0 && r.played > 0 ? 'advancing' : 'active';
          r.statusLabel = idx === 0 && r.played > 0 ? 'Table Leader' : 'In Contention';
        });
      }
    }
  } else if (format === 'knockout' || format === 'hybrid') {
    resolvedMatches.forEach((rm) => {
      if (format === 'hybrid' && rm.stageType === 'group') return;
      if (rm.status === 'completed' && rm.winner && rm.loser) {
        const lRow = statsMap.get(rm.loser);
        const wRow = statsMap.get(rm.winner);
        if (lRow) {
          lRow.status = 'eliminated';
          lRow.statusLabel =
            rm.stageType === 'final'
              ? 'Runner-Up (Final)'
              : rm.stageType === 'semifinal'
              ? 'Eliminated (Semi-Final)'
              : `Eliminated (${rm.stage})`;
        }
        if (wRow) {
          if (rm.stageType === 'final') {
            wRow.status = 'champion';
            wRow.statusLabel = 'Champion';
            autoWinner = rm.winner;
          } else if (wRow.status !== 'champion' && wRow.status !== 'eliminated') {
            wRow.status = 'advancing';
            wRow.statusLabel =
              rm.stageType === 'semifinal' ? 'Advances to Final' : 'Advances to Next Round';
          }
        }
      }
    });
  } else if (format === 'round_robin') {
    const sortedRR = Array.from(statsMap.values()).sort(
      (a, b) => b.points - a.points || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team)
    );
    if (allMatchesDone && sortedRR.length > 0) {
      autoWinner = sortedRR[0].team;
      sortedRR.forEach((r, idx) => {
        if (idx === 0) {
          r.status = 'champion';
          r.statusLabel = 'Champion (1st Place)';
        } else {
          r.status = 'eliminated';
          r.statusLabel = `Finished #${idx + 1}`;
        }
      });
    } else if (sortedRR.length > 0) {
      sortedRR.forEach((r, idx) => {
        r.status = idx === 0 && r.played > 0 ? 'advancing' : 'active';
        r.statusLabel = idx === 0 && r.played > 0 ? 'Table Leader' : 'In Contention';
      });
    }
  }

  const standings = Array.from(statsMap.values()).sort((a, b) => {
    const rank = { champion: 0, advancing: 1, active: 2, eliminated: 3 };
    if (format === 'round_robin' || (format === 'legged' && allTeamNames.length > 2)) {
      return (
        b.points - a.points ||
        b.tiesWon - a.tiesWon ||
        b.gd - a.gd ||
        b.gf - a.gf ||
        rank[a.status] - rank[b.status]
      );
    }
    return rank[a.status] - rank[b.status] || b.points - a.points || b.gd - a.gd || b.gf - a.gf;
  });

  const resolvedWinnerName = (event.winnerName || autoWinner || '').trim();
  const canShowBestPlayers = Boolean(
    totalCount > 0 && completedCount === totalCount && !hasPendingTiebreaker && resolvedWinnerName
  );

  return {
    format,
    teams: allTeamNames,
    resolvedMatches,
    teamSchedules,
    standings,
    groupStandings,
    leggedSummary,
    leggedTies,
    hasPendingTiebreaker,
    completedCount,
    totalCount,
    resolvedWinnerName,
    canShowBestPlayers,
    autoAwards,
  };
}
