import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  Calendar,
  Database,
  Instagram,
  Medal,
  MessageSquare,
  Newspaper,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Trophy,
  Users,
} from 'lucide-react';
import type {
  ClubMilestonesSummary,
  ClubProfileConfig,
  MatchRecord,
  UserRole,
} from '../types';
import { ASSET_IMAGES } from '../utils/seedData';
import type { AppPageId } from './Header';

interface HeroSectionProps {
  clubProfile: ClubProfileConfig;
  milestones: ClubMilestonesSummary;
  nextFixture: MatchRecord | null;
  role: UserRole;
  isEmptyDb: boolean;
  onSeedData: () => Promise<void>;
  seeding: boolean;
  onNavigate: (page: AppPageId) => void;
  counts: {
    matches: number;
    opponents: number;
    players: number;
    series: number;
    news: number;
    pendingFinesPkr: number;
    discordMessages: number;
  };
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  clubProfile,
  milestones,
  nextFixture,
  role,
  isEmptyDb,
  onSeedData,
  seeding,
  onNavigate,
  counts,
}) => {
  const [heroImgError, setHeroImgError] = useState(false);
  const [crestImgError, setCrestImgError] = useState(false);

  const winRate =
    milestones.gamesPlayed > 0
      ? Math.round((milestones.wins / milestones.gamesPlayed) * 100)
      : 0;

  const totalTrophies =
    milestones.firstPlaceTrophies +
    milestones.secondPlaceTrophies +
    milestones.thirdPlaceTrophies;

  const sectionCards: {
    id: AppPageId;
    title: string;
    subtitle: string;
    meta: string;
    icon: React.ReactNode;
    managerOnly?: boolean;
  }[] = [
    {
      id: 'matchday',
      title: 'Fixtures & Match Results',
      subtitle: 'Schedule matches, view external & inter-club results, and Official POTM awards.',
      meta: `${counts.matches} Matches Recorded`,
      icon: <Calendar className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'head_to_head',
      title: 'Opponent Teams & H2H',
      subtitle: 'Head-to-head W/D/L records, goals, clean sheets & match logs against clubs played before.',
      meta: `${counts.opponents} Opponent Clubs`,
      icon: <Swords className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'squad',
      title: 'Player Stats & Squad',
      subtitle: 'Combined, external & inter-club stats, ratings, cards, and DEF/GK clean sheets.',
      meta: `${counts.players} Squad Players`,
      icon: <Users className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'tournaments',
      title: 'Tournaments & Series',
      subtitle: 'Tournaments, bilateral & tri-series, inter-club series, POTS & position awards.',
      meta: `${counts.series} Series & Cups`,
      icon: <Trophy className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'club_milestones',
      title: 'Club Milestones & Records',
      subtitle: 'All-time W/L/D, goals, biggest win/loss, last 5 form, and trophy cabinet.',
      meta: `${totalTrophies} Trophies Won`,
      icon: <Award className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'player_milestones',
      title: 'Player Milestones',
      subtitle: 'Club record holders for goals, assists, hat-tricks, POTMs, and cards.',
      meta: '8 Leaderboard Records',
      icon: <Medal className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'discipline',
      title: 'Discipline & PKR Fines',
      subtitle: 'Team cards, fine rules (50/100/200 Rs), pending balances & payment ledger.',
      meta: `Rs ${counts.pendingFinesPkr.toLocaleString()} Pending`,
      icon: <ShieldAlert className="h-5 w-5 text-[var(--fx-loss)]" />,
    },
    {
      id: 'news',
      title: 'Club News & Reports',
      subtitle: 'Official match reports, squad announcements, and tournament updates.',
      meta: `${counts.news} Published Posts`,
      icon: <Newspaper className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
    {
      id: 'discord',
      title: 'Club Discord Chat',
      subtitle: 'Two channels: Club Members (saved Instagram ID) and Open Chat for all fans & players.',
      meta: `${counts.discordMessages} Messages · 2 Chat Types`,
      icon: <MessageSquare className="h-5 w-5 text-[var(--fx-accent-text)]" />,
    },
  ];

  if (role === 'manager') {
    sectionCards.push(
      {
        id: 'ig_desk',
        title: 'Fox IG Match Alerts',
        subtitle: 'Manager-only host & player Instagram IDs and direct match alert sender.',
        meta: 'Manager Only',
        icon: <Instagram className="h-5 w-5 text-[var(--fx-accent-text)]" />,
        managerOnly: true,
      },
      {
        id: 'club_settings',
        title: 'Club Settings & IG IDs',
        subtitle: 'Edit club name, short name, founding date, crest logo, home ground & player IG IDs.',
        meta: 'Manager Only',
        icon: <Settings className="h-5 w-5 text-[var(--fx-accent-text)]" />,
        managerOnly: true,
      },
      {
        id: 'access',
        title: 'Editor Permissions',
        subtitle: 'Grant or revoke edit access for trusted club members.',
        meta: 'Manager Only',
        icon: <ShieldCheck className="h-5 w-5 text-[var(--fx-accent-text)]" />,
        managerOnly: true,
      }
    );
  }

  const crestFallbackCode =
    clubProfile.shortName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || 'FC';

  return (
    <section id="top" className="bg-[var(--fx-bg)]">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-12">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-stretch">
          {/* Left editorial block */}
          <div className="lg:col-span-6 flex flex-col justify-between gap-6">
            <div>
              <p className="text-xs font-medium tracking-wide text-[var(--fx-text-muted)]">
                {clubProfile.shortName} <span aria-hidden="true">·</span> {clubProfile.foundingDate}{' '}
                <span aria-hidden="true">·</span> {clubProfile.homeGround}{' '}
                <span aria-hidden="true">·</span> Managed by Fox
              </p>

              <h1 className="font-display mt-3 text-4xl font-bold tracking-tight text-[var(--fx-text)] sm:text-5xl lg:text-6xl leading-[1.04] [text-wrap:balance]">
                {clubProfile.clubName} Matchday &amp; Squad Command
              </h1>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => onNavigate('matchday')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--fx-accent)] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[var(--fx-accent-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[42px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)]"
                >
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>Open Matchday Center</span>
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate('discord')}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-5 py-2.5 text-sm font-semibold text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[42px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)]"
                >
                  <MessageSquare className="h-4 w-4 shrink-0 text-[var(--fx-accent-text)]" />
                  <span>Open Discord Chat</span>
                </button>
              </div>
            </div>

            {role === 'manager' && isEmptyDb && (
              <div className="rounded-xl border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[var(--fx-accent-fg)]">
                    Database Ready for Initialization
                  </p>
                  <p className="text-xs text-[var(--fx-text-secondary)] mt-0.5">
                    Load starter Foxes FC Vehari roster, fixtures, series, and discipline records in one click.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onSeedData}
                  disabled={seeding}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
                >
                  <Database className="h-3.5 w-3.5" />
                  <span>{seeding ? 'Initializing...' : 'Load Starter Club Data'}</span>
                </button>
              </div>
            )}
          </div>

          {/* Right stadium visual & themed Matchday Schedule card */}
          <div className="lg:col-span-6 relative min-h-[300px] lg:min-h-[360px] overflow-hidden rounded-xl border border-[var(--fx-border-strong)] bg-gradient-to-br from-[var(--fx-bg)] via-[var(--fx-bg-alt)] to-[var(--fx-surface)] flex flex-col justify-between">
            {!heroImgError ? (
              <img
                src={ASSET_IMAGES.heroPitch}
                alt="Foxes FC Vehari playing under stadium floodlights"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgError(true)}
                className="absolute inset-0 h-full w-full object-cover opacity-20"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Shield className="h-24 w-24 text-[var(--fx-accent)] opacity-15" />
              </div>
            )}

            <div className="relative z-10 flex items-center justify-between p-4 sm:p-5">
              <div className="h-12 w-12 overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] shadow-sm">
                {clubProfile.logoUrl && !crestImgError ? (
                  <img
                    src={clubProfile.logoUrl}
                    alt={`${clubProfile.clubName} Crest`}
                    referrerPolicy="no-referrer"
                    onError={() => setCrestImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold text-[var(--fx-accent-text)]">
                    {crestFallbackCode}
                  </div>
                )}
              </div>
              <span className="rounded-md border border-[var(--fx-accent-border)] bg-[var(--fx-surface)]/90 px-2.5 py-1 text-[11px] font-semibold text-[var(--fx-accent-fg)] shadow-xs">
                {clubProfile.homeGround}
              </span>
            </div>

            {(clubProfile.clubSlogan || '').trim() && (
              <div className="relative z-10 px-4 sm:px-5 py-2 flex-1 flex flex-col justify-center">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--fx-accent-text)]">
                  Club Slogan
                </p>
                <p className="mt-1 border-l-2 border-[var(--fx-accent)] pl-3 font-display text-xl sm:text-2xl font-bold leading-snug tracking-tight text-[var(--fx-text)]">
                  {(clubProfile.clubSlogan || '').trim()}
                </p>
              </div>
            )}

            <div className="relative z-10 m-4 sm:m-5 rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)]/95 p-5 shadow-sm backdrop-blur-sm">
              {nextFixture ? (
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-[var(--fx-accent-text)]">
                      Next Scheduled Fixture <span aria-hidden="true">·</span>{' '}
                      {nextFixture.matchType === 'inter_club'
                        ? 'Inter-Club'
                        : nextFixture.competitionName || 'Club Match'}
                    </p>
                    <p className="font-display text-2xl sm:text-3xl font-bold text-[var(--fx-text)] mt-0.5">
                      {nextFixture.matchType === 'inter_club'
                        ? `${clubProfile.shortName} ${nextFixture.subTeamA} vs ${clubProfile.shortName} ${nextFixture.subTeamB}`
                        : `${clubProfile.shortName} vs ${nextFixture.opponentName}`}
                    </p>
                    <p className="text-xs text-[var(--fx-text-secondary)] mt-1 font-mono-num">
                      {nextFixture.dateDisplay} <span aria-hidden="true">·</span>{' '}
                      {nextFixture.timeDisplay} <span aria-hidden="true">·</span>{' '}
                      {nextFixture.venue}
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-[var(--fx-accent-text)]">Matchday Schedule</p>
                  <p className="font-display text-2xl font-bold text-[var(--fx-text)] mt-0.5">
                    No Upcoming Fixture Scheduled
                  </p>
                  <p className="text-xs text-[var(--fx-text-secondary)] mt-1">
                    Open Matchday Center to schedule upcoming fixtures.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Full-width 4-column KPI strip */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">Club Matches Played</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">
              {milestones.gamesPlayed}
            </p>
            <p className="text-xs text-[var(--fx-text-muted)] mt-1 font-mono-num">
              +{milestones.interClubPlayed} inter-club
            </p>
          </div>

          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">Win Rate</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">
              {winRate}%
            </p>
            <p className="text-xs text-[var(--fx-text-muted)] mt-1 font-mono-num">
              {milestones.wins}W · {milestones.draws}D · {milestones.losses}L
            </p>
          </div>

          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">Goals Scored / Conceded</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">
              {milestones.goalsScored} / {milestones.goalsConceded}
            </p>
            <p className="text-xs text-[var(--fx-text-muted)] mt-1 font-mono-num">
              {milestones.cleanSheets} clean sheets
            </p>
          </div>

          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)] flex items-center justify-between">
              <span>Trophies Won</span>
              <Trophy className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
            </p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">
              {totalTrophies}
            </p>
            <p className="text-xs text-[var(--fx-text-muted)] mt-1 font-mono-num">
              1st: {milestones.firstPlaceTrophies} · 2nd: {milestones.secondPlaceTrophies} · 3rd:{' '}
              {milestones.thirdPlaceTrophies}
            </p>
          </div>
        </div>

        {/* Dedicated Start Page Directory: Click Buttons for Every Separate Section Page */}
        <div className="mt-12 border-t border-[var(--fx-border)] pt-10">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">
              Club Sections Directory
            </p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)]">
              Explore Every {clubProfile.clubName} Section
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {sectionCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onNavigate(card.id)}
                className={`group text-left rounded-xl border p-5 transition-all duration-150 flex flex-col justify-between gap-4 min-h-[156px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)] ${
                  card.managerOnly
                    ? 'border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] hover:bg-[var(--fx-surface-hover)]'
                    : 'border-[var(--fx-border)] bg-[var(--fx-surface)] hover:bg-[var(--fx-surface-hover)] hover:border-[var(--fx-accent-border)]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)]">
                      {card.icon}
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--fx-text-muted)] transition-transform duration-150 group-hover:translate-x-1 group-hover:text-[var(--fx-accent-text)]" />
                  </div>
                  <h3 className="font-display mt-4 text-xl font-bold text-[var(--fx-text)]">
                    {card.title}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--fx-text-muted)]">
                    {card.subtitle}
                  </p>
                </div>

                <p className="text-[11px] font-medium text-[var(--fx-accent-text)] font-mono-num">
                  {card.meta}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
