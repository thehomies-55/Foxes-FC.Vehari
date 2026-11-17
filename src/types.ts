export type PlayerPositionGroup = 'GK' | 'DEF' | 'MID' | 'FWD';
export type PlayerPosition =
  | 'GK'
  | 'CB'
  | 'LB'
  | 'RB'
  | 'LWB'
  | 'RWB'
  | 'DEF'
  | 'CDM'
  | 'CM'
  | 'CAM'
  | 'LM'
  | 'RM'
  | 'MID'
  | 'LW'
  | 'RW'
  | 'CF'
  | 'ST'
  | 'FWD';
export type UserRole = 'manager' | 'editor' | 'fan' | 'guest';
export type StatsScope = 'combined' | 'external' | 'inter_club';
export type MatchType = 'external' | 'inter_club';
export type MatchStatus = 'scheduled' | 'completed';
export type SeriesCategory = 'tournament' | 'bilateral' | 'triseries' | 'inter_club';
export type TournamentFormat = 'round_robin' | 'knockout' | 'hybrid' | 'legged';
export type RoundRobinMeetings = 1 | 2 | 3;
export type HybridGroupSize = 2 | 3 | 4 | 5;
export type SeriesPlacement = '1st' | '2nd' | '3rd' | 'ongoing' | 'participated';
export type DisciplineReason = 'yellow_card' | 'red_card' | 'misbehavior' | 'no_show';
export type DiscordChannel = 'club-members' | 'open-fan-chat';

