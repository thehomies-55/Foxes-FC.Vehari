import React, { useMemo, useState } from 'react';
import { CheckCircle2, Medal, Plus, ShieldAlert, Trophy, X } from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ClubMilestonesSummary,
  ClubTrophyConfig,
  DisciplineIncident,
  DisciplineReason,
  Player,
  PlayerMilestoneLeader,
  UserRole,
} from '../types';
import {
  computeDisciplineSummary,
  getFineAmountForReason,
  getReasonLabel,
} from '../utils/clubCalculations';

type RecordsTab = 'club' | 'players' | 'discipline';

interface RecordsSectionProps {
  clubMilestones: ClubMilestonesSummary;
  playerMilestones: PlayerMilestoneLeader[];
  players: Player[];
  incidents: DisciplineIncident[];
  trophyConfig: ClubTrophyConfig;
  role: UserRole;
  onNotify: (msg: string) => void;
  fixedTab?: RecordsTab;
}

export const RecordsSection: React.FC<RecordsSectionProps> = ({
  clubMilestones,
  playerMilestones,
  players,
  incidents,
  trophyConfig,
  role,
  onNotify,
  fixedTab,
}) => {
  const canEdit = role === 'manager' || role === 'editor';
  const isManager = role === 'manager';

  const [internalTab, setInternalTab] = useState<RecordsTab>(fixedTab || 'club');
  const activeTab = fixedTab ?? internalTab;
  const setActiveTab = setInternalTab;
  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [trophyModalOpen, setTrophyModalOpen] = useState(false);

  // Incident form state
  const [playerId, setPlayerId] = useState('');
  const [matchLabel, setMatchLabel] = useState('');
  const [reason, setReason] = useState<DisciplineReason>('yellow_card');
  const [status, setStatus] = useState<'pending' | 'paid'>('pending');
  const [notes, setNotes] = useState('');
  const [incidentDate, setIncidentDate] = useState('2026-11-16');
  const [saving, setSaving] = useState(false);

  // Trophy bonus form
  const [firstBonus, setFirstBonus] = useState(trophyConfig.firstPlaceBonus);
  const [secondBonus, setSecondBonus] = useState(trophyConfig.secondPlaceBonus);
  const [thirdBonus, setThirdBonus] = useState(trophyConfig.thirdPlaceBonus);

  const disciplineSummary = useMemo(
    () => computeDisciplineSummary(players, incidents),
    [players, incidents]
  );

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const targetPlayer = players.find((p) => p.id === playerId) || players[0];
    if (!targetPlayer) return;

    setSaving(true);
    const finePkr = getFineAmountForReason(reason);
    const newId = `inc_${targetPlayer.id}_${Date.now()}`;

    try {
      await setDoc(doc(db, 'disciplineIncidents', newId), {
        playerId: targetPlayer.id,
        playerName: targetPlayer.name,
        matchLabel: matchLabel.trim() || 'Club Session',
        reason,
        finePkr,
        status,
        notes: notes.trim(),
        incidentDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      onNotify(`Logged ${getReasonLabel(reason)} (${finePkr} PKR) for ${targetPlayer.name}.`);
      setIncidentModalOpen(false);
      setMatchLabel('');
      setNotes('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'disciplineIncidents');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePaid = async (inc: DisciplineIncident) => {
    if (!canEdit) return;
    const nextStatus = inc.status === 'pending' ? 'paid' : 'pending';
    try {
      await updateDoc(doc(db, 'disciplineIncidents', inc.id), {
        status: nextStatus,
        updatedAt: serverTimestamp(),
      });
      onNotify(
        nextStatus === 'paid'
          ? `Marked ${inc.finePkr} PKR fine as Paid for ${inc.playerName}.`
          : `Reverted fine to Pending for ${inc.playerName}.`
      );
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `disciplineIncidents/${inc.id}`);
    }
  };

  const handleDeleteIncident = async (id: string) => {
    if (!isManager) return;
    try {
      await deleteDoc(doc(db, 'disciplineIncidents', id));
      onNotify('Discipline record deleted.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `disciplineIncidents/${id}`);
    }
  };

  const handleSaveTrophyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    try {
      await setDoc(doc(db, 'clubConfig', 'trophies'), {
        firstPlaceBonus: Number(firstBonus) || 0,
        secondPlaceBonus: Number(secondBonus) || 0,
        thirdPlaceBonus: Number(thirdBonus) || 0,
        updatedAt: serverTimestamp(),
      });
      onNotify('Club historical trophy counts updated.');
      setTrophyModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clubConfig/trophies');
    }
  };

  const headingInfo =
    activeTab === 'club'
      ? {
          kicker: 'All-Time Club Honors & Form',
          title: 'Club Milestones & Records',
        }
      : activeTab === 'players'
      ? {
          kicker: 'Individual Career & Single-Game Leaders',
          title: 'Player Milestones',
        }
      : {
          kicker: 'Card Ledger & PKR Fine Tracker',
          title: 'Discipline & Fines',
        };

  return (
    <section id="records" className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">{headingInfo.kicker}</p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
              {headingInfo.title}
            </h2>
          </div>

          {!fixedTab && (
            <div className="flex items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1 w-fit">
              {(
                [
                  { id: 'club', label: 'Club Milestones' },
                  { id: 'players', label: 'Player Milestones' },
                  { id: 'discipline', label: 'Discipline & Fines' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeTab === tab.id
                      ? 'bg-[var(--fx-accent)] text-white'
                      : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* TAB 1: CLUB MILESTONES */}
        {activeTab === 'club' && (
          <div className="mt-8 space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                ['Games Played', clubMilestones.gamesPlayed],
                ['Goals Scored', clubMilestones.goalsScored],
                ['Goals Conceded', clubMilestones.goalsConceded],
                ['Matches Won', clubMilestones.wins],
                ['Matches Lost', clubMilestones.losses],
                ['Matches Drawn', clubMilestones.draws],
                ['Clean Sheets', clubMilestones.cleanSheets],
              ].map(([label, val]) => (
                <div
                  key={String(label)}
                  className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4"
                >
                  <p className="text-xs text-[var(--fx-text-muted)]">{String(label)}</p>
                  <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-text)]">{val}</p>
                </div>
              ))}

              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4 col-span-2 sm:col-span-1 lg:col-span-2">
                <p className="text-xs text-[var(--fx-text-muted)]">Biggest Win</p>
                <p className="mt-1 text-base font-semibold text-[var(--fx-win)] font-mono-num">
                  {clubMilestones.biggestWin}
                </p>
              </div>

              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4 col-span-2 sm:col-span-2 lg:col-span-1">
                <p className="text-xs text-[var(--fx-text-muted)]">Biggest Loss</p>
                <p className="mt-1 text-base font-semibold text-[var(--fx-loss)] font-mono-num">
                  {clubMilestones.biggestLoss}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Last Five Matches Result ONLY (no scorecards!) */}
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6">
                <p className="text-xs font-medium text-[var(--fx-text-muted)]">
                  Last Five Matches Result Only (Oldest to Latest)
                </p>
                <h3 className="font-display mt-1 text-2xl font-bold text-[var(--fx-text)]">
                  Recent Club Form
                </h3>

                {clubMilestones.lastFive.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--fx-text-muted)]">No completed club matches yet.</p>
                ) : (
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    {clubMilestones.lastFive.map((res, idx) => (
                      <div
                        key={idx}
                        className={`flex h-12 w-24 items-center justify-center rounded-lg border font-mono-num text-sm font-semibold ${
                          res === 'W'
                            ? 'border-[var(--fx-win-border)] bg-[var(--fx-win-soft)] text-[var(--fx-win)]'
                            : res === 'L'
                            ? 'border-[var(--fx-loss-border)] bg-[var(--fx-loss-soft)] text-[var(--fx-loss)]'
                            : 'border-[var(--fx-silver-border)] bg-[var(--fx-silver-soft)] text-[var(--fx-text-secondary)]'
                        }`}
                      >
                        {res === 'W' ? 'Win' : res === 'L' ? 'Loss' : 'Draw'}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Trophies Won */}
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-[var(--fx-text-muted)]">Silverware Cabinet</p>
                    <h3 className="font-display mt-1 text-2xl font-bold text-[var(--fx-text)] flex items-center gap-2">
                      <Trophy className="h-5 w-5 text-[var(--fx-accent-text)]" />
                      <span>Trophies Won</span>
                    </h3>
                  </div>

                  {isManager && (
                    <button
                      type="button"
                      onClick={() => {
                        setFirstBonus(trophyConfig.firstPlaceBonus);
                        setSecondBonus(trophyConfig.secondPlaceBonus);
                        setThirdBonus(trophyConfig.thirdPlaceBonus);
                        setTrophyModalOpen(true);
                      }}
                      className="rounded-lg border border-[var(--fx-border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                    >
                      Adjust Historical Counts
                    </button>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-4 font-mono-num">
                  <div className="rounded-lg border border-[var(--fx-warn-border)] bg-[var(--fx-warn-soft)] p-4 text-center">
                    <p className="text-xs font-sans font-medium text-[var(--fx-warn)]">1st Place</p>
                    <p className="mt-1 text-3xl font-bold text-[var(--fx-text)]">
                      {clubMilestones.firstPlaceTrophies}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-silver-border)] bg-[var(--fx-silver-soft)] p-4 text-center">
                    <p className="text-xs font-sans font-medium text-[var(--fx-text-secondary)]">2nd Place</p>
                    <p className="mt-1 text-3xl font-bold text-[var(--fx-text)]">
                      {clubMilestones.secondPlaceTrophies}
                    </p>
                  </div>
                  <div className="rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-4 text-center">
                    <p className="text-xs font-sans font-medium text-[var(--fx-accent-text)]">3rd Place</p>
                    <p className="mt-1 text-3xl font-bold text-[var(--fx-text)]">
                      {clubMilestones.thirdPlaceTrophies}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PLAYER MILESTONES */}
        {activeTab === 'players' && (
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {playerMilestones.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-5 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-[var(--fx-text-muted)]">{item.label}</p>
                  <Medal className="h-4 w-4 text-[var(--fx-accent-text)] shrink-0" />
                </div>
                <div className="mt-4">
                  <p className="font-display text-2xl font-bold text-[var(--fx-text)] truncate">
                    {item.playerName}
                  </p>
                  <p className="mt-1 text-xs text-[var(--fx-accent-text)] font-mono-num">
                    {item.value} {item.unit}
                    {item.position ? ` · ${item.position}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: DISCIPLINE & FINES */}
        {activeTab === 'discipline' && (
          <div className="mt-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-[var(--fx-text-muted)]">
                Club Fine Rules: Yellow Card = 50 Rs · Red Card = 100 Rs · Teammate Misbehavior = 50 Rs · Confirmed IN No-Show = 200 Rs
              </p>

              {canEdit && players.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setPlayerId(players[0]?.id || '');
                    setIncidentModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] whitespace-nowrap shrink-0 min-h-[40px]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Log Discipline Fine</span>
                </button>
              )}
            </div>

            {/* Discipline KPI Strip */}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
                <p className="text-xs text-[var(--fx-text-muted)]">Team Yellow Cards</p>
                <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-warn)]">
                  {disciplineSummary.totalYellowCards}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
                <p className="text-xs text-[var(--fx-text-muted)]">Team Red Cards</p>
                <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-loss)]">
                  {disciplineSummary.totalRedCards}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
                <p className="text-xs text-[var(--fx-text-muted)]">Fine Pending (PKR)</p>
                <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-loss)]">
                  Rs {disciplineSummary.pendingFinePkr.toLocaleString()}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] px-5 py-4">
                <p className="text-xs text-[var(--fx-text-muted)]">Total Fine Received (PKR)</p>
                <p className="font-mono-num mt-1 text-2xl font-semibold text-[var(--fx-win)]">
                  Rs {disciplineSummary.receivedFinePkr.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Players with Pending Fines */}
            <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)] flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-[var(--fx-loss)]" />
                <span>Players With Pending Fines</span>
              </h3>

              {disciplineSummary.pendingPlayers.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--fx-text-muted)]">
                  All club player fines are currently settled.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-[var(--fx-border)]">
                  {disciplineSummary.pendingPlayers.map((entry) => (
                    <div
                      key={entry.playerId || entry.playerName}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[var(--fx-text)]">{entry.playerName}</p>
                        <p className="text-xs text-[var(--fx-text-muted)]">
                          {entry.incidents
                            .map((i) => `${getReasonLabel(i.reason)} (Rs ${i.finePkr})`)
                            .join(' · ')}
                        </p>
                      </div>
                      <p className="font-mono-num text-sm font-bold text-[var(--fx-loss)]">
                        Pending: Rs {entry.totalPendingPkr}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Complete Discipline Incident Ledger */}
            <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] overflow-hidden">
              <div className="px-6 py-4 border-b border-[var(--fx-border)]">
                <h3 className="font-display text-xl font-bold text-[var(--fx-text)]">
                  Discipline &amp; Fine Ledger
                </h3>
              </div>

              {incidents.length === 0 ? (
                <div className="p-8 text-center text-sm text-[var(--fx-text-muted)]">
                  No disciplinary incidents recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-[var(--fx-border)] text-[var(--fx-text-muted)]">
                        <th className="py-3 px-6 font-medium">Player</th>
                        <th className="py-3 px-4 font-medium">Offense</th>
                        <th className="py-3 px-4 font-medium">Match / Date</th>
                        <th className="py-3 px-4 text-right font-medium">Fine (PKR)</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        {canEdit && <th className="py-3 px-6 text-right font-medium">Action</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--fx-border)]">
                      {incidents.map((inc) => (
                        <tr key={inc.id} className="hover:bg-[var(--fx-surface-hover)]">
                          <td className="py-3 px-6 font-medium text-[var(--fx-text)]">{inc.playerName}</td>
                          <td className="py-3 px-4 text-[var(--fx-text-secondary)]">
                            {getReasonLabel(inc.reason)}
                            {inc.notes ? (
                              <span className="block text-[11px] text-[var(--fx-text-muted)]">{inc.notes}</span>
                            ) : null}
                          </td>
                          <td className="py-3 px-4 text-[var(--fx-text-muted)] font-mono-num">
                            {inc.matchLabel} · {inc.incidentDate}
                          </td>
                          <td className="py-3 px-4 text-right font-mono-num font-semibold text-[var(--fx-text)]">
                            Rs {inc.finePkr}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`font-semibold ${
                                inc.status === 'paid' ? 'text-[var(--fx-win)]' : 'text-[var(--fx-loss)]'
                              }`}
                            >
                              {inc.status === 'paid' ? 'Paid' : 'Pending'}
                            </span>
                          </td>
                          {canEdit && (
                            <td className="py-3 px-6 text-right space-x-2 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => handleTogglePaid(inc)}
                                className="inline-flex items-center gap-1 rounded border border-[var(--fx-border-strong)] px-2.5 py-1 text-[11px] text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                              >
                                <CheckCircle2 className="h-3 w-3" />
                                <span>{inc.status === 'pending' ? 'Mark Paid' : 'Set Pending'}</span>
                              </button>
                              {isManager && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteIncident(inc.id)}
                                  className="text-[var(--fx-loss)] hover:opacity-80 text-[11px]"
                                >
                                  Delete
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Log Discipline Incident Modal */}
      {incidentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                Log Discipline Fine
              </h3>
              <button
                type="button"
                onClick={() => setIncidentModalOpen(false)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Player</label>
                <select
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                >
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Offense &amp; Automatic Fine</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as DisciplineReason)}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                >
                  <option value="yellow_card">Yellow Card — Rs 50</option>
                  <option value="red_card">Red Card — Rs 100</option>
                  <option value="misbehavior">Teammate Misbehavior — Rs 50</option>
                  <option value="no_show">Said Yes &amp; No-Show — Rs 200</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Match / Session</label>
                  <input
                    type="text"
                    required
                    value={matchLabel}
                    onChange={(e) => setMatchLabel(e.target.value)}
                    placeholder="vs Burewala United"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={incidentDate}
                    onChange={(e) => setIncidentDate(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Payment Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as 'pending' | 'paid')}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                >
                  <option value="pending">Pending</option>
                  <option value="paid">Paid</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional details..."
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[var(--fx-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setIncidentModalOpen(false)}
                  className="rounded-lg border border-[var(--fx-border-strong)] px-4 py-2 text-xs font-semibold text-[var(--fx-text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-[var(--fx-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)]"
                >
                  {saving ? 'Saving...' : `Save (Rs ${getFineAmountForReason(reason)})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Trophy Bonus Modal */}
      {trophyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                Historical Trophies Adjustment
              </h3>
              <button
                type="button"
                onClick={() => setTrophyModalOpen(false)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveTrophyConfig} className="mt-5 space-y-4">
              <p className="text-xs text-[var(--fx-text-muted)]">
                Add prior club trophies won before digital tracking (automatically summed with completed tournaments/series).
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">1st Place Bonus</label>
                  <input
                    type="number"
                    min={0}
                    value={firstBonus}
                    onChange={(e) => setFirstBonus(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">2nd Place Bonus</label>
                  <input
                    type="number"
                    min={0}
                    value={secondBonus}
                    onChange={(e) => setSecondBonus(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">3rd Place Bonus</label>
                  <input
                    type="number"
                    min={0}
                    value={thirdBonus}
                    onChange={(e) => setThirdBonus(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-[var(--fx-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setTrophyModalOpen(false)}
                  className="rounded-lg border border-[var(--fx-border-strong)] px-4 py-2 text-xs text-[var(--fx-text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-[var(--fx-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)]"
                >
                  Save Counts
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
