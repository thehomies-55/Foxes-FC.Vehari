import React, { useMemo, useState } from 'react';
import {
  Award,
  CalendarPlus,
  Check,
  Edit3,
  Search,
  Shield,
  Swords,
  X,
} from 'lucide-react';
import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ClubProfileConfig,
  MatchRecord,
  OpponentHeadToHead,
  UserRole,
} from '../types';
import { computeOpponentHeadToHead } from '../utils/clubCalculations';

interface HeadToHeadSectionProps {
  clubProfile: ClubProfileConfig;
  matches: MatchRecord[];
  role: UserRole;
  onScheduleVsTeam: (teamName: string) => void;
  onNotify: (msg: string) => void;
}

type H2HFilter = 'all' | 'played' | 'winning' | 'unbeaten';

export const HeadToHeadSection: React.FC<HeadToHeadSectionProps> = ({
  clubProfile,
  matches,
  role,
  onScheduleVsTeam,
  onNotify,
}) => {
  const canEdit = role === 'manager' || role === 'editor';

  const [filter, setFilter] = useState<H2HFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTeamKey, setSelectedTeamKey] = useState<string | null>(null);
  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [savingRename, setSavingRename] = useState(false);

  const opponents = useMemo(() => computeOpponentHeadToHead(matches), [matches]);

  const filteredOpponents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return opponents
      .filter((o) => (q ? o.teamName.toLowerCase().includes(q) : true))
      .filter((o) => {
        if (filter === 'played') return o.played > 0;
        if (filter === 'winning') return o.wins > o.losses;
        if (filter === 'unbeaten') return o.played > 0 && o.losses === 0;
        return true;
      });
  }, [opponents, searchQuery, filter]);

  const selectedOpponent: OpponentHeadToHead | null = useMemo(() => {
    if (filteredOpponents.length === 0) return null;
    if (selectedTeamKey) {
      const found = filteredOpponents.find((o) => o.key === selectedTeamKey);
      if (found) return found;
    }
    return filteredOpponents[0];
  }, [filteredOpponents, selectedTeamKey]);

  const summaryStats = useMemo(() => {
    const playedTeams = opponents.filter((o) => o.played > 0);
    const unbeatenTeams = playedTeams.filter((o) => o.losses === 0).length;
    const totalGf = playedTeams.reduce((sum, o) => sum + o.goalsFor, 0);
    const totalGa = playedTeams.reduce((sum, o) => sum + o.goalsAgainst, 0);
    const topRival = playedTeams[0] || null;
    return {
      teamsFaced: playedTeams.length,
      totalTracked: opponents.length,
      unbeatenTeams,
      totalGf,
      totalGa,
      topRival,
    };
  }, [opponents]);

  const handleStartRename = (opp: OpponentHeadToHead) => {
    setRenamingKey(opp.key);
    setRenameValue(opp.teamName);
  };

  const handleConfirmRename = async (opp: OpponentHeadToHead) => {
    if (!canEdit) return;
    const cleanNext = renameValue.trim().replace(/\s+/g, ' ');
    if (cleanNext.length < 2 || cleanNext.length > 80) {
      onNotify('Team name must be between 2 and 80 characters.');
      return;
    }

    setSavingRename(true);
    try {
      const batch = writeBatch(db);
      for (const m of opp.matches) {
        batch.update(doc(db, 'matches', m.id), {
          opponentName: cleanNext,
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      setRenamingKey(null);
      setSelectedTeamKey(cleanNext.toLowerCase());
      onNotify(`Updated ${opp.matches.length} match record(s) to "${cleanNext}".`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'matches');
    } finally {
      setSavingRename(false);
    }
  };

  return (
    <section id="head-to-head" className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">
              Opponent Clubs &amp; All-Time Matchups
            </p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
              {clubProfile.clubName} Head-to-Head Records
            </h2>
            <p className="mt-1 text-sm text-[var(--fx-text-muted)] max-w-2xl">
              Complete head-to-head results against every opponent club played before—wins, draws, losses, goal difference, clean sheets, recent form, and match history.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1 w-fit">
            {(
              [
                { id: 'all', label: 'All Opponents' },
                { id: 'played', label: 'Played Before' },
                { id: 'winning', label: 'Winning Record' },
                { id: 'unbeaten', label: 'Unbeaten' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  filter === tab.id
                    ? 'bg-[var(--fx-accent)] text-white'
                    : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4-Column H2H KPI Strip */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">Opponent Teams Played</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">
              {summaryStats.teamsFaced}
            </p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)] font-mono-num">
              {summaryStats.totalTracked} total clubs tracked
            </p>
          </div>

          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">Unbeaten Matchups</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-win)]">
              {summaryStats.unbeatenTeams}
            </p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)]">0 losses recorded</p>
          </div>

          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">External Goals For / Against</p>
            <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">
              {summaryStats.totalGf} / {summaryStats.totalGa}
            </p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)] font-mono-num">
              GD {summaryStats.totalGf - summaryStats.totalGa >= 0 ? '+' : ''}
              {summaryStats.totalGf - summaryStats.totalGa}
            </p>
          </div>

          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
            <p className="text-xs text-[var(--fx-text-muted)]">Most Frequent Opponent</p>
            <p className="mt-1 text-lg font-bold text-[var(--fx-text)] truncate">
              {summaryStats.topRival ? summaryStats.topRival.teamName : 'None yet'}
            </p>
            <p className="mt-1 text-xs text-[var(--fx-accent-text)] font-mono-num">
              {summaryStats.topRival
                ? `${summaryStats.topRival.played} played · ${summaryStats.topRival.wins}W-${summaryStats.topRival.draws}D-${summaryStats.topRival.losses}L`
                : 'Log matches to track'}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--fx-text-muted)]" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search opponent team name..."
              className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] pl-9 pr-3 py-2 text-xs text-[var(--fx-text)] placeholder:text-[var(--fx-text-muted)] focus:border-[var(--fx-accent)] focus:outline-none"
            />
          </div>
          <p className="text-xs text-[var(--fx-text-muted)]">
            Select any opponent team to inspect full match history or schedule the next fixture.
          </p>
        </div>

        {filteredOpponents.length === 0 ? (
          <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-12 text-center">
            <Swords className="mx-auto h-8 w-8 text-[var(--fx-text-muted)]" />
            <p className="mt-3 text-sm font-medium text-[var(--fx-text)]">No opponent clubs found</p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)]">
              Schedule or record external matches in Matchday Center to build head-to-head team records.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
            {/* Left: Opponent Directory List */}
            <div className="lg:col-span-5 space-y-3">
              {filteredOpponents.map((opp) => {
                const isSelected = selectedOpponent?.key === opp.key;
                const gdSign = opp.goalDiff > 0 ? '+' : '';
                const recordTone =
                  opp.wins > opp.losses
                    ? 'text-[var(--fx-win)]'
                    : opp.wins < opp.losses
                    ? 'text-[var(--fx-loss)]'
                    : 'text-[var(--fx-text-secondary)]';

                return (
                  <button
                    key={opp.key}
                    type="button"
                    onClick={() => setSelectedTeamKey(opp.key)}
                    className={`w-full text-left rounded-xl border p-4 transition-colors ${
                      isSelected
                        ? 'border-[var(--fx-accent)] bg-[var(--fx-accent-soft)]'
                        : 'border-[var(--fx-border)] bg-[var(--fx-surface)] hover:bg-[var(--fx-surface-hover)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--fx-text-muted)] font-mono-num">
                          {opp.played} Played
                          {opp.scheduled > 0 ? ` · ${opp.scheduled} Upcoming` : ''}
                        </p>
                        <h3 className="font-display mt-0.5 text-xl font-bold text-[var(--fx-text)] truncate">
                          {opp.teamName}
                        </h3>
                      </div>

                      <div className="text-right shrink-0 font-mono-num">
                        <p className={`text-sm font-bold ${recordTone}`}>
                          {opp.wins}W · {opp.draws}D · {opp.losses}L
                        </p>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">
                          {opp.played > 0 ? `${opp.winRate}% Win Rate` : 'Upcoming Only'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-[var(--fx-border)] pt-2.5 text-xs text-[var(--fx-text-muted)] font-mono-num">
                      <span>
                        GF {opp.goalsFor} · GA {opp.goalsAgainst} · GD {gdSign}
                        {opp.goalDiff}
                      </span>

                      {opp.recentForm.length > 0 && (
                        <div className="flex items-center gap-1">
                          {opp.recentForm.map((res, idx) => (
                            <span
                              key={idx}
                              className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                                res === 'W'
                                  ? 'bg-[var(--fx-win-soft)] text-[var(--fx-win)]'
                                  : res === 'L'
                                  ? 'bg-[var(--fx-loss-soft)] text-[var(--fx-loss)]'
                                  : 'bg-[var(--fx-silver-soft)] text-[var(--fx-text-secondary)]'
                              }`}
                            >
                              {res}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Right: Selected Team Full Head-to-Head Breakdown */}
            {selectedOpponent && (
              <div className="lg:col-span-7 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[var(--fx-border)] pb-5">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--fx-accent-text)]">
                      Head-to-Head Matchup Profile
                    </p>
                    {renamingKey === selectedOpponent.key ? (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-1.5 text-sm text-[var(--fx-text)]"
                        />
                        <button
                          type="button"
                          disabled={savingRename}
                          onClick={() => handleConfirmRename(selectedOpponent)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[var(--fx-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)]"
                        >
                          <Check className="h-3.5 w-3.5" />
                          <span>Save</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenamingKey(null)}
                          className="rounded-lg border border-[var(--fx-border-strong)] p-1.5 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <h3 className="font-display mt-1 text-3xl font-bold text-[var(--fx-text)]">
                        {clubProfile.shortName} vs {selectedOpponent.teamName}
                      </h3>
                    )}
                    <p className="mt-1 text-xs text-[var(--fx-text-muted)] font-mono-num">
                      Last fixture date: {selectedOpponent.lastMatchDate} ·{' '}
                      {selectedOpponent.cleanSheets} clean sheets kept
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartRename(selectedOpponent)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] px-3 py-2 text-xs font-medium text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Standardize Name</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onScheduleVsTeam(selectedOpponent.teamName)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)]"
                      >
                        <CalendarPlus className="h-3.5 w-3.5" />
                        <span>Schedule Next Match</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Head-to-Head Scorecard Metrics */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 text-center font-mono-num">
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-3">
                    <p className="font-sans text-[11px] text-[var(--fx-text-muted)]">Played</p>
                    <p className="mt-1 text-xl font-bold text-[var(--fx-text)]">
                      {selectedOpponent.played}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-3">
                    <p className="font-sans text-[11px] text-[var(--fx-win)]">Wins</p>
                    <p className="mt-1 text-xl font-bold text-[var(--fx-win)]">
                      {selectedOpponent.wins}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-3">
                    <p className="font-sans text-[11px] text-[var(--fx-text-muted)]">Draws</p>
                    <p className="mt-1 text-xl font-bold text-[var(--fx-text-secondary)]">
                      {selectedOpponent.draws}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-3">
                    <p className="font-sans text-[11px] text-[var(--fx-loss)]">Losses</p>
                    <p className="mt-1 text-xl font-bold text-[var(--fx-loss)]">
                      {selectedOpponent.losses}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-3">
                    <p className="font-sans text-[11px] text-[var(--fx-text-muted)]">Goals</p>
                    <p className="mt-1 text-xl font-bold text-[var(--fx-text)]">
                      {selectedOpponent.goalsFor}-{selectedOpponent.goalsAgainst}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-3">
                    <p className="font-sans text-[11px] text-[var(--fx-text-muted)]">Clean Sheets</p>
                    <p className="mt-1 text-xl font-bold text-[var(--fx-accent-text)]">
                      {selectedOpponent.cleanSheets}
                    </p>
                  </div>
                </div>

                {/* All Matches Against This Opponent */}
                <div>
                  <h4 className="text-xs font-semibold text-[var(--fx-text-secondary)] mb-3 flex items-center gap-2">
                    <Shield className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
                    <span>
                      Match Log Against {selectedOpponent.teamName} (
                      {selectedOpponent.matches.length})
                    </span>
                  </h4>

                  <div className="divide-y divide-[var(--fx-border)] rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)]">
                    {selectedOpponent.matches.map((m) => {
                      let resultLabel = 'Scheduled';
                      let resultClass = 'text-[var(--fx-warn)]';
                      if (m.status === 'completed') {
                        if (m.goalsFor > m.goalsAgainst) {
                          resultLabel = 'Win';
                          resultClass = 'text-[var(--fx-win)]';
                        } else if (m.goalsFor < m.goalsAgainst) {
                          resultLabel = 'Loss';
                          resultClass = 'text-[var(--fx-loss)]';
                        } else {
                          resultLabel = 'Draw';
                          resultClass = 'text-[var(--fx-text-secondary)]';
                        }
                      }

                      return (
                        <div
                          key={m.id}
                          className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-xs text-[var(--fx-text-muted)] font-mono-num">
                              {m.dateDisplay} · {m.timeDisplay} · {m.competitionName}
                            </p>
                            <p className="mt-0.5 text-sm font-semibold text-[var(--fx-text)]">
                              {clubProfile.shortName} vs {m.opponentName}
                            </p>
                            <p className="text-xs text-[var(--fx-text-muted)] mt-0.5">
                              {m.venue}
                              {m.status === 'completed' && m.officialPotmName ? (
                                <span className="inline-flex items-center gap-1 text-[var(--fx-accent-text)] ml-2">
                                  <Award className="h-3 w-3" />
                                  POTM: {m.officialPotmName}
                                </span>
                              ) : null}
                            </p>
                          </div>

                          <div className="flex items-center gap-4 shrink-0 font-mono-num">
                            <span className={`text-xs font-semibold ${resultClass}`}>
                              {resultLabel}
                            </span>
                            <span className="text-xl font-bold text-[var(--fx-text)]">
                              {m.status === 'completed'
                                ? `${m.goalsFor} - ${m.goalsAgainst}`
                                : 'TBD'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};