export interface Player {
  id: string;
  name: string;
  age: number;
  jerseyNumber: number;
  position: PlayerPosition;
  photoUrl: string;
  extGames: number;
  extGoals: number;
  extAssists: number;
  extRatingSum: number;
  extPenalties: number;
  extRedCards: number;
  extYellowCards: number;
  extPotm: number;
  extCleanSheets: number;
  icGames: number;
  icGoals: number;
  icAssists: number;
  icRatingSum: number;
  icPenalties: number;
  icRedCards: number;
  icYellowCards: number;
  icPotm: number;
  icCleanSheets: number;
  hatTricks: number;
  bestSingleGameGoals: number;
  bestSingleGameAssists: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface MatchPerformance {
  playerId: string;
  playerName: string;
  position: PlayerPosition;
  goals: number;
  assists: number;
  rating: number;
  penaltiesScored: number;
  yellowCards: number;
  redCards: number;
  cleanSheet: boolean;
}

export interface MatchRecord {
  id: string;
  matchType: MatchType;
  opponentName: string;
  subTeamA: string;
  subTeamB: string;
  dateDisplay: string;
  timeDisplay: string;
  dateIso: string;
  venue: string;
  status: MatchStatus;
  goalsFor: number;
  goalsAgainst: number;
  subTeamAScore: number;
  subTeamBScore: number;
  seriesId: string;
  competitionName: string;
  performances: MatchPerformance[];
  suggestedPotmId: string;
  suggestedPotmName: string;
  suggestedPotmReason: string;
  officialPotmId: string;
  officialPotmName: string;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TournamentSlotPlayerStat {
  playerName: string;
  teamName?: string;
  position?: PlayerPosition;
  goals: number;
  assists: number;
  rating?: number;
  cleanSheet?: boolean;
}

export interface TournamentMatchSlot {
  id: string;
  stage: string;
  stageType: 'group' | 'knockout' | 'semifinal' | 'final' | 'round_robin' | 'leg1' | 'leg2';
  groupName?: string;
  roundNumber: number;
  teamA: string;
  teamB: string;
  placeholderA?: string;
  placeholderB?: string;
  sourceSlotAId?: string;
  sourceSlotBId?: string;
  venue: string;
  dateDisplay: string;
  status: MatchStatus;
  scoreA: number;
  scoreB: number;
  penaltiesA?: number;
  penaltiesB?: number;
  bestPlayerName?: string;
  bestKeeperName?: string;
  bestDefenderName?: string;
  playerStats?: TournamentSlotPlayerStat[];
  notes?: string;
}

export interface SeriesEvent {
  id: string;
  title: string;
  category: SeriesCategory;
  format?: TournamentFormat;
  roundRobinMeetings?: RoundRobinMeetings;
  hybridGroupSize?: HybridGroupSize;
  teams?: string[];
  winnerName?: string;
  tournamentMatches?: TournamentMatchSlot[];
  tournamentType?: string;
  teamsSummary: string;
  placement: SeriesPlacement;
  startDate: string;
  endDate: string;
  status: 'ongoing' | 'completed';
  suggestedPotsId: string;
  suggestedPotsName: string;
  officialPotsId: string;
  officialPotsName: string;
  topScorerName: string;
  topScorerStat: string;
  topAssisterName: string;
  topAssisterStat: string;
  bestKeeperName: string;
  bestDefenderName: string;
  summary: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface NewsPost {
  id: string;
  title: string;
  category: 'Match Report' | 'Club Announcement' | 'Squad Update' | 'Tournament';
  body: string;
  photoUrl?: string;
  authorName: string;
  authorUid: string;
  publishedDate: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DisciplineIncident {
  id: string;
  playerId: string;
  playerName: string;
  matchLabel: string;
  reason: DisciplineReason;
  finePkr: 50 | 100 | 200;
  status: 'pending' | 'paid';
  notes: string;
  incidentDate: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface DiscordMessage {
  id: string;
  channel: DiscordChannel;
  text: string;
  authorUid: string;
  authorName: string;
  authorRole: 'manager' | 'editor' | 'member' | 'fan';
  verifiedIgHandle: string;
  createdAt?: unknown;
}

export interface EditorGrant {
  id: string;
  email: string;
  displayName: string;
  grantedByUid: string;
  createdAt?: unknown;
}

export interface PlayerIgContact {
  id: string;
  playerId: string;
  playerName: string;
  instagramId: string;
  updatedAt?: unknown;
}

export interface IgAlertLog {
  id: string;
  matchId: string;
  matchLabel: string;
  playerId: string;
  playerName: string;
  recipientIgId: string;
  hostIgId: string;
  messageText: string;
  sentAt?: unknown;
}

export interface ClubTrophyConfig {
  firstPlaceBonus: number;
  secondPlaceBonus: number;
  thirdPlaceBonus: number;
}

export type WebsiteThemeId =
  | 'obsidian_orange'
  | 'midnight_emerald'
  | 'royal_navy'
  | 'crimson_slate'
  | 'light_ivory';

export interface ClubProfileConfig {
  clubName: string;
  shortName: string;
  foundingDate: string;
  logoUrl: string;
  homeGround: string;
  clubSlogan?: string;
  websiteTheme?: WebsiteThemeId;
}

export interface ScopedPlayerStats {
  games: number;
  goals: number;
  assists: number;
  avgRating: number;
  penalties: number;
  redCards: number;
  yellowCards: number;
  potm: number;
  cleanSheets: number | null;
}

export interface ClubMilestonesSummary {
  gamesPlayed: number;
  interClubPlayed: number;
  goalsScored: number;
  goalsConceded: number;
  wins: number;
  losses: number;
  draws: number;
  cleanSheets: number;
  biggestWin: string;
  biggestLoss: string;
  lastFive: ('W' | 'L' | 'D')[];
  firstPlaceTrophies: number;
  secondPlaceTrophies: number;
  thirdPlaceTrophies: number;
}

export interface PlayerMilestoneLeader {
  label: string;
  playerName: string;
  position: PlayerPosition | null;
  value: number;
  unit: string;
}

export interface OpponentHeadToHead {
  key: string;
  teamName: string;
  played: number;
  scheduled: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  cleanSheets: number;
  winRate: number;
  lastMatchDate: string;
  recentForm: ('W' | 'D' | 'L')[];
  matches: MatchRecord[];
}
