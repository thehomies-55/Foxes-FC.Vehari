import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BarChart3,
  Calendar,
  Check,
  Edit3,
  Lock,
  Plus,
  RefreshCw,
  Sparkles,
  Tag,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ClubProfileConfig,
  HybridGroupSize,
  MatchRecord,
  MatchStatus,
  Player,
  PlayerPosition,
  RoundRobinMeetings,
  SeriesCategory,
  SeriesEvent,
  SeriesPlacement,
  TournamentFormat,
  TournamentMatchSlot,
  TournamentSlotPlayerStat,
  UserRole,
} from '../types';
import {
  PLAYER_POSITION_GROUPS,
  computeSuggestedPots,
} from '../utils/clubCalculations';
import {
  CATEGORY_LABELS,
  evaluateTournamentState,
  formatTournamentDescriptor,
  generateTournamentFixtures,
  parseTeamsList,
  resolveTournamentFormat,
  type ResolvedTournamentMatch,
} from '../utils/tournamentEngine';

interface SeriesSectionProps {
  clubProfile?: ClubProfileConfig;
  seriesList: SeriesEvent[];
  matches: MatchRecord[];
  players: Player[];
  role: UserRole;
  onNotify: (msg: string) => void;
}

export const SeriesSection: React.FC<SeriesSectionProps> = ({
  clubProfile,
  seriesList,
  matches,
  players,
  role,
  onNotify,
}) => {
  const canEdit = role === 'manager' || role === 'editor';
  const isManager = role === 'manager';
  const defaultHomeGround = clubProfile?.homeGround || 'Vehari District Floodlit Turf';

  const [categoryFilter, setCategoryFilter] = useState<'all' | SeriesCategory>('all');
  const [chartSeriesId, setChartSeriesId] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSeries, setEditingSeries] = useState<SeriesEvent | null>(null);

  // Inline Edit Tournament Type & Format state on each card
  const [inlineTypeSeriesId, setInlineTypeSeriesId] = useState<string | null>(null);
  const [inlineCategory, setInlineCategory] = useState<SeriesCategory>('tournament');
  const [inlineFormat, setInlineFormat] = useState<TournamentFormat>('round_robin');
  const [inlineRrMeetings, setInlineRrMeetings] = useState<RoundRobinMeetings>(1);
  const [inlineHybridGroupSize, setInlineHybridGroupSize] = useState<HybridGroupSize>(4);
  const [inlineRegenerateFixtures, setInlineRegenerateFixtures] = useState(true);
  const [savingInlineType, setSavingInlineType] = useState(false);

  // Inline Scorecard Editor & Team Schedule Filter inside Tournament Match Chart
  const [scheduleTeamFilter, setScheduleTeamFilter] = useState<string>('all');
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [slotStatus, setSlotStatus] = useState<MatchStatus>('completed');
  const [slotScoreA, setSlotScoreA] = useState(0);
  const [slotScoreB, setSlotScoreB] = useState(0);
  const [slotPenA, setSlotPenA] = useState(0);
  const [slotPenB, setSlotPenB] = useState(0);
  const [slotVenue, setSlotVenue] = useState('');
  const [slotDateDisplay, setSlotDateDisplay] = useState('');
  const [slotBestPlayer, setSlotBestPlayer] = useState('');
  const [slotBestKeeper, setSlotBestKeeper] = useState('');
  const [slotBestDefender, setSlotBestDefender] = useState('');
  const [slotPlayerStats, setSlotPlayerStats] = useState<TournamentSlotPlayerStat[]>([]);
  const [newStatName, setNewStatName] = useState('');
  const [newStatPos, setNewStatPos] = useState<PlayerPosition>('FWD');
  const [newStatGoals, setNewStatGoals] = useState(0);
  const [newStatAssists, setNewStatAssists] = useState(0);
  const [newStatCs, setNewStatCs] = useState(false);
  const [savingSlot, setSavingSlot] = useState(false);

  // Add/Edit Series Modal Form State
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<SeriesCategory>('tournament');
  const [format, setFormat] = useState<TournamentFormat>('round_robin');
  const [roundRobinMeetings, setRoundRobinMeetings] = useState<RoundRobinMeetings>(1);
  const [hybridGroupSize, setHybridGroupSize] = useState<HybridGroupSize>(4);
  const [teamsSummary, setTeamsSummary] = useState('');
  const [winnerName, setWinnerName] = useState('');
  const [placement, setPlacement] = useState<SeriesPlacement>('ongoing');
  const [startDate, setStartDate] = useState('2026-11-01');
  const [endDate, setEndDate] = useState('2026-11-25');
  const [status, setStatus] = useState<'ongoing' | 'completed'>('ongoing');
  const [officialPotsId, setOfficialPotsId] = useState('');
  const [topScorerName, setTopScorerName] = useState('');
  const [topScorerStat, setTopScorerStat] = useState('');
  const [topAssisterName, setTopAssisterName] = useState('');
  const [topAssisterStat, setTopAssisterStat] = useState('');
  const [bestKeeperName, setBestKeeperName] = useState('');
  const [bestDefenderName, setBestDefenderName] = useState('');
  const [summary, setSummary] = useState('');
  const [regenerateOnSave, setRegenerateOnSave] = useState(true);
  const [saving, setSaving] = useState(false);

  const filteredSeries = useMemo(() => {
    const list = [...seriesList].sort((a, b) => b.startDate.localeCompare(a.startDate));
    if (categoryFilter === 'all') return list;
    return list.filter((s) => s.category === categoryFilter);
  }, [seriesList, categoryFilter]);

  useEffect(() => {
    if (filteredSeries.length === 0) {
      setChartSeriesId('');
      return;
    }
    if (!filteredSeries.some((s) => s.id === chartSeriesId)) {
      const preferred =
        filteredSeries.find(
          (s) =>
            (s.tournamentMatches && s.tournamentMatches.length > 0) ||
            matches.some((m) => m.seriesId === s.id)
        ) || filteredSeries[0];
      setChartSeriesId(preferred.id);
    }
  }, [filteredSeries, chartSeriesId, matches]);

  const activeChartSeries = useMemo(
    () => filteredSeries.find((s) => s.id === chartSeriesId) || filteredSeries[0] || null,
    [filteredSeries, chartSeriesId]
  );

  const activeChartEval = useMemo(() => {
    if (!activeChartSeries) return null;
    const linked = matches.filter((m) => m.seriesId === activeChartSeries.id);
    return evaluateTournamentState(
      activeChartSeries,
      linked,
      clubProfile?.shortName || 'Foxes FC',
      players
    );
  }, [activeChartSeries, matches, clubProfile?.shortName, players]);

  const maxGoalsInChart = useMemo(() => {
    if (!activeChartEval) return 1;
    let maxG = 1;
    activeChartEval.resolvedMatches.forEach((m) => {
      if (m.status === 'completed') {
        if (m.scoreA > maxG) maxG = m.scoreA;
        if (m.scoreB > maxG) maxG = m.scoreB;
      }
    });
    return maxG;
  }, [activeChartEval]);

  const openCreateModal = () => {
    setEditingSeries(null);
    setTitle('');
    setCategory('tournament');
    setFormat('round_robin');
    setRoundRobinMeetings(1);
    setHybridGroupSize(4);
    setTeamsSummary('Foxes FC, Burewala United, Mailsi Falcons, Multan Strikers');
    setWinnerName('');
    setPlacement('ongoing');
    setStartDate('2026-11-01');
    setEndDate('2026-11-25');
    setStatus('ongoing');
    setOfficialPotsId('');
    setTopScorerName('');
    setTopScorerStat('');
    setTopAssisterName('');
    setTopAssisterStat('');
    setBestKeeperName('');
    setBestDefenderName('');
    setSummary('');
    setRegenerateOnSave(true);
    setModalOpen(true);
  };

  const openEditModal = (s: SeriesEvent) => {
    const resolvedFmt = resolveTournamentFormat(s);
    setEditingSeries(s);
    setTitle(s.title);
    setCategory(s.category);
    setFormat(resolvedFmt);
    setRoundRobinMeetings(s.roundRobinMeetings || 1);
    setHybridGroupSize(s.hybridGroupSize || 4);
    setTeamsSummary(s.teamsSummary);
    setWinnerName(s.winnerName || '');
    setPlacement(s.placement);
    setStartDate(s.startDate);
    setEndDate(s.endDate);
    setStatus(s.status);
    setOfficialPotsId(s.officialPotsId || '');
    setTopScorerName(s.topScorerName);
    setTopScorerStat(s.topScorerStat);
    setTopAssisterName(s.topAssisterName);
    setTopAssisterStat(s.topAssisterStat);
    setBestKeeperName(s.bestKeeperName);
    setBestDefenderName(s.bestDefenderName);
    setSummary(s.summary);
    setRegenerateOnSave(!(s.tournamentMatches && s.tournamentMatches.length > 0));
    setModalOpen(true);
  };

  const openInlineTypeEditor = (s: SeriesEvent) => {
    setInlineTypeSeriesId(s.id);
    setInlineCategory(s.category);
    setInlineFormat(resolveTournamentFormat(s));
    setInlineRrMeetings(s.roundRobinMeetings || 1);
    setInlineHybridGroupSize(s.hybridGroupSize || 4);
    setInlineRegenerateFixtures(true);
  };

  const handleSaveInlineType = async (event: SeriesEvent) => {
    if (!canEdit) return;
    setSavingInlineType(true);

    const parsedTeams = parseTeamsList(event.teamsSummary, event.teams, inlineCategory);
    const nextTournamentType = formatTournamentDescriptor(
      inlineFormat,
      inlineRrMeetings,
      inlineHybridGroupSize
    );

    const updatePayload: Record<string, unknown> = {
      category: inlineCategory,
      format: inlineFormat,
      roundRobinMeetings: inlineRrMeetings,
      hybridGroupSize: inlineHybridGroupSize,
      teams: parsedTeams,
      tournamentType: nextTournamentType,
      updatedAt: serverTimestamp(),
    };

    if (inlineRegenerateFixtures || !event.tournamentMatches || event.tournamentMatches.length === 0) {
      updatePayload.tournamentMatches = generateTournamentFixtures({
        teams: parsedTeams,
        format: inlineFormat,
        roundRobinMeetings: inlineRrMeetings,
        hybridGroupSize: inlineHybridGroupSize,
        homeGround: defaultHomeGround,
        startDate: event.startDate,
        clubName: clubProfile?.shortName || 'Foxes FC',
      });
      updatePayload.winnerName = '';
    }

    try {
      await updateDoc(doc(db, 'series', event.id), updatePayload);
      setInlineTypeSeriesId(null);
      setChartSeriesId(event.id);
      onNotify(`Updated ${event.title} format to ${nextTournamentType}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `series/${event.id}`);
    } finally {
      setSavingInlineType(false);
    }
  };

  const handleSaveSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const cleanTitle = title.trim().slice(0, 100);
    if (cleanTitle.length < 2) {
      onNotify('Series or tournament title must be at least 2 characters.');
      return;
    }
    setSaving(true);

    const seriesId =
      editingSeries?.id ||
      `ser_${cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'event'}_${Date.now()}`.slice(0, 120);

    const parsedTeams = parseTeamsList(teamsSummary, undefined, category).slice(0, 32);
    const rawTeamsSummary = parsedTeams.join(', ');
    const safeTeamsSummary =
      rawTeamsSummary.length > 160 ? `${rawTeamsSummary.slice(0, 157)}...` : rawTeamsSummary;
    const descriptor = formatTournamentDescriptor(format, roundRobinMeetings, hybridGroupSize).slice(0, 60);
    const suggestion = computeSuggestedPots(seriesId, matches, players);
    const chosenPots = players.find((p) => p.id === officialPotsId);

    const existingMatches = editingSeries?.tournamentMatches || [];
    const nextTournamentMatches = (
      regenerateOnSave || existingMatches.length === 0
        ? generateTournamentFixtures({
            teams: parsedTeams,
            format,
            roundRobinMeetings,
            hybridGroupSize,
            homeGround: defaultHomeGround,
            startDate,
            clubName: clubProfile?.shortName || 'Foxes FC',
          })
        : existingMatches
    ).slice(0, 150);

    const payload = {
      title: cleanTitle,
      category,
      format,
      roundRobinMeetings,
      hybridGroupSize,
      teams: parsedTeams,
      winnerName: winnerName.trim().slice(0, 80),
      tournamentMatches: nextTournamentMatches,
      tournamentType: descriptor,
      teamsSummary: safeTeamsSummary,
      placement,
      startDate: startDate.slice(0, 30),
      endDate: endDate.slice(0, 30),
      status,
      suggestedPotsId: suggestion.suggestedPotsId.slice(0, 128),
      suggestedPotsName: suggestion.suggestedPotsName.slice(0, 80),
      officialPotsId: (isManager ? officialPotsId : editingSeries?.officialPotsId || '').slice(0, 128),
      officialPotsName: (isManager
        ? chosenPots?.name || ''
        : editingSeries?.officialPotsName || ''
      ).slice(0, 80),
      topScorerName: topScorerName.trim().slice(0, 80),
      topScorerStat: topScorerStat.trim().slice(0, 40),
      topAssisterName: topAssisterName.trim().slice(0, 80),
      topAssisterStat: topAssisterStat.trim().slice(0, 40),
      bestKeeperName: bestKeeperName.trim().slice(0, 80),
      bestDefenderName: bestDefenderName.trim().slice(0, 80),
      summary: summary.trim().slice(0, 500),
    };

    try {
      if (editingSeries) {
        await updateDoc(doc(db, 'series', editingSeries.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
        onNotify(`Updated ${payload.title}.`);
      } else {
        await setDoc(doc(db, 'series', seriesId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setChartSeriesId(seriesId);
        onNotify(`Created ${payload.title} with ${nextTournamentMatches.length} fixtures.`);
      }
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(
        error,
        editingSeries ? OperationType.UPDATE : OperationType.CREATE,
        'series'
      );
    } finally {
      setSaving(false);
    }
  };

  const openSlotEditor = (slot: ResolvedTournamentMatch) => {
    setEditingSlotId(slot.id);
    setSlotStatus(slot.status === 'completed' ? 'completed' : 'completed');
    setSlotScoreA(slot.scoreA || 0);
    setSlotScoreB(slot.scoreB || 0);
    setSlotPenA(slot.penaltiesA || 0);
    setSlotPenB(slot.penaltiesB || 0);
    setSlotVenue(slot.venue);
    setSlotDateDisplay(slot.dateDisplay);
    setSlotBestPlayer(slot.resolvedBestPlayer || '');
    setSlotBestKeeper(slot.resolvedBestKeeper || '');
    setSlotBestDefender(slot.resolvedBestDefender || '');
    setSlotPlayerStats(
      slot.resolvedPlayerStats && slot.resolvedPlayerStats.length > 0
        ? slot.resolvedPlayerStats.map((st) => ({ ...st }))
        : []
    );
    setNewStatName('');
    setNewStatPos('FWD');
    setNewStatGoals(0);
    setNewStatAssists(0);
    setNewStatCs(false);
  };

  const handleAddSlotPlayerStat = () => {
    const trimmed = newStatName.trim();
    if (!trimmed) return;
    const matched = players.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
    setSlotPlayerStats((prev) => [
      ...prev,
      {
        playerName: matched ? matched.name : trimmed,
        position: matched ? matched.position : newStatPos,
        goals: Math.max(0, Number(newStatGoals) || 0),
        assists: Math.max(0, Number(newStatAssists) || 0),
        cleanSheet: newStatCs,
      },
    ]);
    setNewStatName('');
    setNewStatGoals(0);
    setNewStatAssists(0);
    setNewStatCs(false);
  };

  const handleRemoveSlotPlayerStat = (idx: number) => {
    setSlotPlayerStats((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveSlotScore = async (series: SeriesEvent, slot: ResolvedTournamentMatch) => {
    if (!canEdit || !activeChartEval) return;
    setSavingSlot(true);

    // Ensure series has persisted tournamentMatches before updating
    const baseSlots: TournamentMatchSlot[] =
      series.tournamentMatches && series.tournamentMatches.length > 0
        ? series.tournamentMatches
        : activeChartEval.resolvedMatches.map((rm) => ({
            id: rm.id,
            stage: rm.stage,
            stageType: rm.stageType,
            groupName: rm.groupName,
            roundNumber: rm.roundNumber,
            teamA: rm.teamA || rm.resolvedTeamA,
            teamB: rm.teamB || rm.resolvedTeamB,
            placeholderA: rm.placeholderA,
            placeholderB: rm.placeholderB,
            sourceSlotAId: rm.sourceSlotAId,
            sourceSlotBId: rm.sourceSlotBId,
            venue: rm.venue,
            dateDisplay: rm.dateDisplay,
            status: rm.status,
            scoreA: rm.scoreA,
            scoreB: rm.scoreB,
            penaltiesA: rm.penaltiesA,
            penaltiesB: rm.penaltiesB,
            bestPlayerName: rm.bestPlayerName,
            bestKeeperName: rm.bestKeeperName,
            bestDefenderName: rm.bestDefenderName,
            playerStats: rm.playerStats,
            notes: rm.notes,
          }));

    const updatedSlots = baseSlots.map((item) => {
      if (item.id !== slot.id) return item;
      const next: TournamentMatchSlot = {
        ...item,
        teamA:
          item.teamA ||
          (slot.resolvedTeamA !== slot.placeholderA ? slot.resolvedTeamA : item.teamA),
        teamB:
          item.teamB ||
          (slot.resolvedTeamB !== slot.placeholderB ? slot.resolvedTeamB : item.teamB),
        venue: slotVenue.trim() || item.venue,
        dateDisplay: slotDateDisplay.trim() || item.dateDisplay,
        status: slotStatus,
        scoreA: slotStatus === 'completed' ? Math.max(0, Number(slotScoreA) || 0) : 0,
        scoreB: slotStatus === 'completed' ? Math.max(0, Number(slotScoreB) || 0) : 0,
      };
      if (slotStatus === 'completed' && (Number(slotPenA) > 0 || Number(slotPenB) > 0)) {
        next.penaltiesA = Math.max(0, Number(slotPenA) || 0);
        next.penaltiesB = Math.max(0, Number(slotPenB) || 0);
      } else {
        delete next.penaltiesA;
        delete next.penaltiesB;
      }

      if (slotStatus === 'completed') {
        if (slotBestPlayer.trim()) next.bestPlayerName = slotBestPlayer.trim();
        else delete next.bestPlayerName;

        if (slotBestKeeper.trim()) next.bestKeeperName = slotBestKeeper.trim();
        else delete next.bestKeeperName;

        if (slotBestDefender.trim()) next.bestDefenderName = slotBestDefender.trim();
        else delete next.bestDefenderName;

        if (slotPlayerStats.length > 0) next.playerStats = slotPlayerStats;
        else delete next.playerStats;
      } else {
        delete next.bestPlayerName;
        delete next.bestKeeperName;
        delete next.bestDefenderName;
        delete next.playerStats;
      }

      return next;
    });

    // Re-evaluate updated state to auto-detect completion, winner & automatic series awards
    const simulatedSeries: SeriesEvent = {
      ...series,
      tournamentMatches: updatedSlots,
    };
    const nextEval = evaluateTournamentState(
      simulatedSeries,
      matches.filter((m) => m.seriesId === series.id),
      clubProfile?.shortName || 'Foxes FC',
      players
    );
    const allDone =
      nextEval.totalCount > 0 &&
      nextEval.completedCount === nextEval.totalCount &&
      !nextEval.hasPendingTiebreaker;

    const updateDocData: Record<string, unknown> = {
      tournamentMatches: updatedSlots.slice(0, 150),
      winnerName: (allDone ? nextEval.resolvedWinnerName : series.winnerName || '').slice(0, 80),
      status: allDone && nextEval.resolvedWinnerName ? 'completed' : 'ongoing',
      updatedAt: serverTimestamp(),
    };

    if (allDone && nextEval.resolvedWinnerName) {
      const aa = nextEval.autoAwards;
      if (aa.autoTopScorerName) {
        updateDocData.topScorerName = aa.autoTopScorerName;
        updateDocData.topScorerStat = aa.autoTopScorerStat;
      }
      if (aa.autoTopAssisterName) {
        updateDocData.topAssisterName = aa.autoTopAssisterName;
        updateDocData.topAssisterStat = aa.autoTopAssisterStat;
      }
      if (aa.autoBestKeeperName) {
        updateDocData.bestKeeperName = aa.autoBestKeeperName;
      }
      if (aa.autoBestDefenderName) {
        updateDocData.bestDefenderName = aa.autoBestDefenderName;
      }
      if (aa.autoPotsName) {
        updateDocData.suggestedPotsId = aa.autoPotsId || series.suggestedPotsId || '';
        updateDocData.suggestedPotsName = aa.autoPotsName;
        if (isManager && !series.officialPotsName) {
          updateDocData.officialPotsId = aa.autoPotsId || '';
          updateDocData.officialPotsName = aa.autoPotsName;
        }
      }
    }

    try {
      await updateDoc(doc(db, 'series', series.id), updateDocData);
      setEditingSlotId(null);
      onNotify(
        allDone && nextEval.resolvedWinnerName
          ? `Saved ${slot.stage}. Tournament completed & series awards auto-calculated!`
          : `Saved scorecard & match awards for ${slot.stage}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `series/${series.id}`);
    } finally {
      setSavingSlot(false);
    }
  };

  const handleRegenerateSeriesChart = async (series: SeriesEvent) => {
    if (!canEdit) return;
    const fmt = resolveTournamentFormat(series);
    const parsedTeams = parseTeamsList(series.teamsSummary, series.teams, series.category);
    const freshSlots = generateTournamentFixtures({
      teams: parsedTeams,
      format: fmt,
      roundRobinMeetings: series.roundRobinMeetings || 1,
      hybridGroupSize: series.hybridGroupSize || 4,
      homeGround: defaultHomeGround,
      startDate: series.startDate,
      clubName: clubProfile?.shortName || 'Foxes FC',
    });
    try {
      await updateDoc(doc(db, 'series', series.id), {
        format: fmt,
        roundRobinMeetings: series.roundRobinMeetings || 1,
        hybridGroupSize: series.hybridGroupSize || 4,
        teams: parsedTeams,
        tournamentMatches: freshSlots,
        winnerName: '',
        status: 'ongoing',
        updatedAt: serverTimestamp(),
      });
      onNotify(`Generated ${freshSlots.length} fixtures for ${series.title}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `series/${series.id}`);
    }
  };

  const handleAssignOfficialPots = async (seriesId: string, playerId: string) => {
    if (!isManager) return;
    const player = players.find((p) => p.id === playerId);
    try {
      await updateDoc(doc(db, 'series', seriesId), {
        officialPotsId: player ? player.id : '',
        officialPotsName: player ? player.name : '',
        updatedAt: serverTimestamp(),
      });
      onNotify(
        player
          ? `Player of the Series awarded to ${player.name} by Manager.`
          : 'Player of the Series cleared.'
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `series/${seriesId}`);
    }
  };

  const handleDeleteSeries = async (seriesId: string) => {
    if (!isManager) return;
    try {
      await deleteDoc(doc(db, 'series', seriesId));
      onNotify('Series deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `series/${seriesId}`);
    }
  };

  const handleFocusChart = (seriesId: string) => {
    setChartSeriesId(seriesId);
    setEditingSlotId(null);
    const el = document.getElementById('tournament-match-chart');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const renderStatusPill = (statusVal: 'champion' | 'advancing' | 'active' | 'eliminated', label: string) => {
    const cls =
      statusVal === 'champion'
        ? 'bg-[var(--fx-warn-soft)] text-[var(--fx-warn)] border-[var(--fx-warn-border)]'
        : statusVal === 'advancing'
        ? 'bg-[var(--fx-win-soft)] text-[var(--fx-win)] border-[var(--fx-win-border)]'
        : statusVal === 'eliminated'
        ? 'bg-[var(--fx-loss-soft)] text-[var(--fx-loss)] border-[var(--fx-loss-border)]'
        : 'bg-[var(--fx-accent-soft)] text-[var(--fx-accent-fg)] border-[var(--fx-accent-border)]';
    return (
      <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${cls}`}>
        {label}
      </span>
    );
  };

  return (
    <section id="tournaments" className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">
              Competitions, Formats &amp; Inter-Club Series
            </p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
              Tournaments, Bilateral &amp; Tri-Series
            </h2>
            <p className="mt-1 text-sm text-[var(--fx-text-muted)]">
              Configure Round Robin (1x/2x/3x), Knockout, Hybrid (Groups of 2–5 → Knockout → Final), and Legged (All-Teams Home &amp; Away + Penalties) across external and inter-club competitions. Best Players unlock only when all matches and the tournament winner are uploaded.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1">
              {(
                [
                  { id: 'all', label: 'All Events' },
                  { id: 'tournament', label: 'Tournaments' },
                  { id: 'bilateral', label: 'Bilateral' },
                  { id: 'triseries', label: 'Tri-Series' },
                  { id: 'inter_club', label: 'Inter-Club' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === tab.id
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
                <span>Add Tournament / Series</span>
              </button>
            )}
          </div>
        </div>

        {/* TOURNAMENT MATCH CHART & PROGRESSION TABLE */}
        {filteredSeries.length > 0 && activeChartSeries && activeChartEval && (
          <div
            id="tournament-match-chart"
            className="mt-8 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-6"
          >
            {/* Header & Tournament Picker */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b border-[var(--fx-border)] pb-5">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[var(--fx-accent-text)]" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--fx-accent-text)]">
                    Tournament Match Chart &amp; Progression Table
                  </p>
                  <span className="font-mono-num text-[11px] font-semibold text-[var(--fx-text-muted)]">
                    · {activeChartEval.completedCount}/{activeChartEval.totalCount} Matches Uploaded
                  </span>
                </div>
                <h3 className="font-display mt-1 text-2xl font-bold text-[var(--fx-text)]">
                  {activeChartSeries.title}
                </h3>
                <p className="text-xs text-[var(--fx-text-muted)] mt-0.5">
                  {CATEGORY_LABELS[activeChartSeries.category]} ·{' '}
                  {formatTournamentDescriptor(
                    activeChartEval.format,
                    activeChartSeries.roundRobinMeetings || 1,
                    activeChartSeries.hybridGroupSize || 4
                  )}{' '}
                  ·{' '}
                  {activeChartEval.resolvedWinnerName
                    ? `Winner: ${activeChartEval.resolvedWinnerName}`
                    : 'Ongoing Competition'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label="Select Tournament for Match Chart"
                  value={activeChartSeries.id}
                  onChange={(e) => {
                    setChartSeriesId(e.target.value);
                    setScheduleTeamFilter('all');
                    setEditingSlotId(null);
                  }}
                  className="rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs font-medium text-[var(--fx-text)] min-w-[220px]"
                >
                  {filteredSeries.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} ({CATEGORY_LABELS[item.category]})
                    </option>
                  ))}
                </select>

                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRegenerateSeriesChart(activeChartSeries)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] px-3 py-2 text-xs font-medium text-[var(--fx-text-secondary)] hover:border-[var(--fx-accent-border)]"
                    title="Reset and generate fixtures based on current teams & format"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Regenerate Fixtures</span>
                  </button>
                )}
              </div>
            </div>

            {/* Legged All-Pairs Home & Away Ties Breakdown */}
            {activeChartEval.format === 'legged' && activeChartEval.leggedTies.length > 0 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--fx-text)]">
                    Home &amp; Away Two-Legged Ties ({activeChartEval.leggedTies.length}{' '}
                    {activeChartEval.leggedTies.length === 1 ? 'Tie' : 'Ties'} · Each Team Plays Every Other Team Home &amp; Away)
                  </p>
                  <span className="text-[11px] text-[var(--fx-text-muted)]">
                    Aggregate decides tie winner; tied aggregate is settled by Penalties
                  </span>
                </div>
                <div
                  className={`grid grid-cols-1 gap-3 ${
                    activeChartEval.leggedTies.length > 1 ? 'md:grid-cols-2' : ''
                  }`}
                >
                  {activeChartEval.leggedTies.map((tie) => (
                    <div
                      key={tie.pairKey}
                      className="rounded-xl border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-4 flex flex-col justify-between gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fx-accent-text)]">
                            Tie {tie.tieNumber} · Home &amp; Away Aggregate
                          </p>
                          <p className="font-display mt-1 text-xl font-bold text-[var(--fx-text)]">
                            {tie.team1}{' '}
                            <span className="font-mono-num text-[var(--fx-accent-text)]">
                              {tie.team1Agg} - {tie.team2Agg}
                            </span>{' '}
                            {tie.team2}
                          </p>
                        </div>
                        <div className="text-right text-[11px] shrink-0">
                          {tie.winner ? (
                            <span className="inline-flex items-center rounded border border-[var(--fx-win-border)] bg-[var(--fx-win-soft)] px-2 py-0.5 font-semibold text-[var(--fx-win)]">
                              Winner: {tie.winner}
                            </span>
                          ) : tie.penaltiesNeeded ? (
                            <span className="inline-flex items-center rounded border border-[var(--fx-warn-border)] bg-[var(--fx-warn-soft)] px-2 py-0.5 font-semibold text-[var(--fx-warn)]">
                              Enter Penalties
                            </span>
                          ) : (
                            <span className="text-[var(--fx-text-muted)] font-medium">
                              {tie.leg1Completed && !tie.leg2Completed
                                ? 'Leg 1 Done · Awaiting Away Leg'
                                : 'Scheduled'}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--fx-text-secondary)] font-mono-num">
                        <span>
                          Leg 1 (Home):{' '}
                          {tie.leg1Completed ? `${tie.leg1Score1} - ${tie.leg1Score2}` : 'Pending'}
                        </span>
                        <span>
                          Leg 2 (Away):{' '}
                          {tie.leg2Completed ? `${tie.leg2Score2} - ${tie.leg2Score1}` : 'Pending'}
                        </span>
                        {tie.penaltiesNeeded && (
                          <span className="font-semibold text-[var(--fx-warn)]">
                            {tie.penalties1 > 0 || tie.penalties2 > 0
                              ? `Pens: ${tie.team1} ${tie.penalties1} - ${tie.penalties2} ${tie.team2}`
                              : 'Aggregate tied — enter Leg 2 penalties'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hybrid Group Tables (when Hybrid format has groups) */}
            {activeChartEval.format === 'hybrid' && activeChartEval.groupStandings.length > 0 && (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {activeChartEval.groupStandings.map((grp) => (
                  <div
                    key={grp.groupName}
                    className="overflow-x-auto rounded-lg border border-[var(--fx-border)]"
                  >
                    <div className="bg-[var(--fx-bg-alt)] px-3.5 py-2 border-b border-[var(--fx-border)] flex items-center justify-between">
                      <span className="text-xs font-bold text-[var(--fx-text)]">
                        {grp.groupName} Standings
                      </span>
                      <span className="text-[11px] text-[var(--fx-text-muted)]">
                        Top 2 Advance to Semi-Finals
                      </span>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[var(--fx-surface)] text-[var(--fx-text-muted)] border-b border-[var(--fx-border)]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">#</th>
                          <th className="px-3 py-2 font-semibold">Team</th>
                          <th className="px-2 py-2 font-semibold text-center">P</th>
                          <th className="px-2 py-2 font-semibold text-center">W</th>
                          <th className="px-2 py-2 font-semibold text-center">D</th>
                          <th className="px-2 py-2 font-semibold text-center">L</th>
                          <th className="px-2 py-2 font-semibold text-center">GD</th>
                          <th className="px-2 py-2 font-semibold text-center">PTS</th>
                          <th className="px-3 py-2 font-semibold">Progression</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--fx-border)] bg-[var(--fx-surface)]">
                        {grp.rows.map((r, idx) => (
                          <tr key={r.team} className="hover:bg-[var(--fx-surface-hover)]">
                            <td className="px-3 py-2 font-mono-num text-[var(--fx-text-muted)]">
                              {idx + 1}
                            </td>
                            <td className="px-3 py-2 font-semibold text-[var(--fx-text)]">
                              {r.team}
                            </td>
                            <td className="px-2 py-2 font-mono-num text-center">{r.played}</td>
                            <td className="px-2 py-2 font-mono-num text-center text-[var(--fx-win)]">
                              {r.won}
                            </td>
                            <td className="px-2 py-2 font-mono-num text-center text-[var(--fx-warn)]">
                              {r.drawn}
                            </td>
                            <td className="px-2 py-2 font-mono-num text-center text-[var(--fx-loss)]">
                              {r.lost}
                            </td>
                            <td className="px-2 py-2 font-mono-num text-center">
                              {r.gd > 0 ? `+${r.gd}` : r.gd}
                            </td>
                            <td className="px-2 py-2 font-mono-num text-center font-bold text-[var(--fx-text)]">
                              {r.points}
                            </td>
                            <td className="px-3 py-2">
                              {renderStatusPill(r.status, r.statusLabel)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* Overall Team Progression & Status Table (Shows who goes forward & who is eliminated) */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-xs font-semibold text-[var(--fx-text)]">
                  Team Progression Status Table (Advancing vs. Eliminated)
                </p>
                <span className="text-[11px] text-[var(--fx-text-muted)]">
                  {activeChartEval.teams.length} Participating Teams
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border border-[var(--fx-border)]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[var(--fx-bg-alt)] text-[var(--fx-text-muted)] border-b border-[var(--fx-border)]">
                    <tr>
                      <th className="px-3.5 py-2.5 font-semibold">Team</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">P</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">W</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">D</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">L</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">GF</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">GA</th>
                      <th className="px-2.5 py-2.5 font-semibold text-center">GD</th>
                      {activeChartEval.format === 'legged' && (
                        <th className="px-2.5 py-2.5 font-semibold text-center">Ties Won</th>
                      )}
                      <th className="px-2.5 py-2.5 font-semibold text-center">PTS</th>
                      <th className="px-3.5 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--fx-border)] bg-[var(--fx-surface)]">
                    {activeChartEval.standings.map((row) => (
                      <tr key={row.team} className="hover:bg-[var(--fx-surface-hover)]">
                        <td className="px-3.5 py-2.5 font-semibold text-[var(--fx-text)]">
                          {row.team}
                          {row.groupName ? (
                            <span className="ml-1.5 text-[10px] font-normal text-[var(--fx-text-muted)]">
                              ({row.groupName})
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center">{row.played}</td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center text-[var(--fx-win)]">
                          {row.won}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center text-[var(--fx-warn)]">
                          {row.drawn}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center text-[var(--fx-loss)]">
                          {row.lost}
                        </td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center">{row.gf}</td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center">{row.ga}</td>
                        <td className="px-2.5 py-2.5 font-mono-num text-center">
                          {row.gd > 0 ? `+${row.gd}` : row.gd}
                        </td>
                        {activeChartEval.format === 'legged' && (
                          <td className="px-2.5 py-2.5 font-mono-num text-center font-semibold text-[var(--fx-accent-text)]">
                            {row.tiesWon}
                          </td>
                        )}
                        <td className="px-2.5 py-2.5 font-mono-num text-center font-bold text-[var(--fx-text)]">
                          {row.points}
                        </td>
                        <td className="px-3.5 py-2.5">
                          {renderStatusPill(row.status, row.statusLabel)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Match Chart Fixtures & Scorecards Table */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                <p className="text-xs font-semibold text-[var(--fx-text)]">
                  Match Chart &amp; Fixtures Scorecard ({activeChartEval.resolvedMatches.length} Matches)
                </p>
                <span className="text-[11px] text-[var(--fx-text-muted)]">
                  Shows which team plays which team, scorecard, who advances, and who is eliminated
                </span>
              </div>

              {activeChartEval.resolvedMatches.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] p-6 text-center text-xs text-[var(--fx-text-muted)]">
                  No tournament matches generated yet. Click &quot;Regenerate Fixtures&quot; or edit the tournament format to create the match chart.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-[var(--fx-border)]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[var(--fx-bg-alt)] text-[var(--fx-text-muted)] border-b border-[var(--fx-border)]">
                      <tr>
                        <th className="px-3.5 py-2.5 font-semibold">Stage</th>
                        <th className="px-3.5 py-2.5 font-semibold">Fixture (Team vs Team)</th>
                        <th className="px-3.5 py-2.5 font-semibold">Venue &amp; Date</th>
                        <th className="px-3.5 py-2.5 font-semibold">Scorecard</th>
                        <th className="px-3.5 py-2.5 font-semibold">Progression / Outcome</th>
                        {canEdit && <th className="px-3.5 py-2.5 font-semibold text-right">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fx-border)] bg-[var(--fx-surface)]">
                      {activeChartEval.resolvedMatches.map((rm) => {
                        const isEditingThisSlot = editingSlotId === rm.id;
                        const isKnockoutMatch =
                          activeChartEval.format === 'knockout' ||
                          rm.stageType === 'semifinal' ||
                          rm.stageType === 'final';

                        const matchingTie =
                          activeChartEval.format === 'legged'
                            ? activeChartEval.leggedTies.find(
                                (t) => t.leg1Id === rm.id || t.leg2Id === rm.id
                              )
                            : undefined;

                        let progressionText = 'Upcoming fixture';
                        if (rm.status === 'completed') {
                          if (activeChartEval.format === 'legged' && matchingTie) {
                            if (rm.stageType === 'leg2' && matchingTie.winner) {
                              progressionText = `Tie Winner: ${matchingTie.winner} (${matchingTie.team1Agg}-${matchingTie.team2Agg} agg${matchingTie.penaltiesNeeded ? `, Pens ${matchingTie.penalties1}-${matchingTie.penalties2}` : ''})`;
                            } else if (rm.stageType === 'leg2' && matchingTie.penaltiesNeeded) {
                              progressionText = `Aggregate Tied (${matchingTie.team1Agg}-${matchingTie.team2Agg}) — enter penalties`;
                            } else if (rm.winner) {
                              progressionText = `${rm.winner} wins ${rm.stageType === 'leg1' ? 'Leg 1' : 'Leg 2'} (3 pts)`;
                            } else {
                              progressionText = `${rm.stageType === 'leg1' ? 'Leg 1' : 'Leg 2'} Drawn (1 pt each)`;
                            }
                          } else if (rm.winner && rm.loser) {
                            if (activeChartEval.format === 'round_robin') {
                              progressionText = `${rm.winner} wins (3 pts)`;
                            } else if (activeChartEval.format === 'hybrid' && rm.stageType === 'group') {
                              progressionText = `${rm.winner} +3 pts`;
                            } else if (rm.stageType === 'final') {
                              progressionText = `${rm.winner} Champion · ${rm.loser} Eliminated`;
                            } else {
                              progressionText = `${rm.winner} goes forward · ${rm.loser} eliminated`;
                            }
                          } else {
                            progressionText = isKnockoutMatch
                              ? 'Draw — enter penalties to decide winner'
                              : 'Draw (1 pt each)';
                          }
                        }

                        return (
                          <React.Fragment key={rm.id}>
                            <tr className="hover:bg-[var(--fx-surface-hover)]">
                              <td className="px-3.5 py-2.5 font-medium text-[var(--fx-text-secondary)] whitespace-nowrap">
                                {rm.stage}
                              </td>
                              <td className="px-3.5 py-2.5 font-semibold text-[var(--fx-text)]">
                                <span>{rm.resolvedTeamA}</span>
                                <span className="mx-1.5 text-[var(--fx-text-muted)] font-normal">
                                  vs
                                </span>
                                <span>{rm.resolvedTeamB}</span>
                              </td>
                              <td className="px-3.5 py-2.5 text-[var(--fx-text-muted)]">
                                <span>{rm.venue}</span>
                                <span className="mx-1">·</span>
                                <span className="font-mono-num">{rm.dateDisplay}</span>
                              </td>
                              <td className="px-3.5 py-2.5 font-mono-num font-bold whitespace-nowrap">
                                {rm.status === 'completed' ? (
                                  <span className="text-[var(--fx-text)]">
                                    {rm.scoreA} - {rm.scoreB}
                                    {rm.decidedByPenalties && (
                                      <span className="ml-1.5 text-[11px] font-semibold text-[var(--fx-warn)]">
                                        (Pens {rm.penaltiesA}-{rm.penaltiesB})
                                      </span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[var(--fx-accent-text)] font-medium">
                                    Scheduled
                                  </span>
                                )}
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="space-y-1">
                                  <div>
                                    {rm.status === 'completed' &&
                                    activeChartEval.format === 'legged' &&
                                    matchingTie ? (
                                      rm.stageType === 'leg2' && matchingTie.winner ? (
                                        <span className="text-[11px] font-medium text-[var(--fx-win)]">
                                          {progressionText}
                                        </span>
                                      ) : rm.stageType === 'leg2' && matchingTie.penaltiesNeeded ? (
                                        <span className="text-[11px] font-semibold text-[var(--fx-warn)]">
                                          {progressionText}
                                        </span>
                                      ) : (
                                        <span
                                          className={`text-[11px] font-medium ${
                                            rm.winner ? 'text-[var(--fx-win)]' : 'text-[var(--fx-text-muted)]'
                                          }`}
                                        >
                                          {progressionText}
                                        </span>
                                      )
                                    ) : rm.status === 'completed' && rm.winner && rm.loser ? (
                                      isKnockoutMatch || rm.stageType === 'final' ? (
                                        <span className="text-[11px] font-medium">
                                          <span className="text-[var(--fx-win)]">{rm.winner}</span>{' '}
                                          {rm.stageType === 'final' ? 'wins trophy' : 'goes forward'} ·{' '}
                                          <span className="text-[var(--fx-loss)]">{rm.loser} eliminated</span>
                                        </span>
                                      ) : (
                                        <span className="text-[11px] font-medium text-[var(--fx-win)]">
                                          {progressionText}
                                        </span>
                                      )
                                    ) : (
                                      <span className="text-[11px] text-[var(--fx-text-muted)]">
                                        {progressionText}
                                      </span>
                                    )}
                                  </div>

                                  {rm.status === 'completed' &&
                                    (rm.resolvedBestPlayer ||
                                      rm.resolvedBestKeeper ||
                                      rm.resolvedBestDefender) && (
                                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-[var(--fx-text-secondary)]">
                                        {rm.resolvedBestPlayer && (
                                          <span>
                                            <strong className="text-[var(--fx-warn)]">Best Player:</strong>{' '}
                                            {rm.resolvedBestPlayer}
                                          </span>
                                        )}
                                        {rm.resolvedBestKeeper && (
                                          <span>
                                            <strong className="text-[var(--fx-accent-text)]">Best GK:</strong>{' '}
                                            {rm.resolvedBestKeeper}
                                          </span>
                                        )}
                                        {rm.resolvedBestDefender && (
                                          <span>
                                            <strong className="text-[var(--fx-text)]">Best DEF:</strong>{' '}
                                            {rm.resolvedBestDefender}
                                          </span>
                                        )}
                                      </div>
                                    )}
                                </div>
                              </td>
                              {canEdit && (
                                <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      isEditingThisSlot ? setEditingSlotId(null) : openSlotEditor(rm)
                                    }
                                    className="rounded border border-[var(--fx-border-strong)] px-2.5 py-1 text-[11px] font-medium text-[var(--fx-text-secondary)] hover:border-[var(--fx-accent-border)] hover:text-[var(--fx-text)]"
                                  >
                                    {isEditingThisSlot
                                      ? 'Close'
                                      : rm.status === 'completed'
                                      ? 'Edit Score'
                                      : 'Upload Score'}
                                  </button>
                                </td>
                              )}
                            </tr>

                            {canEdit && isEditingThisSlot && (
                              <tr className="bg-[var(--fx-accent-soft)]">
                                <td colSpan={6} className="px-4 py-3.5">
                                  <div className="flex flex-wrap items-end gap-3 text-xs">
                                    <div>
                                      <label className="block text-[11px] text-[var(--fx-text-secondary)] mb-1">
                                        Status
                                      </label>
                                      <select
                                        value={slotStatus}
                                        onChange={(e) => setSlotStatus(e.target.value as MatchStatus)}
                                        className="rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                                      >
                                        <option value="completed">Completed</option>
                                        <option value="scheduled">Scheduled</option>
                                      </select>
                                    </div>

                                    <div>
                                      <label className="block text-[11px] text-[var(--fx-text-secondary)] mb-1">
                                        {rm.resolvedTeamA} Score
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        disabled={slotStatus !== 'completed'}
                                        value={slotScoreA}
                                        onChange={(e) => setSlotScoreA(Number(e.target.value))}
                                        className="w-20 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 font-mono-num text-xs text-[var(--fx-text)] disabled:opacity-50"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[11px] text-[var(--fx-text-secondary)] mb-1">
                                        {rm.resolvedTeamB} Score
                                      </label>
                                      <input
                                        type="number"
                                        min={0}
                                        max={99}
                                        disabled={slotStatus !== 'completed'}
                                        value={slotScoreB}
                                        onChange={(e) => setSlotScoreB(Number(e.target.value))}
                                        className="w-20 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 font-mono-num text-xs text-[var(--fx-text)] disabled:opacity-50"
                                      />
                                    </div>

                                    {(isKnockoutMatch || activeChartEval.format === 'legged') &&
                                      slotStatus === 'completed' &&
                                      (slotScoreA === slotScoreB || activeChartEval.format === 'legged') && (
                                        <>
                                          <div>
                                            <label className="block text-[11px] text-[var(--fx-warn)] mb-1">
                                              {rm.resolvedTeamA} Pens
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              max={99}
                                              value={slotPenA}
                                              onChange={(e) => setSlotPenA(Number(e.target.value))}
                                              className="w-20 rounded border border-[var(--fx-warn-border)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 font-mono-num text-xs text-[var(--fx-text)]"
                                            />
                                          </div>
                                          <div>
                                            <label className="block text-[11px] text-[var(--fx-warn)] mb-1">
                                              {rm.resolvedTeamB} Pens
                                            </label>
                                            <input
                                              type="number"
                                              min={0}
                                              max={99}
                                              value={slotPenB}
                                              onChange={(e) => setSlotPenB(Number(e.target.value))}
                                              className="w-20 rounded border border-[var(--fx-warn-border)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 font-mono-num text-xs text-[var(--fx-text)]"
                                            />
                                          </div>
                                        </>
                                      )}

                                    <div>
                                      <label className="block text-[11px] text-[var(--fx-text-secondary)] mb-1">
                                        Venue / Ground
                                      </label>
                                      <input
                                        type="text"
                                        value={slotVenue}
                                        onChange={(e) => setSlotVenue(e.target.value)}
                                        className="w-44 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                                      />
                                    </div>

                                    <div>
                                      <label className="block text-[11px] text-[var(--fx-text-secondary)] mb-1">
                                        Date
                                      </label>
                                      <input
                                        type="text"
                                        value={slotDateDisplay}
                                        onChange={(e) => setSlotDateDisplay(e.target.value)}
                                        placeholder="dd-mm-yy"
                                        className="w-28 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 font-mono-num text-xs text-[var(--fx-text)]"
                                      />
                                    </div>

                                    <button
                                      type="button"
                                      disabled={savingSlot}
                                      onClick={() => handleSaveSlotScore(activeChartSeries, rm)}
                                      className="inline-flex items-center gap-1 rounded bg-[var(--fx-accent)] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                                    >
                                      <Check className="h-3.5 w-3.5" />
                                      <span>{savingSlot ? 'Saving...' : 'Save Result'}</span>
                                    </button>
                                  </div>

                                  {/* Per-Match Awards & Player Stats Recorder (when Completed) */}
                                  {slotStatus === 'completed' && (
                                    <div className="mt-3 pt-3 border-t border-[var(--fx-accent-border)] space-y-3 text-xs">
                                      <datalist id="foxes-tournament-players">
                                        {players.map((p) => (
                                          <option key={p.id} value={p.name}>
                                            {p.position}
                                          </option>
                                        ))}
                                      </datalist>

                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[var(--fx-text-secondary)] mb-1">
                                            Best Player of the Match
                                          </label>
                                          <input
                                            type="text"
                                            list="foxes-tournament-players"
                                            value={slotBestPlayer}
                                            onChange={(e) => setSlotBestPlayer(e.target.value)}
                                            placeholder="Player name"
                                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[var(--fx-text-secondary)] mb-1">
                                            Best Keeper (Match)
                                          </label>
                                          <input
                                            type="text"
                                            list="foxes-tournament-players"
                                            value={slotBestKeeper}
                                            onChange={(e) => setSlotBestKeeper(e.target.value)}
                                            placeholder="Keeper name"
                                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-[11px] font-semibold text-[var(--fx-text-secondary)] mb-1">
                                            Best Defender (Match)
                                          </label>
                                          <input
                                            type="text"
                                            list="foxes-tournament-players"
                                            value={slotBestDefender}
                                            onChange={(e) => setSlotBestDefender(e.target.value)}
                                            placeholder="Defender name"
                                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                                          />
                                        </div>
                                      </div>

                                      {/* Match Goals & Assists Recorder */}
                                      <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3 space-y-2">
                                        <p className="text-[11px] font-semibold text-[var(--fx-text-secondary)]">
                                          Match Goals &amp; Assists Records (Feeds Ongoing Top Scorer/Assister &amp; Auto-Awards)
                                        </p>
                                        {slotPlayerStats.length > 0 && (
                                          <div className="flex flex-wrap gap-1.5">
                                            {slotPlayerStats.map((st, sIdx) => (
                                              <span
                                                key={`${st.playerName}_${sIdx}`}
                                                className="inline-flex items-center gap-1.5 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] px-2 py-1 text-[11px] text-[var(--fx-text)]"
                                              >
                                                <span className="font-semibold">{st.playerName}</span>
                                                <span className="font-mono-num text-[var(--fx-accent-text)]">
                                                  {st.goals}G · {st.assists}A
                                                </span>
                                                {st.cleanSheet && (
                                                  <span className="text-[10px] text-[var(--fx-win)] font-semibold">
                                                    CS
                                                  </span>
                                                )}
                                                <button
                                                  type="button"
                                                  onClick={() => handleRemoveSlotPlayerStat(sIdx)}
                                                  className="text-[var(--fx-text-muted)] hover:text-[var(--fx-loss)]"
                                                  aria-label="Remove stat"
                                                >
                                                  <X className="h-3 w-3" />
                                                </button>
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                        <div className="flex flex-wrap items-end gap-2">
                                          <input
                                            type="text"
                                            list="foxes-tournament-players"
                                            value={newStatName}
                                            onChange={(e) => setNewStatName(e.target.value)}
                                            placeholder="Player name"
                                            className="w-40 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-xs text-[var(--fx-text)]"
                                          />
                                          <select
                                            value={newStatPos}
                                            onChange={(e) =>
                                              setNewStatPos(e.target.value as PlayerPosition)
                                            }
                                            className="rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-xs text-[var(--fx-text)]"
                                          >
                                            {PLAYER_POSITION_GROUPS.map((grp) => (
                                              <optgroup key={grp.group} label={grp.title}>
                                                {grp.positions.map((pos) => (
                                                  <option key={pos} value={pos}>
                                                    {pos}
                                                  </option>
                                                ))}
                                              </optgroup>
                                            ))}
                                          </select>
                                          <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-[var(--fx-text-muted)]">G:</span>
                                            <input
                                              type="number"
                                              min={0}
                                              max={30}
                                              value={newStatGoals}
                                              onChange={(e) => setNewStatGoals(Number(e.target.value))}
                                              className="w-14 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 font-mono-num text-xs text-[var(--fx-text)]"
                                            />
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <span className="text-[10px] text-[var(--fx-text-muted)]">A:</span>
                                            <input
                                              type="number"
                                              min={0}
                                              max={30}
                                              value={newStatAssists}
                                              onChange={(e) => setNewStatAssists(Number(e.target.value))}
                                              className="w-14 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 font-mono-num text-xs text-[var(--fx-text)]"
                                            />
                                          </div>
                                          <label className="inline-flex items-center gap-1 text-[11px] text-[var(--fx-text-secondary)] cursor-pointer">
                                            <input
                                              type="checkbox"
                                              checked={newStatCs}
                                              onChange={(e) => setNewStatCs(e.target.checked)}
                                            />
                                            <span>Clean Sheet</span>
                                          </label>
                                          <button
                                            type="button"
                                            onClick={handleAddSlotPlayerStat}
                                            className="inline-flex items-center gap-1 rounded border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--fx-accent-fg)] hover:opacity-90"
                                          >
                                            <Plus className="h-3 w-3" />
                                            <span>Add Stat</span>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* EVERY TEAM MATCH SCHEDULE (Shows each participating team's full fixture list) */}
            {activeChartEval.teamSchedules.length > 0 && (
              <div className="space-y-3 border-t border-[var(--fx-border)] pt-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-[var(--fx-accent-text)]" />
                    <p className="text-xs font-semibold text-[var(--fx-text)]">
                      Every Team Match Schedule ({activeChartEval.teams.length} Teams)
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setScheduleTeamFilter('all')}
                      className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        scheduleTeamFilter === 'all'
                          ? 'border-[var(--fx-accent)] bg-[var(--fx-accent)] text-white'
                          : 'border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)]'
                      }`}
                    >
                      All Teams
                    </button>
                    {activeChartEval.teams.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setScheduleTeamFilter(t)}
                        className={`rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                          scheduleTeamFilter === t
                            ? 'border-[var(--fx-accent)] bg-[var(--fx-accent)] text-white'
                            : 'border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                <div
                  className={`grid grid-cols-1 gap-4 ${
                    scheduleTeamFilter === 'all' ? 'md:grid-cols-2' : ''
                  }`}
                >
                  {activeChartEval.teamSchedules
                    .filter(
                      (grp) =>
                        scheduleTeamFilter === 'all' || grp.team === scheduleTeamFilter
                    )
                    .map((grp) => (
                      <div
                        key={grp.team}
                        className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] overflow-hidden"
                      >
                        <div className="flex items-center justify-between border-b border-[var(--fx-border)] bg-[var(--fx-surface)] px-3.5 py-2.5">
                          <span className="text-xs font-bold text-[var(--fx-text)]">
                            {grp.team} Schedule
                          </span>
                          <span className="font-mono-num text-[11px] text-[var(--fx-text-muted)]">
                            {grp.playedCount} Played · {grp.scheduledCount} Upcoming
                          </span>
                        </div>
                        {grp.matches.length === 0 ? (
                          <p className="p-3.5 text-xs text-[var(--fx-text-muted)]">
                            No fixtures assigned yet (may qualify via knockout).
                          </p>
                        ) : (
                          <div className="divide-y divide-[var(--fx-border)]">
                            {grp.matches.map((entry) => (
                              <div key={`${grp.team}_${entry.slotId}`} className="px-3.5 py-2.5 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <span className="font-mono-num text-[10px] font-semibold text-[var(--fx-accent-text)] mr-1.5">
                                      [{entry.stage}]
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase text-[var(--fx-text-muted)] mr-1">
                                      {entry.homeOrAway} vs
                                    </span>
                                    <span className="font-semibold text-[var(--fx-text)]">
                                      {entry.opponent}
                                    </span>
                                  </div>
                                  <div className="shrink-0 font-mono-num flex items-center gap-1.5">
                                    {entry.status === 'completed' ? (
                                      <>
                                        <span
                                          className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                            entry.outcomeCode === 'W'
                                              ? 'bg-[var(--fx-win-soft)] text-[var(--fx-win)]'
                                              : entry.outcomeCode === 'L'
                                              ? 'bg-[var(--fx-loss-soft)] text-[var(--fx-loss)]'
                                              : 'bg-[var(--fx-warn-soft)] text-[var(--fx-warn)]'
                                          }`}
                                        >
                                          {entry.outcomeCode}
                                        </span>
                                        <span className="font-bold text-[var(--fx-text)]">
                                          {entry.scoreDisplay}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-[11px] font-medium text-[var(--fx-accent-text)]">
                                        {entry.dateDisplay}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--fx-text-muted)]">
                                  <span>
                                    {entry.venue} · {entry.dateDisplay}
                                  </span>
                                  {entry.status === 'completed' &&
                                    (entry.bestPlayer || entry.bestKeeper || entry.bestDefender) && (
                                      <span className="text-[var(--fx-text-secondary)]">
                                        {entry.bestPlayer ? `POTM: ${entry.bestPlayer}` : ''}
                                        {entry.bestKeeper ? ` · GK: ${entry.bestKeeper}` : ''}
                                        {entry.bestDefender ? ` · DEF: ${entry.bestDefender}` : ''}
                                      </span>
                                    )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* SEPARATE ONGOING TOURNAMENT LEADERS SECTION (Top Scorer & Top Assister only while ongoing) */}
            {!activeChartEval.canShowBestPlayers ? (
              <div className="rounded-xl border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fx-accent-text)]">
                      Ongoing Tournament Leaders Section
                    </p>
                    <h4 className="font-display text-xl font-bold text-[var(--fx-text)]">
                      Live Top Scorer &amp; Top Assister Race
                    </h4>
                  </div>
                  <span className="text-[11px] text-[var(--fx-text-muted)] flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
                    <span>Best Player, Best GK &amp; Best DEF reveal on tournament completion</span>
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-4">
                    <p className="text-xs font-semibold text-[var(--fx-accent-text)] mb-2.5">
                      Top Scorers (Live from Match Records)
                    </p>
                    {activeChartEval.autoAwards.topScorersLeaderboard.length === 0 ? (
                      <p className="text-xs text-[var(--fx-text-muted)]">
                        No goals recorded in completed matches yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-[var(--fx-border)] text-xs">
                        {activeChartEval.autoAwards.topScorersLeaderboard.slice(0, 5).map((rec, idx) => (
                          <div
                            key={rec.playerName}
                            className="py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="font-semibold text-[var(--fx-text)]">
                              <span className="font-mono-num text-[var(--fx-text-muted)] mr-1.5">
                                #{idx + 1}
                              </span>
                              {rec.playerName}
                              {rec.teamName ? (
                                <span className="ml-1.5 text-[10px] font-normal text-[var(--fx-text-muted)]">
                                  ({rec.teamName})
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono-num font-bold text-[var(--fx-accent-text)]">
                              {rec.goals} {rec.goals === 1 ? 'Goal' : 'Goals'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-4">
                    <p className="text-xs font-semibold text-[var(--fx-accent-text)] mb-2.5">
                      Top Assisters (Live from Match Records)
                    </p>
                    {activeChartEval.autoAwards.topAssistersLeaderboard.length === 0 ? (
                      <p className="text-xs text-[var(--fx-text-muted)]">
                        No assists recorded in completed matches yet.
                      </p>
                    ) : (
                      <div className="divide-y divide-[var(--fx-border)] text-xs">
                        {activeChartEval.autoAwards.topAssistersLeaderboard.slice(0, 5).map((rec, idx) => (
                          <div
                            key={rec.playerName}
                            className="py-1.5 flex items-center justify-between gap-2"
                          >
                            <span className="font-semibold text-[var(--fx-text)]">
                              <span className="font-mono-num text-[var(--fx-text-muted)] mr-1.5">
                                #{idx + 1}
                              </span>
                              {rec.playerName}
                              {rec.teamName ? (
                                <span className="ml-1.5 text-[10px] font-normal text-[var(--fx-text-muted)]">
                                  ({rec.teamName})
                                </span>
                              ) : null}
                            </span>
                            <span className="font-mono-num font-bold text-[var(--fx-accent-text)]">
                              {rec.assists} {rec.assists === 1 ? 'Assist' : 'Assists'}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* AUTO-CALCULATED END-OF-TOURNAMENT SERIES AWARDS */
              <div className="rounded-xl border border-[var(--fx-warn-border)] bg-[var(--fx-warn-soft)] p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-[var(--fx-warn)]" />
                    <h4 className="font-display text-xl font-bold text-[var(--fx-text)]">
                      Final Series Awards (Auto-Calculated from Match Records)
                    </h4>
                  </div>
                  <span className="text-xs font-semibold text-[var(--fx-win)]">
                    Champion: {activeChartEval.resolvedWinnerName}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3">
                    <p className="text-[11px] text-[var(--fx-text-muted)]">Best Player of Series</p>
                    <p className="mt-1 font-bold text-[var(--fx-text)]">
                      {activeChartSeries.officialPotsName ||
                        activeChartEval.autoAwards.autoPotsName ||
                        activeChartSeries.suggestedPotsName ||
                        'TBD'}
                    </p>
                    {activeChartEval.autoAwards.autoPotsReason && (
                      <p className="mt-0.5 text-[10px] text-[var(--fx-accent-text)] font-mono-num">
                        {activeChartEval.autoAwards.autoPotsReason}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3">
                    <p className="text-[11px] text-[var(--fx-text-muted)]">Top Scorer</p>
                    <p className="mt-1 font-bold text-[var(--fx-text)]">
                      {activeChartEval.autoAwards.autoTopScorerName ||
                        activeChartSeries.topScorerName ||
                        'TBD'}
                    </p>
                    {(activeChartEval.autoAwards.autoTopScorerStat ||
                      activeChartSeries.topScorerStat) && (
                      <p className="mt-0.5 text-[10px] text-[var(--fx-accent-text)] font-mono-num">
                        {activeChartEval.autoAwards.autoTopScorerStat ||
                          activeChartSeries.topScorerStat}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3">
                    <p className="text-[11px] text-[var(--fx-text-muted)]">Top Assister</p>
                    <p className="mt-1 font-bold text-[var(--fx-text)]">
                      {activeChartEval.autoAwards.autoTopAssisterName ||
                        activeChartSeries.topAssisterName ||
                        'TBD'}
                    </p>
                    {(activeChartEval.autoAwards.autoTopAssisterStat ||
                      activeChartSeries.topAssisterStat) && (
                      <p className="mt-0.5 text-[10px] text-[var(--fx-accent-text)] font-mono-num">
                        {activeChartEval.autoAwards.autoTopAssisterStat ||
                          activeChartSeries.topAssisterStat}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3">
                    <p className="text-[11px] text-[var(--fx-text-muted)]">Best Goal Keeper</p>
                    <p className="mt-1 font-bold text-[var(--fx-text)]">
                      {activeChartEval.autoAwards.autoBestKeeperName ||
                        activeChartSeries.bestKeeperName ||
                        'TBD'}
                    </p>
                    {activeChartEval.autoAwards.autoBestKeeperStat && (
                      <p className="mt-0.5 text-[10px] text-[var(--fx-accent-text)] font-mono-num">
                        {activeChartEval.autoAwards.autoBestKeeperStat}
                      </p>
                    )}
                  </div>
                  <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3">
                    <p className="text-[11px] text-[var(--fx-text-muted)]">Best Defender</p>
                    <p className="mt-1 font-bold text-[var(--fx-text)]">
                      {activeChartEval.autoAwards.autoBestDefenderName ||
                        activeChartSeries.bestDefenderName ||
                        'TBD'}
                    </p>
                    {activeChartEval.autoAwards.autoBestDefenderStat && (
                      <p className="mt-0.5 text-[10px] text-[var(--fx-accent-text)] font-mono-num">
                        {activeChartEval.autoAwards.autoBestDefenderStat}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Visual Goals Bar Chart */}
            {activeChartEval.resolvedMatches.length > 0 && (
              <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <p className="text-xs font-semibold text-[var(--fx-text)]">
                    Match-by-Match Goals Chart
                  </p>
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-[var(--fx-text-muted)]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-[var(--fx-accent)]" />
                      <span>Home / Team A Score</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-[var(--fx-loss)]" />
                      <span>Away / Team B Score</span>
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto pb-1">
                  <div className="grid grid-flow-col auto-cols-[minmax(130px,1fr)] gap-3 min-w-[460px]">
                    {activeChartEval.resolvedMatches.map((rm) => {
                      const isDone = rm.status === 'completed';
                      const pctA = isDone ? Math.max(8, Math.round((rm.scoreA / maxGoalsInChart) * 100)) : 0;
                      const pctB = isDone ? Math.max(8, Math.round((rm.scoreB / maxGoalsInChart) * 100)) : 0;

                      return (
                        <div
                          key={rm.id}
                          className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-3 flex flex-col justify-between gap-2"
                        >
                          <p className="font-mono-num text-[10px] font-semibold text-[var(--fx-text-muted)] truncate">
                            {rm.stage}
                          </p>

                          {isDone ? (
                            <div className="h-24 flex items-end justify-center gap-3 border-b border-[var(--fx-border)] pb-1.5 pt-2">
                              <div className="flex flex-col items-center justify-end h-full w-7">
                                <span className="font-mono-num text-[11px] font-bold text-[var(--fx-accent-text)] mb-1">
                                  {rm.scoreA}
                                </span>
                                <div
                                  className="w-full rounded-t bg-[var(--fx-accent)]"
                                  style={{ height: `${pctA}%` }}
                                />
                              </div>
                              <div className="flex flex-col items-center justify-end h-full w-7">
                                <span className="font-mono-num text-[11px] font-bold text-[var(--fx-loss)] mb-1">
                                  {rm.scoreB}
                                </span>
                                <div
                                  className="w-full rounded-t bg-[var(--fx-loss)] opacity-85"
                                  style={{ height: `${pctB}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="h-24 flex flex-col items-center justify-center border-b border-dashed border-[var(--fx-border-strong)] text-center">
                              <span className="text-[11px] font-semibold text-[var(--fx-accent-text)]">
                                Scheduled
                              </span>
                              <span className="font-mono-num text-[10px] text-[var(--fx-text-muted)] mt-0.5">
                                {rm.dateDisplay}
                              </span>
                            </div>
                          )}

                          <p className="text-[11px] font-semibold text-[var(--fx-text)] text-center leading-tight">
                            {rm.resolvedTeamA} <span className="text-[var(--fx-text-muted)]">vs</span>{' '}
                            {rm.resolvedTeamB}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TOURNAMENT & SERIES CARDS GRID */}
        {filteredSeries.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-[var(--fx-text-muted)]" />
            <p className="mt-3 text-sm font-medium text-[var(--fx-text)]">No series or tournaments found</p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)]">
              Add tournaments, bilateral series, tri-series, or inter-club competitions with Round Robin, Knockout, Hybrid, or Legged formats.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-2">
            {filteredSeries.map((event) => {
              const linkedMatches = matches.filter((m) => m.seriesId === event.id);
              const evalState = evaluateTournamentState(
                event,
                linkedMatches,
                clubProfile?.shortName || 'Foxes FC',
                players
              );
              const resolvedTopScorer =
                evalState.autoAwards.autoTopScorerName || event.topScorerName || '';
              const resolvedTopScorerStat =
                evalState.autoAwards.autoTopScorerStat || event.topScorerStat || '';
              const resolvedTopAssister =
                evalState.autoAwards.autoTopAssisterName || event.topAssisterName || '';
              const resolvedTopAssisterStat =
                evalState.autoAwards.autoTopAssisterStat || event.topAssisterStat || '';
              const resolvedBestKeeper =
                evalState.autoAwards.autoBestKeeperName || event.bestKeeperName || '';
              const resolvedBestDefender =
                evalState.autoAwards.autoBestDefenderName || event.bestDefenderName || '';
              const resolvedSeriesPots =
                event.officialPotsName ||
                evalState.autoAwards.autoPotsName ||
                event.suggestedPotsName ||
                '';
              const computedSuggestion = computeSuggestedPots(event.id, matches, players);
              const displaySuggestedPots =
                event.suggestedPotsName || computedSuggestion.suggestedPotsName;
              const descriptor = formatTournamentDescriptor(
                evalState.format,
                event.roundRobinMeetings || 1,
                event.hybridGroupSize || 4
              );
              const isEditingTypeHere = inlineTypeSeriesId === event.id;
              const isSelectedInChart = activeChartSeries?.id === event.id;

              return (
                <article
                  key={event.id}
                  className={`rounded-xl border bg-[var(--fx-surface)] p-6 flex flex-col justify-between gap-5 ${
                    isSelectedInChart
                      ? 'border-[var(--fx-accent-border)]'
                      : 'border-[var(--fx-border)]'
                  }`}
                >
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--fx-text-muted)]">
                      <span className="inline-flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-[var(--fx-accent-text)]">
                          {CATEGORY_LABELS[event.category]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-medium text-[var(--fx-text-secondary)]">
                          {descriptor}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono-num">
                          {event.startDate} to {event.endDate}
                        </span>
                      </span>
                      <span
                        className={`font-semibold ${
                          evalState.resolvedWinnerName
                            ? 'text-[var(--fx-warn)]'
                            : 'text-[var(--fx-accent-text)]'
                        }`}
                      >
                        {evalState.resolvedWinnerName
                          ? `Winner: ${evalState.resolvedWinnerName}`
                          : `Ongoing (${evalState.completedCount}/${evalState.totalCount} played)`}
                      </span>
                    </div>

                    {/* Inline Edit Tournament Type & Format Panel */}
                    {canEdit && isEditingTypeHere && (
                      <div className="mt-3 rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-3.5 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--fx-accent-fg)] flex items-center gap-1.5">
                            <Tag className="h-3.5 w-3.5" />
                            <span>Edit Tournament Type &amp; Format</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => setInlineTypeSeriesId(null)}
                            className="text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
                            aria-label="Close tournament type editor"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[11px] font-medium text-[var(--fx-text-secondary)] mb-1">
                              Competition Category
                            </label>
                            <select
                              value={inlineCategory}
                              onChange={(e) => setInlineCategory(e.target.value as SeriesCategory)}
                              className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                            >
                              <option value="tournament">Tournament</option>
                              <option value="bilateral">Bilateral Series</option>
                              <option value="triseries">Tri-Series</option>
                              <option value="inter_club">Inter-Club Series / Tournament</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-[11px] font-medium text-[var(--fx-text-secondary)] mb-1">
                              Tournament Format
                            </label>
                            <select
                              value={inlineFormat}
                              onChange={(e) => setInlineFormat(e.target.value as TournamentFormat)}
                              className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                            >
                              <option value="round_robin">Round Robin (Every team plays others)</option>
                              <option value="knockout">Knockout (Lose = Eliminated)</option>
                              <option value="hybrid">Hybrid (Groups of 2–5 → Knockout → Final)</option>
                              <option value="legged">Legged (All Teams Home &amp; Away + Penalties)</option>
                            </select>
                          </div>

                          {inlineFormat === 'round_robin' && (
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-medium text-[var(--fx-text-secondary)] mb-1">
                                How Many Times Each Team Plays Every Other Team?
                              </label>
                              <select
                                value={inlineRrMeetings}
                                onChange={(e) =>
                                  setInlineRrMeetings(Number(e.target.value) as RoundRobinMeetings)
                                }
                                className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                              >
                                <option value={1}>Once (Each pair plays 1 match)</option>
                                <option value={2}>Twice (Each pair plays 2 matches)</option>
                                <option value={3}>Thrice (Each pair plays 3 matches)</option>
                              </select>
                            </div>
                          )}

                          {inlineFormat === 'hybrid' && (
                            <div className="sm:col-span-2">
                              <label className="block text-[11px] font-medium text-[var(--fx-text-secondary)] mb-1">
                                Teams Per Group (Min 2, Max 5 · Top 2 per group advance)
                              </label>
                              <select
                                value={inlineHybridGroupSize}
                                onChange={(e) =>
                                  setInlineHybridGroupSize(Number(e.target.value) as HybridGroupSize)
                                }
                                className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                              >
                                <option value={2}>2 Teams per Group → Top 2 Advance</option>
                                <option value={3}>3 Teams per Group → Top 2 Advance</option>
                                <option value={4}>4 Teams per Group → Top 2 to Semi-Finals → Final</option>
                                <option value={5}>5 Teams per Group → Top 2 to Semi-Finals → Final</option>
                              </select>
                            </div>
                          )}

                          {inlineFormat === 'legged' && (
                            <div className="sm:col-span-2">
                              <p className="text-[11px] text-[var(--fx-text-secondary)]">
                                Every team plays every other team twice (1 Home match &amp; 1 Away match). Aggregate decides each two-legged tie; tied aggregates are settled by Penalties.
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--fx-text-secondary)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={inlineRegenerateFixtures}
                              onChange={(e) => setInlineRegenerateFixtures(e.target.checked)}
                              className="rounded border-[var(--fx-border-strong)]"
                            />
                            <span>Regenerate match chart fixtures for this format</span>
                          </label>
                          <button
                            type="button"
                            disabled={savingInlineType}
                            onClick={() => handleSaveInlineType(event)}
                            className="inline-flex items-center gap-1 rounded bg-[var(--fx-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            <span>{savingInlineType ? 'Saving...' : 'Save Format'}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    <h3 className="font-display mt-2 text-2xl font-bold text-[var(--fx-text)]">
                      {event.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--fx-text-secondary)]">{event.teamsSummary}</p>
                    {event.summary && (
                      <p className="mt-2.5 text-sm text-[var(--fx-text-muted)] leading-relaxed">
                        {event.summary}
                      </p>
                    )}

                    {/* BEST PLAYERS & SERIES AWARDS — AUTO-COMPUTED ON COMPLETION; ONGOING SHOWS TOP SCORER & TOP ASSISTER SEPARATELY */}
                    {evalState.canShowBestPlayers ? (
                      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-[var(--fx-border)] pt-4 text-xs">
                        <div>
                          <p className="text-[var(--fx-text-muted)]">Top Scorer</p>
                          <p className="mt-0.5 font-semibold text-[var(--fx-text)]">
                            {resolvedTopScorer || 'TBD'}{' '}
                            {resolvedTopScorerStat ? (
                              <span className="text-[var(--fx-accent-text)] font-mono-num">
                                ({resolvedTopScorerStat})
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--fx-text-muted)]">Top Assister</p>
                          <p className="mt-0.5 font-semibold text-[var(--fx-text)]">
                            {resolvedTopAssister || 'TBD'}{' '}
                            {resolvedTopAssisterStat ? (
                              <span className="text-[var(--fx-accent-text)] font-mono-num">
                                ({resolvedTopAssisterStat})
                              </span>
                            ) : null}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--fx-text-muted)]">Best Keeper</p>
                          <p className="mt-0.5 font-semibold text-[var(--fx-text)]">
                            {resolvedBestKeeper || 'TBD'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[var(--fx-text-muted)]">Best Defender</p>
                          <p className="mt-0.5 font-semibold text-[var(--fx-text)]">
                            {resolvedBestDefender || 'TBD'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-5 space-y-3">
                        {/* Ongoing Separate Top Scorer & Top Assister Section */}
                        <div className="rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-3 text-xs">
                          <p className="text-[11px] font-semibold text-[var(--fx-accent-text)] mb-2">
                            Ongoing Leaders · Top Scorer &amp; Top Assister
                          </p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[11px] text-[var(--fx-text-muted)]">Top Scorer</p>
                              <p className="mt-0.5 font-semibold text-[var(--fx-text)]">
                                {evalState.autoAwards.autoTopScorerName || 'No goals yet'}{' '}
                                {evalState.autoAwards.autoTopScorerStat ? (
                                  <span className="text-[var(--fx-accent-text)] font-mono-num">
                                    ({evalState.autoAwards.autoTopScorerStat})
                                  </span>
                                ) : null}
                              </p>
                            </div>
                            <div>
                              <p className="text-[11px] text-[var(--fx-text-muted)]">Top Assister</p>
                              <p className="mt-0.5 font-semibold text-[var(--fx-text)]">
                                {evalState.autoAwards.autoTopAssisterName || 'No assists yet'}{' '}
                                {evalState.autoAwards.autoTopAssisterStat ? (
                                  <span className="text-[var(--fx-accent-text)] font-mono-num">
                                    ({evalState.autoAwards.autoTopAssisterStat})
                                  </span>
                                ) : null}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] px-3.5 py-2.5 text-xs text-[var(--fx-text-muted)] flex items-start gap-2.5">
                          <Lock className="h-4 w-4 text-[var(--fx-accent-text)] shrink-0 mt-0.5" />
                          <p className="text-[11px]">
                            Best Player of Series, Best Keeper &amp; Best Defender auto-unlock when all matches ({evalState.completedCount}/{evalState.totalCount}) and the winner are uploaded.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Ongoing Quick Preview of Team Fixtures & Completed Match Awards */}
                    {evalState.resolvedMatches.length > 0 && (
                      <div className="mt-4 border-t border-[var(--fx-border)] pt-3">
                        <p className="text-xs font-medium text-[var(--fx-text-muted)] mb-2">
                          Fixtures &amp; Match Awards ({evalState.completedCount}/{evalState.totalCount} completed)
                        </p>
                        <div className="space-y-2 text-xs">
                          {evalState.resolvedMatches.slice(0, 4).map((rm) => (
                            <div key={rm.id} className="space-y-0.5">
                              <div className="flex items-center justify-between gap-2 text-[var(--fx-text-secondary)]">
                                <span className="truncate">
                                  <span className="text-[var(--fx-text-muted)] mr-1.5">
                                    [{rm.stage}]
                                  </span>
                                  {rm.resolvedTeamA} vs {rm.resolvedTeamB}
                                </span>
                                <span className="font-mono-num shrink-0 font-semibold">
                                  {rm.status === 'completed'
                                    ? `${rm.scoreA} - ${rm.scoreB}`
                                    : rm.dateDisplay}
                                </span>
                              </div>
                              {rm.status === 'completed' &&
                                (rm.resolvedBestPlayer ||
                                  rm.resolvedBestKeeper ||
                                  rm.resolvedBestDefender) && (
                                  <p className="text-[10px] text-[var(--fx-text-muted)] truncate">
                                    {rm.resolvedBestPlayer ? `POTM: ${rm.resolvedBestPlayer}` : ''}
                                    {rm.resolvedBestKeeper ? ` · Best GK: ${rm.resolvedBestKeeper}` : ''}
                                    {rm.resolvedBestDefender ? ` · Best DEF: ${rm.resolvedBestDefender}` : ''}
                                  </p>
                                )}
                            </div>
                          ))}
                          {evalState.resolvedMatches.length > 4 && (
                            <p className="text-[11px] text-[var(--fx-accent-text)]">
                              +{evalState.resolvedMatches.length - 4} more matches in Match Chart
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Player of the Series (Auto-calculated when tournament ends + Manager Override) */}
                  <div className="border-t border-[var(--fx-border)] pt-4 space-y-2.5">
                    {evalState.canShowBestPlayers && (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-2 text-[var(--fx-text-secondary)]">
                            <Award className="h-4 w-4 text-[var(--fx-accent-text)] shrink-0" />
                            <span>
                              Best Player of the Series:{' '}
                              <strong className="text-[var(--fx-text)]">
                                {resolvedSeriesPots || 'TBD'}
                              </strong>
                            </span>
                          </div>

                          {displaySuggestedPots && (
                            <span className="text-[var(--fx-text-muted)] flex items-center gap-1">
                              <Sparkles className="h-3.5 w-3.5 text-[var(--fx-warn)]" />
                              Auto-Calculated: {evalState.autoAwards.autoPotsName || displaySuggestedPots}
                            </span>
                          )}
                        </div>

                        {isManager && players.length > 0 && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-[var(--fx-text-muted)] shrink-0">
                              Manager POTS Override:
                            </label>
                            <select
                              value={event.officialPotsId || ''}
                              onChange={(e) => handleAssignOfficialPots(event.id, e.target.value)}
                              className="flex-1 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                            >
                              <option value="">-- Select Official Player of the Series --</option>
                              {players.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} ({p.position})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleFocusChart(event.id)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                          isSelectedInChart
                            ? 'border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] text-[var(--fx-accent-fg)]'
                            : 'border-[var(--fx-border-strong)] text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]'
                        }`}
                      >
                        <BarChart3 className="h-3.5 w-3.5" />
                        <span>{isSelectedInChart ? 'Viewing Match Chart' : 'Match Chart'}</span>
                      </button>

                      {canEdit && (
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              isEditingTypeHere
                                ? setInlineTypeSeriesId(null)
                                : openInlineTypeEditor(event)
                            }
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--fx-accent-fg)] hover:opacity-90"
                          >
                            <Tag className="h-3.5 w-3.5" />
                            <span>{isEditingTypeHere ? 'Close Type' : 'Edit Type'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => openEditModal(event)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--fx-border-strong)] px-3 py-1.5 text-xs text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit Series</span>
                          </button>
                          {isManager && (
                            <button
                              type="button"
                              onClick={() => handleDeleteSeries(event.id)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[var(--fx-loss-border)] px-3 py-1.5 text-xs text-[var(--fx-loss)] hover:bg-[var(--fx-loss-soft)]"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span>Delete</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Add/Edit Series Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                {editingSeries ? `Edit ${editingSeries.title}` : 'Add Tournament / Series'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSeries} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">
                    Series / Tournament Title
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Vehari Premier Cup"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">
                    Competition Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as SeriesCategory)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  >
                    <option value="tournament">Tournament</option>
                    <option value="bilateral">Series with One Specific Team</option>
                    <option value="triseries">Tri-Series</option>
                    <option value="inter_club">Inter-Club Series / Tournament</option>
                  </select>
                </div>
              </div>

              {/* Format & Format-Specific Options */}
              <div className="rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--fx-accent-fg)] mb-1">
                      Tournament / Series Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as TournamentFormat)}
                      className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs font-medium text-[var(--fx-text)]"
                    >
                      <option value="round_robin">1. Round Robin (Play every team)</option>
                      <option value="knockout">2. Knockout (Lose = Eliminated)</option>
                      <option value="hybrid">3. Hybrid (Groups of 2–5 → Knockout → Final)</option>
                      <option value="legged">4. Legged (All Teams Home &amp; Away + Penalties)</option>
                    </select>
                  </div>

                  {format === 'round_robin' && (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--fx-accent-fg)] mb-1">
                        Meetings Per Opponent Pair
                      </label>
                      <select
                        value={roundRobinMeetings}
                        onChange={(e) =>
                          setRoundRobinMeetings(Number(e.target.value) as RoundRobinMeetings)
                        }
                        className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs font-medium text-[var(--fx-text)]"
                      >
                        <option value={1}>Once (1 match per pair)</option>
                        <option value={2}>Twice (2 matches per pair)</option>
                        <option value={3}>Thrice (3 matches per pair)</option>
                      </select>
                    </div>
                  )}

                  {format === 'hybrid' && (
                    <div>
                      <label className="block text-xs font-semibold text-[var(--fx-accent-fg)] mb-1">
                        Group Size (Min 2, Max 5 · Top 2 → Knockout → Final)
                      </label>
                      <select
                        value={hybridGroupSize}
                        onChange={(e) =>
                          setHybridGroupSize(Number(e.target.value) as HybridGroupSize)
                        }
                        className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs font-medium text-[var(--fx-text)]"
                      >
                        <option value={2}>2 Teams per Group (Minimum)</option>
                        <option value={3}>3 Teams per Group</option>
                        <option value={4}>4 Teams per Group</option>
                        <option value={5}>5 Teams per Group (Maximum)</option>
                      </select>
                    </div>
                  )}

                  {format === 'knockout' && (
                    <div className="flex items-end">
                      <p className="text-[11px] text-[var(--fx-text-secondary)]">
                        Single elimination bracket: losing any match eliminates that team; winners advance automatically to the next round.
                      </p>
                    </div>
                  )}

                  {format === 'legged' && (
                    <div className="flex items-end">
                      <p className="text-[11px] text-[var(--fx-text-secondary)]">
                        Every team plays every other team twice — Leg 1 (Home Ground) and Leg 2 (Away Ground). Aggregate decides each tie; tied aggregate is settled by Penalties.
                      </p>
                    </div>
                  )}
                </div>

                {editingSeries && (
                  <label className="inline-flex items-center gap-2 text-xs text-[var(--fx-text-secondary)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={regenerateOnSave}
                      onChange={(e) => setRegenerateOnSave(e.target.checked)}
                    />
                    <span>Regenerate match chart fixtures when saving changes</span>
                  </label>
                )}
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">
                  Participating Teams (Comma-Separated)
                </label>
                <input
                  type="text"
                  required
                  value={teamsSummary}
                  onChange={(e) => setTeamsSummary(e.target.value)}
                  placeholder="Foxes FC, Khanewal XI, Sahiwal Rovers, Multan Strikers"
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                />
                <p className="mt-1 text-[11px] text-[var(--fx-text-muted)]">
                  For Inter-Club series/tournaments, enter sub-squads e.g. Foxes ORANGE, Foxes OBSIDIAN, Foxes EMERALD, Foxes GOLD.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Winner Team</label>
                  <input
                    type="text"
                    value={winnerName}
                    onChange={(e) => setWinnerName(e.target.value)}
                    placeholder="Optional until decided"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Foxes Placement</label>
                  <select
                    value={placement}
                    onChange={(e) => setPlacement(e.target.value as SeriesPlacement)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)]"
                  >
                    <option value="ongoing">Ongoing</option>
                    <option value="1st">1st Place</option>
                    <option value="2nd">2nd Place</option>
                    <option value="3rd">3rd Place</option>
                    <option value="participated">Participated</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'ongoing' | 'completed')}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)]"
                  >
                    <option value="ongoing">Ongoing</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">End Date</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4">
                <div className="sm:col-span-2 text-[11px] text-[var(--fx-text-muted)]">
                  Best Players (shown publicly only after all match results &amp; tournament winner are uploaded):
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-muted)] mb-1">Top Scorer Name</label>
                  <input
                    type="text"
                    value={topScorerName}
                    onChange={(e) => setTopScorerName(e.target.value)}
                    placeholder="Hamza Raza"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-muted)] mb-1">Top Scorer Stat</label>
                  <input
                    type="text"
                    value={topScorerStat}
                    onChange={(e) => setTopScorerStat(e.target.value)}
                    placeholder="7 Goals"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-muted)] mb-1">Top Assister Name</label>
                  <input
                    type="text"
                    value={topAssisterName}
                    onChange={(e) => setTopAssisterName(e.target.value)}
                    placeholder="Bilal Cheema"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-muted)] mb-1">Top Assister Stat</label>
                  <input
                    type="text"
                    value={topAssisterStat}
                    onChange={(e) => setTopAssisterStat(e.target.value)}
                    placeholder="5 Assists"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-muted)] mb-1">Best Keeper</label>
                  <input
                    type="text"
                    value={bestKeeperName}
                    onChange={(e) => setBestKeeperName(e.target.value)}
                    placeholder="Saad Wattoo"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-muted)] mb-1">Best Defender</label>
                  <input
                    type="text"
                    value={bestDefenderName}
                    onChange={(e) => setBestDefenderName(e.target.value)}
                    placeholder="Usman Khichi"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">
                  Official Player of the Series {!isManager && '(Manager Only)'}
                </label>
                <select
                  disabled={!isManager}
                  value={officialPotsId}
                  onChange={(e) => setOfficialPotsId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] disabled:opacity-50"
                >
                  <option value="">-- Select Player of the Series --</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Summary Notes</label>
                <textarea
                  rows={3}
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                />
              </div>

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
                  className="rounded-lg bg-[var(--fx-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Series'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
