import React, { useEffect, useMemo, useState } from 'react';
import { Award, Calendar, Check, Edit3, Plus, Sparkles, Swords, Trash2, X } from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ClubProfileConfig,
  MatchPerformance,
  MatchRecord,
  MatchStatus,
  MatchType,
  Player,
  SeriesEvent,
  UserRole,
} from '../types';
import {
  computeOpponentHeadToHead,
  computeSuggestedPotm,
  isDefensiveOrKeeperPosition,
  normalizeOpponentDisplay,
  normalizeOpponentKey,
} from '../utils/clubCalculations';

interface MatchdaySectionProps {
  clubProfile: ClubProfileConfig;
  matches: MatchRecord[];
  players: Player[];
  seriesList: SeriesEvent[];
  role: UserRole;
  currentUid: string | null;
  prefillOpponent?: string;
  onClearPrefillOpponent?: () => void;
  onNotify: (msg: string) => void;
}

type MatchFilterTab = 'all' | 'scheduled' | 'completed' | 'inter_club';

export const MatchdaySection: React.FC<MatchdaySectionProps> = ({
  clubProfile,
  matches,
  players,
  seriesList,
  role,
  currentUid,
  prefillOpponent,
  onClearPrefillOpponent,
  onNotify,
}) => {
  const canEdit = role === 'manager' || role === 'editor';
  const isManager = role === 'manager';

  const [filterTab, setFilterTab] = useState<MatchFilterTab>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState<MatchRecord | null>(null);

  // Form states
  const [matchType, setMatchType] = useState<MatchType>('external');
  const [opponentName, setOpponentName] = useState('');
  const [subTeamA, setSubTeamA] = useState('ORANGE');
  const [subTeamB, setSubTeamB] = useState('OBSIDIAN');
  const [dateIso, setDateIso] = useState('2026-11-22');
  const [timeDisplay, setTimeDisplay] = useState('7:30 PM');
  const [venue, setVenue] = useState(clubProfile.homeGround);
  const [status, setStatus] = useState<MatchStatus>('scheduled');
  const [goalsFor, setGoalsFor] = useState(0);
  const [goalsAgainst, setGoalsAgainst] = useState(0);
  const [subTeamAScore, setSubTeamAScore] = useState(0);
  const [subTeamBScore, setSubTeamBScore] = useState(0);
  const [seriesId, setSeriesId] = useState('');
  const [competitionName, setCompetitionName] = useState('Club Friendly');
  const [performances, setPerformances] = useState<MatchPerformance[]>([]);
  const [officialPotmId, setOfficialPotmId] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick performance row builder
  const [perfPlayerId, setPerfPlayerId] = useState('');
  const [perfGoals, setPerfGoals] = useState(0);
  const [perfAssists, setPerfAssists] = useState(0);
  const [perfRating, setPerfRating] = useState(7.5);
  const [perfPenalties, setPerfPenalties] = useState(0);
  const [perfYellow, setPerfYellow] = useState(0);
  const [perfRed, setPerfRed] = useState(0);
  const [perfCleanSheet, setPerfCleanSheet] = useState(false);

  const liveSuggestion = useMemo(() => computeSuggestedPotm(performances), [performances]);

  const recentOpponents = useMemo(() => {
    return [...computeOpponentHeadToHead(matches)].sort((a, b) =>
      b.lastMatchDate.localeCompare(a.lastMatchDate)
    );
  }, [matches]);

  const matchedOpponent = useMemo(() => {
    const key = normalizeOpponentKey(opponentName);
    if (!key) return null;
    return recentOpponents.find((o) => o.key === key) || null;
  }, [opponentName, recentOpponents]);

  const fuzzyOpponentSuggestions = useMemo(() => {
    const q = normalizeOpponentKey(opponentName);
    if (!q || matchedOpponent) return recentOpponents.slice(0, 6);
    const matching = recentOpponents.filter((o) => o.key.includes(q));
    return matching.length > 0 ? matching.slice(0, 6) : recentOpponents.slice(0, 6);
  }, [opponentName, matchedOpponent, recentOpponents]);

  useEffect(() => {
    if (!prefillOpponent || !canEdit) return;
    setEditingMatch(null);
    setMatchType('external');
    setOpponentName(prefillOpponent);
    setSubTeamA('ORANGE');
    setSubTeamB('OBSIDIAN');
    setDateIso('2026-11-22');
    setTimeDisplay('7:30 PM');
    setVenue(clubProfile.homeGround);
    setStatus('scheduled');
    setGoalsFor(0);
    setGoalsAgainst(0);
    setSubTeamAScore(0);
    setSubTeamBScore(0);
    setSeriesId('');
    setCompetitionName('Club Match');
    setPerformances([]);
    setOfficialPotmId('');
    setPerfPlayerId(players[0]?.id || '');
    setModalOpen(true);
    onClearPrefillOpponent?.();
  }, [prefillOpponent, canEdit, clubProfile.homeGround, players, onClearPrefillOpponent]);

  const sortedMatches = useMemo(() => {
    const list = [...matches].sort((a, b) => b.dateIso.localeCompare(a.dateIso));
    if (filterTab === 'scheduled') return list.filter((m) => m.status === 'scheduled');
    if (filterTab === 'completed') return list.filter((m) => m.status === 'completed');
    if (filterTab === 'inter_club') return list.filter((m) => m.matchType === 'inter_club');
    return list;
  }, [matches, filterTab]);

  const formatDateDisplay = (iso: string) => {
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}`;
  };

  const openCreateModal = () => {
    setEditingMatch(null);
    setMatchType('external');
    setOpponentName('');
    setSubTeamA('ORANGE');
    setSubTeamB('OBSIDIAN');
    setDateIso('2026-11-22');
    setTimeDisplay('7:30 PM');
    setVenue(clubProfile.homeGround);
    setStatus('scheduled');
    setGoalsFor(0);
    setGoalsAgainst(0);
    setSubTeamAScore(0);
    setSubTeamBScore(0);
    setSeriesId('');
    setCompetitionName('Club Match');
    setPerformances([]);
    setOfficialPotmId('');
    setPerfPlayerId(players[0]?.id || '');
    setModalOpen(true);
  };

  const openEditModal = (m: MatchRecord) => {
    setEditingMatch(m);
    setMatchType(m.matchType);
    setOpponentName(m.opponentName);
    setSubTeamA(m.subTeamA || 'ORANGE');
    setSubTeamB(m.subTeamB || 'OBSIDIAN');
    setDateIso(m.dateIso);
    setTimeDisplay(m.timeDisplay);
    setVenue(m.venue);
    setStatus(m.status);
    setGoalsFor(m.goalsFor);
    setGoalsAgainst(m.goalsAgainst);
    setSubTeamAScore(m.subTeamAScore);
    setSubTeamBScore(m.subTeamBScore);
    setSeriesId(m.seriesId);
    setCompetitionName(m.competitionName);
    setPerformances(m.performances || []);
    setOfficialPotmId(m.officialPotmId || '');
    setPerfPlayerId(players[0]?.id || '');
    setModalOpen(true);
  };

  const handleAddPerformance = () => {
    const player = players.find((p) => p.id === perfPlayerId);
    if (!player) return;
    const nextRow: MatchPerformance = {
      playerId: player.id,
      playerName: player.name,
      position: player.position,
      goals: Number(perfGoals) || 0,
      assists: Number(perfAssists) || 0,
      rating: Math.min(10, Math.max(1, Number(perfRating) || 7.0)),
      penaltiesScored: Number(perfPenalties) || 0,
      yellowCards: Number(perfYellow) || 0,
      redCards: Number(perfRed) || 0,
      cleanSheet: isDefensiveOrKeeperPosition(player.position) ? perfCleanSheet : false,
    };
    setPerformances((prev) => [
      ...prev.filter((r) => r.playerId !== player.id),
      nextRow,
    ]);
    setPerfGoals(0);
    setPerfAssists(0);
    setPerfPenalties(0);
    setPerfYellow(0);
    setPerfRed(0);
    setPerfCleanSheet(false);
  };

  const handleSaveMatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !currentUid) return;
    setSaving(true);

    const selectedSeries = seriesList.find((s) => s.id === seriesId);
    const chosenPotmPlayer = players.find((p) => p.id === officialPotmId);
    const safeOfficialId = isManager ? officialPotmId : editingMatch?.officialPotmId || '';
    const safeOfficialName = isManager
      ? chosenPotmPlayer?.name || ''
      : editingMatch?.officialPotmName || '';

    const normalizedInput = normalizeOpponentDisplay(opponentName);
    const existingOpponent = recentOpponents.find(
      (o) => o.key === normalizeOpponentKey(normalizedInput)
    );
    const canonicalOpponentName = existingOpponent ? existingOpponent.teamName : normalizedInput;

    const payload = {
      matchType,
      opponentName: matchType === 'external' ? canonicalOpponentName : '',
      subTeamA: matchType === 'inter_club' ? subTeamA.trim().toUpperCase() : '',
      subTeamB: matchType === 'inter_club' ? subTeamB.trim().toUpperCase() : '',
      dateIso,
      dateDisplay: formatDateDisplay(dateIso),
      timeDisplay: timeDisplay.trim(),
      venue: venue.trim(),
      status,
      goalsFor: matchType === 'external' ? Number(goalsFor) || 0 : 0,
      goalsAgainst: matchType === 'external' ? Number(goalsAgainst) || 0 : 0,
      subTeamAScore: matchType === 'inter_club' ? Number(subTeamAScore) || 0 : 0,
      subTeamBScore: matchType === 'inter_club' ? Number(subTeamBScore) || 0 : 0,
      seriesId: seriesId || '',
      competitionName: selectedSeries?.title || competitionName.trim() || 'Club Match',
      performances,
      suggestedPotmId: liveSuggestion.suggestedPotmId,
      suggestedPotmName: liveSuggestion.suggestedPotmName,
      suggestedPotmReason: liveSuggestion.suggestedPotmReason,
      officialPotmId: safeOfficialId,
      officialPotmName: safeOfficialName,
    };

    try {
      if (editingMatch) {
        await updateDoc(doc(db, 'matches', editingMatch.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        onNotify('Match record updated.');
      } else {
        const newId = `match_${dateIso.replace(/[^0-9]/g, '_')}_${Date.now()}`;
        await setDoc(doc(db, 'matches', newId), {
          ...payload,
          createdByUid: currentUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        onNotify('Match fixture saved.');
      }
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingMatch ? OperationType.UPDATE : OperationType.CREATE, 'matches');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignOfficialPotm = async (matchId: string, playerId: string) => {
    if (!isManager) return;
    const player = players.find((p) => p.id === playerId);
    try {
      await updateDoc(doc(db, 'matches', matchId), {
        officialPotmId: player ? player.id : '',
        officialPotmName: player ? player.name : '',
        updatedAt: serverTimestamp(),
      });
      onNotify(
        player
          ? `Official POTM awarded to ${player.name} by Manager.`
          : 'Official POTM cleared.'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
    }
  };

  const handleDeleteMatch = async (matchId: string) => {
    if (!isManager) return;
    try {
      await deleteDoc(doc(db, 'matches', matchId));
      onNotify('Match deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `matches/${matchId}`);
    }
  };

  return (
    <section id="matchday" className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">
              Fixtures, Results &amp; Player of the Match
            </p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
              Matchday Schedule &amp; Results
            </h2>
            <p className="mt-1 text-sm text-[var(--fx-text-muted)]">
              External club matches and inter-club Foxes fixtures. Automated POTM suggestions assist selection; only the Manager assigns Official POTM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1">
              {(
                [
                  { id: 'all', label: 'All Matches' },
                  { id: 'scheduled', label: 'Upcoming' },
                  { id: 'completed', label: 'Results' },
                  { id: 'inter_club', label: 'Inter-Club' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilterTab(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    filterTab === tab.id
                      ? 'bg-[var(--fx-accent)] text-white'
                      : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {canEdit && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <Plus className="h-4 w-4" />
                <span>Add Match</span>
              </button>
            )}
          </div>
        </div>

        {sortedMatches.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-10 text-center">
            <Calendar className="mx-auto h-8 w-8 text-[var(--fx-text-muted)]" />
            <p className="mt-3 text-sm font-medium text-[var(--fx-text)]">No matches in this filter</p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)]">
              Schedule upcoming fixtures or log completed results to track Foxes FC.vehari form.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {sortedMatches.map((match) => {
              const isExternal = match.matchType === 'external';
              const isCompleted = match.status === 'completed';

              let outcomeText = 'Scheduled';
              let outcomeColor = 'text-[var(--fx-warn)]';
              if (isCompleted) {
                if (isExternal) {
                  if (match.goalsFor > match.goalsAgainst) {
                    outcomeText = 'Win';
                    outcomeColor = 'text-[var(--fx-win)]';
                  } else if (match.goalsFor < match.goalsAgainst) {
                    outcomeText = 'Loss';
                    outcomeColor = 'text-[var(--fx-loss)]';
                  } else {
                    outcomeText = 'Draw';
                    outcomeColor = 'text-[var(--fx-text-secondary)]';
                  }
                } else {
                  outcomeText = 'Inter-Club Result';
                  outcomeColor = 'text-[var(--fx-accent-text)]';
                }
              }

              return (
                <article
                  key={match.id}
                  className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3 text-xs text-[var(--fx-text-muted)]">
                      <span className="truncate">
                        {isExternal ? 'External Club Match' : 'Inter-Club Match'} ·{' '}
                        {match.competitionName}
                      </span>
                      <span className={`font-semibold whitespace-nowrap shrink-0 ${outcomeColor}`}>
                        {outcomeText}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-display text-2xl font-bold text-[var(--fx-text)] truncate">
                          {isExternal
                            ? `${clubProfile.clubName} vs ${match.opponentName}`
                            : `${clubProfile.shortName} ${match.subTeamA} vs ${clubProfile.shortName} ${match.subTeamB}`}
                        </h3>
                        <p className="mt-1 text-xs text-[var(--fx-text-muted)] font-mono-num">
                          {match.dateDisplay} · {match.timeDisplay} · {match.venue}
                        </p>
                      </div>

                      {isCompleted ? (
                        <div className="font-mono-num text-3xl font-bold text-[var(--fx-text)] shrink-0">
                          {isExternal
                            ? `${match.goalsFor} - ${match.goalsAgainst}`
                            : `${match.subTeamAScore} - ${match.subTeamBScore}`}
                        </div>
                      ) : (
                        <div className="font-mono-num text-sm font-semibold text-[var(--fx-warn)] shrink-0">
                          {match.timeDisplay}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* POTM & Manager Control Row */}
                  {isCompleted && (
                    <div className="border-t border-[var(--fx-border)] pt-3 flex flex-col gap-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 text-[var(--fx-text-secondary)]">
                          <Award className="h-4 w-4 text-[var(--fx-accent-text)] shrink-0" />
                          <span>
                            Official POTM:{' '}
                            <strong className="text-[var(--fx-text)]">
                              {match.officialPotmName || 'Awaiting Manager Selection'}
                            </strong>
                          </span>
                        </div>

                        {match.suggestedPotmName && (
                          <span className="text-[var(--fx-text-muted)] flex items-center gap-1">
                            <Sparkles className="h-3.5 w-3.5 text-[var(--fx-warn)]" />
                            Suggested: {match.suggestedPotmName}
                            {match.suggestedPotmReason ? ` (${match.suggestedPotmReason})` : ''}
                          </span>
                        )}
                      </div>

                      {isManager && players.length > 0 && (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-[var(--fx-text-muted)] shrink-0">
                            Manager POTM Override:
                          </label>
                          <select
                            value={match.officialPotmId || ''}
                            onChange={(e) => handleAssignOfficialPotm(match.id, e.target.value)}
                            className="flex-1 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
                          >
                            <option value="">-- Select Official POTM --</option>
                            {players.map((p) => (
                              <option key={p.id} value={p.id}>
                                #{p.jerseyNumber} {p.name} ({p.position})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {canEdit && (
                    <div className="border-t border-[var(--fx-border)] pt-3 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(match)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        <span>Edit Match</span>
                      </button>
                      {isManager && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMatch(match.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-loss-border)] px-3 py-1.5 text-xs font-medium text-[var(--fx-loss)] hover:bg-[var(--fx-loss-soft)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Match Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                {editingMatch ? 'Update Match Record' : 'Schedule or Log Match'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMatch} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Match Type
                  </label>
                  <select
                    value={matchType}
                    onChange={(e) => setMatchType(e.target.value as MatchType)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  >
                    <option value="external">External (Foxes FC vs Opponent)</option>
                    <option value="inter_club">Inter-Club (Foxes vs Foxes)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Match Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as MatchStatus)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  >
                    <option value="scheduled">Scheduled Fixture</option>
                    <option value="completed">Completed Result</option>
                  </select>
                </div>
              </div>

              {matchType === 'external' ? (
                <div className="space-y-2.5">
                  <div>
                    <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                      Opponent Team Name
                    </label>
                    <input
                      type="text"
                      required
                      list="recent-opponent-teams"
                      value={opponentName}
                      onChange={(e) => setOpponentName(e.target.value)}
                      placeholder="Select recent team or enter new club name"
                      className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
                    />
                    <datalist id="recent-opponent-teams">
                      {recentOpponents.map((opp) => (
                        <option key={opp.key} value={opp.teamName} />
                      ))}
                    </datalist>
                  </div>

                  {matchedOpponent && (
                    <div className="rounded-lg border border-[var(--fx-win-border)] bg-[var(--fx-win-soft)] px-3 py-2 flex items-center justify-between gap-2 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-[var(--fx-win)] font-medium">
                        <Swords className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Linked H2H Record: {matchedOpponent.teamName}
                        </span>
                      </span>
                      <span className="font-mono-num text-[var(--fx-text-secondary)]">
                        {matchedOpponent.played}P · {matchedOpponent.wins}W-{matchedOpponent.draws}D-
                        {matchedOpponent.losses}L ({matchedOpponent.goalsFor}-{matchedOpponent.goalsAgainst})
                      </span>
                    </div>
                  )}

                  {fuzzyOpponentSuggestions.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] text-[var(--fx-text-muted)]">
                        Recent Clubs Played / Scheduled (click to use exact record name):
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {fuzzyOpponentSuggestions.map((opp) => {
                          const isSelected =
                            normalizeOpponentKey(opponentName) === opp.key;
                          return (
                            <button
                              key={opp.key}
                              type="button"
                              onClick={() => setOpponentName(opp.teamName)}
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                isSelected
                                  ? 'border-[var(--fx-accent)] bg-[var(--fx-accent-soft)] text-[var(--fx-accent-fg)]'
                                  : 'border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] text-[var(--fx-text-secondary)] hover:border-[var(--fx-accent-border)] hover:text-[var(--fx-text)]'
                              }`}
                            >
                              <span>{opp.teamName}</span>
                              <span className="font-mono-num text-[10px] text-[var(--fx-text-muted)]">
                                {opp.played > 0
                                  ? `${opp.wins}W-${opp.draws}D-${opp.losses}L`
                                  : 'Upcoming'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                      Foxes Sub-Team A Name
                    </label>
                    <input
                      type="text"
                      required
                      value={subTeamA}
                      onChange={(e) => setSubTeamA(e.target.value)}
                      placeholder="ORANGE"
                      className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                      Foxes Sub-Team B Name
                    </label>
                    <input
                      type="text"
                      required
                      value={subTeamB}
                      onChange={(e) => setSubTeamB(e.target.value)}
                      placeholder="OBSIDIAN"
                      className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={dateIso}
                    onChange={(e) => setDateIso(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Time (AM/PM)
                  </label>
                  <input
                    type="text"
                    required
                    value={timeDisplay}
                    onChange={(e) => setTimeDisplay(e.target.value)}
                    placeholder="7:30 PM"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Linked Series / Tournament
                  </label>
                  <select
                    value={seriesId}
                    onChange={(e) => setSeriesId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  >
                    <option value="">Standalone Match</option>
                    {seriesList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">Venue</label>
                  <input
                    type="text"
                    required
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Competition Label
                  </label>
                  <input
                    type="text"
                    value={competitionName}
                    onChange={(e) => setCompetitionName(e.target.value)}
                    placeholder="Vehari Premier Cup"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
              </div>

              {status === 'completed' && (
                <>
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4">
                    {matchType === 'external' ? (
                      <>
                        <div>
                          <label className="block text-xs text-[var(--fx-text-muted)] mb-1">
                            Foxes FC Goals
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={goalsFor}
                            onChange={(e) => setGoalsFor(Number(e.target.value))}
                            className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm font-mono-num text-[var(--fx-text)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--fx-text-muted)] mb-1">
                            {opponentName || 'Opponent'} Goals
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={goalsAgainst}
                            onChange={(e) => setGoalsAgainst(Number(e.target.value))}
                            className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm font-mono-num text-[var(--fx-text)]"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-xs text-[var(--fx-text-muted)] mb-1">
                            Foxes {subTeamA} Score
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={subTeamAScore}
                            onChange={(e) => setSubTeamAScore(Number(e.target.value))}
                            className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm font-mono-num text-[var(--fx-text)]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-[var(--fx-text-muted)] mb-1">
                            Foxes {subTeamB} Score
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={subTeamBScore}
                            onChange={(e) => setSubTeamBScore(Number(e.target.value))}
                            className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm font-mono-num text-[var(--fx-text)]"
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Player Match Performances & Automatic POTM Suggestion */}
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[var(--fx-text)]">
                        Match Player Performances (Used for POTM Suggestion)
                      </p>
                      {liveSuggestion.suggestedPotmName && (
                        <span className="text-xs text-[var(--fx-warn)]">
                          System Suggestion: {liveSuggestion.suggestedPotmName} (
                          {liveSuggestion.suggestedPotmReason})
                        </span>
                      )}
                    </div>

                    {players.length > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
                        <div className="col-span-2">
                          <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">Player</label>
                          <select
                            value={perfPlayerId}
                            onChange={(e) => setPerfPlayerId(e.target.value)}
                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-xs text-[var(--fx-text)]"
                          >
                            {players.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.position})
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">Goals</label>
                          <input
                            type="number"
                            min={0}
                            value={perfGoals}
                            onChange={(e) => setPerfGoals(Number(e.target.value))}
                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-xs text-[var(--fx-text)]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">Assists</label>
                          <input
                            type="number"
                            min={0}
                            value={perfAssists}
                            onChange={(e) => setPerfAssists(Number(e.target.value))}
                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-xs text-[var(--fx-text)]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">Rating</label>
                          <input
                            type="number"
                            step="0.1"
                            min={1}
                            max={10}
                            value={perfRating}
                            onChange={(e) => setPerfRating(Number(e.target.value))}
                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-xs text-[var(--fx-text)]"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleAddPerformance}
                          className="rounded border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)]"
                        >
                          Add Row
                        </button>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--fx-text-secondary)]">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={perfCleanSheet}
                          onChange={(e) => setPerfCleanSheet(e.target.checked)}
                        />
                        <span>Clean Sheet (DEF/GK)</span>
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>Penalties:</span>
                        <input
                          type="number"
                          min={0}
                          value={perfPenalties}
                          onChange={(e) => setPerfPenalties(Number(e.target.value))}
                          className="w-14 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-1.5 py-0.5 text-xs text-[var(--fx-text)]"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>YC:</span>
                        <input
                          type="number"
                          min={0}
                          value={perfYellow}
                          onChange={(e) => setPerfYellow(Number(e.target.value))}
                          className="w-12 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-1.5 py-0.5 text-xs text-[var(--fx-text)]"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        <span>RC:</span>
                        <input
                          type="number"
                          min={0}
                          value={perfRed}
                          onChange={(e) => setPerfRed(Number(e.target.value))}
                          className="w-12 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-1.5 py-0.5 text-xs text-[var(--fx-text)]"
                        />
                      </label>
                    </div>

                    {performances.length > 0 && (
                      <div className="divide-y divide-[var(--fx-border)] text-xs">
                        {performances.map((r) => (
                          <div key={r.playerId} className="flex items-center justify-between py-1.5">
                            <span className="text-[var(--fx-text)]">
                              {r.playerName} ({r.position}) — {r.goals}G, {r.assists}A,{' '}
                              {r.rating.toFixed(1)} rating
                              {r.cleanSheet ? ', Clean Sheet' : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setPerformances((prev) =>
                                  prev.filter((x) => x.playerId !== r.playerId)
                                )
                              }
                              className="text-[var(--fx-loss)] hover:opacity-80"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Manager-Only Official POTM Selector */}
                    <div className="border-t border-[var(--fx-border)] pt-3">
                      <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                        Official Player of the Match{' '}
                        {!isManager && '(Manager Only — Read-Only for Editors)'}
                      </label>
                      <select
                        disabled={!isManager}
                        value={officialPotmId}
                        onChange={(e) => setOfficialPotmId(e.target.value)}
                        className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] disabled:opacity-50"
                      >
                        <option value="">-- Select Official POTM --</option>
                        {players.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.position})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-[var(--fx-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-[var(--fx-border-strong)] px-4 py-2 text-xs font-semibold text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  <span>{saving ? 'Saving...' : 'Save Match'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
