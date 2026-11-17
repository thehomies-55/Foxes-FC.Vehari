import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Camera,
  Edit3,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  Player,
  PlayerIgContact,
  PlayerPosition,
  PlayerPositionGroup,
  StatsScope,
  UserRole,
} from '../types';
import {
  PLAYER_POSITION_GROUPS,
  getPositionGroup,
  getPositionLabel,
  getScopedPlayerStats,
  isDefensiveOrKeeperPosition,
  normalizeIgHandleKey,
} from '../utils/clubCalculations';
import { ASSET_IMAGES } from '../utils/seedData';

interface SquadSectionProps {
  players: Player[];
  role: UserRole;
  playerIgContacts?: PlayerIgContact[];
  onNotify: (msg: string) => void;
}

const POSITION_LINE_OPTIONS: ('ALL' | PlayerPositionGroup)[] = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

async function compressPlayerPhotoFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode image file.'));
      el.src = objectUrl;
    });

    const size = 220;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable in this browser.');

    // Center-crop square
    const minSide = Math.min(img.width, img.height);
    const sx = Math.max(0, (img.width - minSide) / 2);
    const sy = Math.max(0, (img.height - minSide) / 2);
    ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

    for (const q of [0.84, 0.7, 0.52, 0.38]) {
      const webp = canvas.toDataURL('image/webp', q);
      if (webp.length <= 150000) return webp;
      const jpeg = canvas.toDataURL('image/jpeg', q);
      if (jpeg.length <= 150000) return jpeg;
    }

    throw new Error('Selected photo is too large after compression.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function getDefaultKitForPosition(pos: PlayerPosition): string {
  const grp = getPositionGroup(pos);
  if (grp === 'GK') return ASSET_IMAGES.keeper;
  if (grp === 'MID' || grp === 'DEF') return ASSET_IMAGES.midfielder;
  return ASSET_IMAGES.striker;
}

export const SquadSection: React.FC<SquadSectionProps> = ({
  players,
  role,
  playerIgContacts = [],
  onNotify,
}) => {
  const canEdit = role === 'manager' || role === 'editor';
  const isManager = role === 'manager';

  const [scope, setScope] = useState<StatsScope>('combined');
  const [positionFilter, setPositionFilter] = useState<'ALL' | PlayerPositionGroup>('ALL');
  const [specificPositionFilter, setSpecificPositionFilter] = useState<'ALL' | PlayerPosition>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Player-to-Player Comparison Tool
  const [compareOpen, setCompareOpen] = useState(false);
  const [comparePlayerAId, setComparePlayerAId] = useState('');
  const [comparePlayerBId, setComparePlayerBId] = useState('');

  // Add/Edit modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState(21);
  const [jerseyNumber, setJerseyNumber] = useState(9);
  const [position, setPosition] = useState<PlayerPosition>('FWD');
  const [photoUrl, setPhotoUrl] = useState(ASSET_IMAGES.striker);

  const [extGames, setExtGames] = useState(0);
  const [extGoals, setExtGoals] = useState(0);
  const [extAssists, setExtAssists] = useState(0);
  const [extAvgRating, setExtAvgRating] = useState(7.5);
  const [extPenalties, setExtPenalties] = useState(0);
  const [extYellowCards, setExtYellowCards] = useState(0);
  const [extRedCards, setExtRedCards] = useState(0);
  const [extPotm, setExtPotm] = useState(0);
  const [extCleanSheets, setExtCleanSheets] = useState(0);

  const [icGames, setIcGames] = useState(0);
  const [icGoals, setIcGoals] = useState(0);
  const [icAssists, setIcAssists] = useState(0);
  const [icAvgRating, setIcAvgRating] = useState(7.5);
  const [icPenalties, setIcPenalties] = useState(0);
  const [icYellowCards, setIcYellowCards] = useState(0);
  const [icRedCards, setIcRedCards] = useState(0);
  const [icPotm, setIcPotm] = useState(0);
  const [icCleanSheets, setIcCleanSheets] = useState(0);

  const [hatTricks, setHatTricks] = useState(0);
  const [bestSingleGameGoals, setBestSingleGameGoals] = useState(0);
  const [bestSingleGameAssists, setBestSingleGameAssists] = useState(0);
  const [playerIgInput, setPlayerIgInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const [modalPhotoError, setModalPhotoError] = useState(false);

  // Dedicated per-player profile picture modal
  const [photoTargetPlayer, setPhotoTargetPlayer] = useState<Player | null>(null);
  const [quickPhotoUrl, setQuickPhotoUrl] = useState('');
  const [savingQuickPhoto, setSavingQuickPhoto] = useState(false);
  const [quickPhotoError, setQuickPhotoError] = useState(false);

  const sortedPlayersForSelect = useMemo(() => {
    return [...players].sort(
      (a, b) => a.jerseyNumber - b.jerseyNumber || a.name.localeCompare(b.name)
    );
  }, [players]);

  const effectiveComparePlayerA = useMemo(() => {
    if (sortedPlayersForSelect.length === 0) return null;
    return (
      sortedPlayersForSelect.find((p) => p.id === comparePlayerAId) ||
      sortedPlayersForSelect[0]
    );
  }, [sortedPlayersForSelect, comparePlayerAId]);

  const effectiveComparePlayerB = useMemo(() => {
    if (sortedPlayersForSelect.length === 0) return null;
    const found = sortedPlayersForSelect.find((p) => p.id === comparePlayerBId);
    if (found) return found;
    return (
      sortedPlayersForSelect.find((p) => p.id !== effectiveComparePlayerA?.id) ||
      sortedPlayersForSelect[0]
    );
  }, [sortedPlayersForSelect, comparePlayerBId, effectiveComparePlayerA]);

  const comparisonMetrics = useMemo(() => {
    if (!effectiveComparePlayerA || !effectiveComparePlayerB) return null;
    const a = effectiveComparePlayerA;
    const b = effectiveComparePlayerB;
    const sa = getScopedPlayerStats(a, scope);
    const sb = getScopedPlayerStats(b, scope);

    const aPerGameGoals = sa.games > 0 ? Number((sa.goals / sa.games).toFixed(2)) : 0;
    const bPerGameGoals = sb.games > 0 ? Number((sb.goals / sb.games).toFixed(2)) : 0;
    const aContrib = sa.goals + sa.assists;
    const bContrib = sb.goals + sb.assists;
    const aPerGameContrib = sa.games > 0 ? Number((aContrib / sa.games).toFixed(2)) : 0;
    const bPerGameContrib = sb.games > 0 ? Number((bContrib / sb.games).toFixed(2)) : 0;

    const showCleanSheets =
      isDefensiveOrKeeperPosition(a.position) || isDefensiveOrKeeperPosition(b.position);

    const rows: {
      key: string;
      label: string;
      valA: number;
      valB: number;
      displayA: string;
      displayB: string;
      lowerIsBetter?: boolean;
    }[] = [
      {
        key: 'avgRating',
        label: 'Average Match Rating',
        valA: sa.avgRating,
        valB: sb.avgRating,
        displayA: sa.avgRating.toFixed(2),
        displayB: sb.avgRating.toFixed(2),
      },
      {
        key: 'games',
        label: 'Games Played',
        valA: sa.games,
        valB: sb.games,
        displayA: String(sa.games),
        displayB: String(sb.games),
      },
      {
        key: 'goals',
        label: 'Goals Scored',
        valA: sa.goals,
        valB: sb.goals,
        displayA: String(sa.goals),
        displayB: String(sb.goals),
      },
      {
        key: 'goalsPerGame',
        label: 'Goals / Game',
        valA: aPerGameGoals,
        valB: bPerGameGoals,
        displayA: aPerGameGoals.toFixed(2),
        displayB: bPerGameGoals.toFixed(2),
      },
      {
        key: 'assists',
        label: 'Assists',
        valA: sa.assists,
        valB: sb.assists,
        displayA: String(sa.assists),
        displayB: String(sb.assists),
      },
      {
        key: 'contributions',
        label: 'Goal Contributions (G+A)',
        valA: aContrib,
        valB: bContrib,
        displayA: String(aContrib),
        displayB: String(bContrib),
      },
      {
        key: 'contribPerGame',
        label: 'Contributions / Game',
        valA: aPerGameContrib,
        valB: bPerGameContrib,
        displayA: aPerGameContrib.toFixed(2),
        displayB: bPerGameContrib.toFixed(2),
      },
      {
        key: 'potm',
        label: 'POTM Awards',
        valA: sa.potm,
        valB: sb.potm,
        displayA: String(sa.potm),
        displayB: String(sb.potm),
      },
      {
        key: 'penalties',
        label: 'Penalties Scored',
        valA: sa.penalties,
        valB: sb.penalties,
        displayA: String(sa.penalties),
        displayB: String(sb.penalties),
      },
    ];

    if (showCleanSheets) {
      const aCs = sa.cleanSheets ?? 0;
      const bCs = sb.cleanSheets ?? 0;
      rows.push({
        key: 'cleanSheets',
        label: 'Clean Sheets (GK/DEF)',
        valA: aCs,
        valB: bCs,
        displayA: String(aCs),
        displayB: String(bCs),
      });
    }

    if (scope === 'combined') {
      rows.push(
        {
          key: 'hatTricks',
          label: 'Career Hat-Tricks',
          valA: a.hatTricks,
          valB: b.hatTricks,
          displayA: String(a.hatTricks),
          displayB: String(b.hatTricks),
        },
        {
          key: 'bestSingleGoals',
          label: 'Best Goals / Match',
          valA: a.bestSingleGameGoals,
          valB: b.bestSingleGameGoals,
          displayA: String(a.bestSingleGameGoals),
          displayB: String(b.bestSingleGameGoals),
        }
      );
    }

    rows.push(
      {
        key: 'yellowCards',
        label: 'Yellow Cards (Fewer Better)',
        valA: sa.yellowCards,
        valB: sb.yellowCards,
        displayA: String(sa.yellowCards),
        displayB: String(sb.yellowCards),
        lowerIsBetter: true,
      },
      {
        key: 'redCards',
        label: 'Red Cards (Fewer Better)',
        valA: sa.redCards,
        valB: sb.redCards,
        displayA: String(sa.redCards),
        displayB: String(sb.redCards),
        lowerIsBetter: true,
      }
    );

    let leadsA = 0;
    let leadsB = 0;
    let ties = 0;

    const evaluatedRows = rows.map((r) => {
      let winner: 'A' | 'B' | 'tie' = 'tie';
      if (r.valA !== r.valB) {
        if (r.lowerIsBetter) {
          winner = r.valA < r.valB ? 'A' : 'B';
        } else {
          winner = r.valA > r.valB ? 'A' : 'B';
        }
      }
      if (winner === 'A') leadsA += 1;
      else if (winner === 'B') leadsB += 1;
      else ties += 1;

      const maxVal = Math.max(r.valA, r.valB, 0.0001);
      const pctA = r.valA === 0 && r.valB === 0 ? 50 : Math.round((r.valA / maxVal) * 100);
      const pctB = r.valA === 0 && r.valB === 0 ? 50 : Math.round((r.valB / maxVal) * 100);
      return { ...r, winner, pctA, pctB };
    });

    return {
      playerA: a,
      playerB: b,
      statsA: sa,
      statsB: sb,
      rows: evaluatedRows,
      leadsA,
      leadsB,
      ties,
    };
  }, [effectiveComparePlayerA, effectiveComparePlayerB, scope]);

  const openCompareWithPlayer = (playerId: string) => {
    setComparePlayerAId(playerId);
    if (!comparePlayerBId || comparePlayerBId === playerId) {
      const other = sortedPlayersForSelect.find((p) => p.id !== playerId);
      if (other) setComparePlayerBId(other.id);
    }
    setCompareOpen(true);
    const el = document.getElementById('player-comparison-tool');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handleSwapComparedPlayers = () => {
    if (!effectiveComparePlayerA || !effectiveComparePlayerB) return;
    setComparePlayerAId(effectiveComparePlayerB.id);
    setComparePlayerBId(effectiveComparePlayerA.id);
  };

  const filteredPlayers = useMemo(() => {
    return players
      .filter((p) => {
        if (specificPositionFilter !== 'ALL') {
          return p.position === specificPositionFilter;
        }
        if (positionFilter !== 'ALL') {
          return getPositionGroup(p.position) === positionFilter;
        }
        return true;
      })
      .filter((p) => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
      .sort((a, b) => {
        const sa = getScopedPlayerStats(a, scope);
        const sb = getScopedPlayerStats(b, scope);
        return sb.goals - sa.goals || sb.assists - sa.assists || a.jerseyNumber - b.jerseyNumber;
      });
  }, [players, positionFilter, specificPositionFilter, searchQuery, scope]);

  const openCreateModal = () => {
    setEditingPlayer(null);
    setName('');
    setAge(21);
    setJerseyNumber(11);
    setPosition('FWD');
    setPhotoUrl(ASSET_IMAGES.striker);
    setModalPhotoError(false);
    setExtGames(0);
    setExtGoals(0);
    setExtAssists(0);
    setExtAvgRating(7.5);
    setExtPenalties(0);
    setExtYellowCards(0);
    setExtRedCards(0);
    setExtPotm(0);
    setExtCleanSheets(0);
    setIcGames(0);
    setIcGoals(0);
    setIcAssists(0);
    setIcAvgRating(7.5);
    setIcPenalties(0);
    setIcYellowCards(0);
    setIcRedCards(0);
    setIcPotm(0);
    setIcCleanSheets(0);
    setHatTricks(0);
    setBestSingleGameGoals(0);
    setBestSingleGameAssists(0);
    setPlayerIgInput('');
    setModalOpen(true);
  };

  const openEditModal = (p: Player) => {
    setEditingPlayer(p);
    setName(p.name);
    setAge(p.age);
    setJerseyNumber(p.jerseyNumber);
    setPosition(p.position);
    setPhotoUrl(p.photoUrl);
    setModalPhotoError(false);
    setExtGames(p.extGames);
    setExtGoals(p.extGoals);
    setExtAssists(p.extAssists);
    setExtAvgRating(p.extGames > 0 ? Number((p.extRatingSum / p.extGames).toFixed(2)) : 7.5);
    setExtPenalties(p.extPenalties);
    setExtYellowCards(p.extYellowCards);
    setExtRedCards(p.extRedCards);
    setExtPotm(p.extPotm);
    setExtCleanSheets(p.extCleanSheets);
    setIcGames(p.icGames);
    setIcGoals(p.icGoals);
    setIcAssists(p.icAssists);
    setIcAvgRating(p.icGames > 0 ? Number((p.icRatingSum / p.icGames).toFixed(2)) : 7.5);
    setIcPenalties(p.icPenalties);
    setIcYellowCards(p.icYellowCards);
    setIcRedCards(p.icRedCards);
    setIcPotm(p.icPotm);
    setIcCleanSheets(p.icCleanSheets);
    setHatTricks(p.hatTricks);
    setBestSingleGameGoals(p.bestSingleGameGoals);
    setBestSingleGameAssists(p.bestSingleGameAssists);
    const existingIg = playerIgContacts.find((c) => c.playerId === p.id);
    setPlayerIgInput(existingIg?.instagramId || '');
    setModalOpen(true);
  };

  const handleSavePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;

    const cleanName = name.trim().slice(0, 80);
    if (cleanName.length < 2) {
      onNotify('Player name must be at least 2 characters.');
      return;
    }

    const toNonNegInt = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
    const safeExtGames = toNonNegInt(extGames);
    const safeIcGames = toNonNegInt(icGames);
    const isDefOrGk = isDefensiveOrKeeperPosition(position);

    const payload = {
      name: cleanName,
      age: Math.max(10, Math.min(65, Math.round(Number(age) || 20))),
      jerseyNumber: Math.max(1, Math.min(99, Math.round(Number(jerseyNumber) || 1))),
      position,
      photoUrl: photoUrl.trim() || getDefaultKitForPosition(position),
      extGames: safeExtGames,
      extGoals: toNonNegInt(extGoals),
      extAssists: toNonNegInt(extAssists),
      extRatingSum: Math.max(0, Number((safeExtGames * Math.max(0, Number(extAvgRating) || 0)).toFixed(2))),
      extPenalties: toNonNegInt(extPenalties),
      extRedCards: toNonNegInt(extRedCards),
      extYellowCards: toNonNegInt(extYellowCards),
      extPotm: toNonNegInt(extPotm),
      extCleanSheets: isDefOrGk ? toNonNegInt(extCleanSheets) : 0,
      icGames: safeIcGames,
      icGoals: toNonNegInt(icGoals),
      icAssists: toNonNegInt(icAssists),
      icRatingSum: Math.max(0, Number((safeIcGames * Math.max(0, Number(icAvgRating) || 0)).toFixed(2))),
      icPenalties: toNonNegInt(icPenalties),
      icRedCards: toNonNegInt(icRedCards),
      icYellowCards: toNonNegInt(icYellowCards),
      icPotm: toNonNegInt(icPotm),
      icCleanSheets: isDefOrGk ? toNonNegInt(icCleanSheets) : 0,
      hatTricks: toNonNegInt(hatTricks),
      bestSingleGameGoals: toNonNegInt(bestSingleGameGoals),
      bestSingleGameAssists: toNonNegInt(bestSingleGameAssists),
    };

    if (payload.photoUrl.length > 195000) {
      onNotify('Profile picture is too large. Please upload a smaller image or paste an image URL.');
      return;
    }

    setSaving(true);

    try {
      let targetPlayerId = editingPlayer?.id || '';
      if (editingPlayer) {
        await updateDoc(doc(db, 'players', editingPlayer.id), {
          ...payload,
          updatedAt: serverTimestamp(),
        });
      } else {
        const slug = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
        targetPlayerId = `plr_${slug || 'player'}_${Date.now()}`;
        await setDoc(doc(db, 'players', targetPlayerId), {
          ...payload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      if (isManager && targetPlayerId && playerIgInput.trim().length >= 2) {
        const cleanIg = playerIgInput.trim().slice(0, 80);
        const newKey = normalizeIgHandleKey(cleanIg);
        const existingIg = playerIgContacts.find((c) => c.playerId === targetPlayerId);
        const oldKey = existingIg ? normalizeIgHandleKey(existingIg.instagramId) : '';
        await setDoc(doc(db, 'playerIgDirectory', targetPlayerId), {
          playerId: targetPlayerId,
          playerName: payload.name,
          instagramId: cleanIg,
          updatedAt: serverTimestamp(),
        });
        if (newKey) {
          await setDoc(doc(db, 'igVerifiedHandles', newKey), {
            handleKey: newKey,
            playerName: payload.name,
            active: true,
            updatedAt: serverTimestamp(),
          });
        }
        if (oldKey && oldKey !== newKey) {
          await deleteDoc(doc(db, 'igVerifiedHandles', oldKey));
        }
      }

      if (targetPlayerId) {
        setBrokenImages((prev) => ({ ...prev, [targetPlayerId]: false }));
      }

      onNotify(
        editingPlayer ? `Updated ${payload.name}.` : `Added ${payload.name} to club squad.`
      );
      setModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, editingPlayer ? OperationType.UPDATE : OperationType.CREATE, 'players');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadPhoto = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'modal' | 'quick'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const compressed = await compressPlayerPhotoFile(file);
      if (target === 'modal') {
        setPhotoUrl(compressed);
        setModalPhotoError(false);
      } else {
        setQuickPhotoUrl(compressed);
        setQuickPhotoError(false);
      }
      onNotify('Profile picture ready. Click Save to apply.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to process profile picture.');
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const openQuickPhotoModal = (p: Player) => {
    setPhotoTargetPlayer(p);
    setQuickPhotoUrl(p.photoUrl);
    setQuickPhotoError(false);
  };

  const handleSaveQuickPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !photoTargetPlayer) return;
    const cleanUrl = quickPhotoUrl.trim() || getDefaultKitForPosition(photoTargetPlayer.position);
    if (cleanUrl.length > 195000) {
      onNotify('Profile picture is too large. Please upload a smaller image or URL.');
      return;
    }

    setSavingQuickPhoto(true);
    try {
      await updateDoc(doc(db, 'players', photoTargetPlayer.id), {
        photoUrl: cleanUrl,
        updatedAt: serverTimestamp(),
      });
      setBrokenImages((prev) => ({ ...prev, [photoTargetPlayer.id]: false }));
      onNotify(`Updated profile picture for ${photoTargetPlayer.name}.`);
      setPhotoTargetPlayer(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `players/${photoTargetPlayer.id}`);
    } finally {
      setSavingQuickPhoto(false);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    if (!isManager) return;
    try {
      await deleteDoc(doc(db, 'players', playerId));
      onNotify('Player removed from squad.');
      if (selectedPlayer?.id === playerId) setSelectedPlayer(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `players/${playerId}`);
    }
  };

  return (
    <section id="squad" className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">
              Combined, External &amp; Inter-Club Breakdown
            </p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
              Squad &amp; Player Statistics
            </h2>
            <p className="mt-1 text-sm text-[var(--fx-text-muted)]">
              Complete match ratings, goals, assists, penalties, cards, POTMs, and clean sheets for Defenders &amp; Goalkeepers.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Scope Toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1">
              {(
                [
                  { id: 'combined', label: 'Combined Stats' },
                  { id: 'external', label: 'External Matches' },
                  { id: 'inter_club', label: 'Inter-Club Matches' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setScope(tab.id)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    scope === tab.id
                      ? 'bg-[var(--fx-accent)] text-white'
                      : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {players.length >= 2 && (
              <button
                type="button"
                onClick={() => setCompareOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[40px] ${
                  compareOpen
                    ? 'border-[var(--fx-accent)] bg-[var(--fx-accent)] text-white'
                    : 'border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] text-[var(--fx-accent-fg)] hover:opacity-90'
                }`}
              >
                <BarChart3 className="h-4 w-4" />
                <span>{compareOpen ? 'Hide Comparison Tool' : 'Compare Players'}</span>
              </button>
            )}

            {canEdit && (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <Plus className="h-4 w-4" />
                <span>Add Player</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter Bar */}
        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1 w-fit">
              {POSITION_LINE_OPTIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => {
                    setPositionFilter(pos);
                    setSpecificPositionFilter('ALL');
                  }}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    positionFilter === pos && specificPositionFilter === 'ALL'
                      ? 'bg-[var(--fx-accent)] text-white'
                      : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>

            <select
              aria-label="Filter by specific field position"
              value={specificPositionFilter}
              onChange={(e) => {
                const val = e.target.value as 'ALL' | PlayerPosition;
                setSpecificPositionFilter(val);
                if (val !== 'ALL') {
                  setPositionFilter(getPositionGroup(val));
                }
              }}
              className="rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
            >
              <option value="ALL">All Field Positions</option>
              {PLAYER_POSITION_GROUPS.map((grp) => (
                <optgroup key={grp.group} label={grp.title}>
                  {grp.positions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos} — {getPositionLabel(pos)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search player name..."
            className="w-full lg:w-64 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3.5 py-2 text-xs text-[var(--fx-text)] placeholder:text-[var(--fx-text-muted)] focus:border-[var(--fx-accent)] focus:outline-none"
          />
        </div>

        {/* Head-to-Head Player Comparison Tool */}
        {compareOpen && comparisonMetrics && (
          <div
            id="player-comparison-tool"
            className="mt-6 rounded-xl border border-[var(--fx-accent-border)] bg-[var(--fx-surface)] p-5 sm:p-6 shadow-sm space-y-5"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--fx-border)] pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--fx-accent-text)]">
                  Player Comparison Tool ·{' '}
                  {scope === 'combined'
                    ? 'Combined Stats'
                    : scope === 'external'
                    ? 'External Matches'
                    : 'Inter-Club Matches'}
                </p>
                <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                  Head-to-Head Squad Comparison
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleSwapComparedPlayers}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text)] hover:border-[var(--fx-accent)] transition-colors"
                >
                  <ArrowLeftRight className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
                  <span>Swap Sides</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompareOpen(false)}
                  aria-label="Close player comparison tool"
                  className="rounded-lg p-1.5 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Player A vs Player B Selectors & Identity Cards */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr] md:items-center">
              {/* Player A */}
              <div className="rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-bg-alt)] p-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--fx-accent-text)] mb-1">
                    Player A
                  </label>
                  <select
                    value={comparisonMetrics.playerA.id}
                    onChange={(e) => setComparePlayerAId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-2 text-xs font-medium text-[var(--fx-text)]"
                  >
                    {sortedPlayersForSelect.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jerseyNumber} {p.name} ({p.position})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)]">
                    {comparisonMetrics.playerA.photoUrl &&
                    !brokenImages[comparisonMetrics.playerA.id] ? (
                      <img
                        src={comparisonMetrics.playerA.photoUrl}
                        alt={comparisonMetrics.playerA.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenImages((prev) => ({
                            ...prev,
                            [comparisonMetrics.playerA.id]: true,
                          }))
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-base font-bold text-[var(--fx-accent-text)]">
                        #{comparisonMetrics.playerA.jerseyNumber}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold text-[var(--fx-text)] truncate">
                      {comparisonMetrics.playerA.name}
                    </p>
                    <p className="text-[11px] text-[var(--fx-text-muted)]">
                      #{comparisonMetrics.playerA.jerseyNumber} ·{' '}
                      <span className="font-semibold text-[var(--fx-accent-text)]">
                        {comparisonMetrics.playerA.position}
                      </span>{' '}
                      ({getPositionLabel(comparisonMetrics.playerA.position)}) · Age{' '}
                      {comparisonMetrics.playerA.age}
                    </p>
                  </div>
                </div>
              </div>

              {/* Center Scoreboard Summary */}
              <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] px-4 py-3 text-center">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fx-text-muted)]">
                  Category Edge
                </span>
                <p className="mt-1 font-mono-num text-xl font-bold text-[var(--fx-text)]">
                  <span className="text-[var(--fx-accent-text)]">{comparisonMetrics.leadsA}</span>
                  <span className="mx-1.5 text-[var(--fx-text-muted)]">-</span>
                  <span className="text-[var(--fx-warn)]">{comparisonMetrics.leadsB}</span>
                </p>
                <span className="mt-0.5 text-[10px] text-[var(--fx-text-muted)]">
                  {comparisonMetrics.ties} {comparisonMetrics.ties === 1 ? 'tie' : 'ties'}
                </span>
              </div>

              {/* Player B */}
              <div className="rounded-lg border border-[var(--fx-warn-border)] bg-[var(--fx-bg-alt)] p-4 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--fx-warn)] mb-1">
                    Player B
                  </label>
                  <select
                    value={comparisonMetrics.playerB.id}
                    onChange={(e) => setComparePlayerBId(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-2 text-xs font-medium text-[var(--fx-text)]"
                  >
                    {sortedPlayersForSelect.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jerseyNumber} {p.name} ({p.position})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)]">
                    {comparisonMetrics.playerB.photoUrl &&
                    !brokenImages[comparisonMetrics.playerB.id] ? (
                      <img
                        src={comparisonMetrics.playerB.photoUrl}
                        alt={comparisonMetrics.playerB.name}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setBrokenImages((prev) => ({
                            ...prev,
                            [comparisonMetrics.playerB.id]: true,
                          }))
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center font-display text-base font-bold text-[var(--fx-warn)]">
                        #{comparisonMetrics.playerB.jerseyNumber}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xl font-bold text-[var(--fx-text)] truncate">
                      {comparisonMetrics.playerB.name}
                    </p>
                    <p className="text-[11px] text-[var(--fx-text-muted)]">
                      #{comparisonMetrics.playerB.jerseyNumber} ·{' '}
                      <span className="font-semibold text-[var(--fx-warn)]">
                        {comparisonMetrics.playerB.position}
                      </span>{' '}
                      ({getPositionLabel(comparisonMetrics.playerB.position)}) · Age{' '}
                      {comparisonMetrics.playerB.age}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {comparisonMetrics.playerA.id === comparisonMetrics.playerB.id ? (
              <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 text-center text-xs text-[var(--fx-text-muted)]">
                Select two different players above to see head-to-head stat bars and category leaders.
              </div>
            ) : (
              <div className="divide-y divide-[var(--fx-border)] rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)]">
                {comparisonMetrics.rows.map((row) => (
                  <div key={row.key} className="px-4 py-3 space-y-1.5">
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs">
                      <div className="flex items-center justify-start gap-2">
                        <span
                          className={`font-mono-num text-sm font-bold ${
                            row.winner === 'A'
                              ? 'text-[var(--fx-accent-text)]'
                              : 'text-[var(--fx-text-secondary)]'
                          }`}
                        >
                          {row.displayA}
                        </span>
                        {row.winner === 'A' && (
                          <span className="rounded bg-[var(--fx-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fx-accent-fg)]">
                            Lead
                          </span>
                        )}
                      </div>

                      <span className="text-center text-[11px] font-medium text-[var(--fx-text-secondary)]">
                        {row.label}
                      </span>

                      <div className="flex items-center justify-end gap-2">
                        {row.winner === 'B' && (
                          <span className="rounded bg-[var(--fx-warn-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fx-warn)]">
                            Lead
                          </span>
                        )}
                        <span
                          className={`font-mono-num text-sm font-bold ${
                            row.winner === 'B'
                              ? 'text-[var(--fx-warn)]'
                              : 'text-[var(--fx-text-secondary)]'
                          }`}
                        >
                          {row.displayB}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex justify-end h-2 rounded-l-full bg-[var(--fx-surface)] overflow-hidden border border-[var(--fx-border)]">
                        <div
                          className={`h-full transition-all ${
                            row.winner === 'A' ? 'bg-[var(--fx-accent)]' : 'bg-[var(--fx-border-strong)]'
                          }`}
                          style={{ width: `${row.pctA}%` }}
                        />
                      </div>
                      <div className="flex justify-start h-2 rounded-r-full bg-[var(--fx-surface)] overflow-hidden border border-[var(--fx-border)]">
                        <div
                          className={`h-full transition-all ${
                            row.winner === 'B' ? 'bg-[var(--fx-warn)]' : 'bg-[var(--fx-border-strong)]'
                          }`}
                          style={{ width: `${row.pctB}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {filteredPlayers.length === 0 ? (
          <div className="mt-8 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-10 text-center">
            <UserCheck className="mx-auto h-8 w-8 text-[var(--fx-text-muted)]" />
            <p className="mt-3 text-sm font-medium text-[var(--fx-text)]">No squad players found</p>
            <p className="mt-1 text-xs text-[var(--fx-text-muted)]">
              Add Foxes FC.vehari players to track combined and inter-club statistics.
            </p>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredPlayers.map((player) => {
              const stats = getScopedPlayerStats(player, scope);
              const showCleanSheets = isDefensiveOrKeeperPosition(player.position);

              return (
                <article
                  key={player.id}
                  className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-16 shrink-0">
                        <div className="h-16 w-16 overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)]">
                          {player.photoUrl && !brokenImages[player.id] ? (
                            <img
                              src={player.photoUrl}
                              alt={`${player.name} profile picture`}
                              referrerPolicy="no-referrer"
                              onError={() =>
                                setBrokenImages((prev) => ({ ...prev, [player.id]: true }))
                              }
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[var(--fx-bg-alt)] font-display text-xl font-bold text-[var(--fx-accent-text)]">
                              #{player.jerseyNumber}
                            </div>
                          )}
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openQuickPhotoModal(player)}
                            title={`Update profile picture for ${player.name}`}
                            aria-label={`Update profile picture for ${player.name}`}
                            className="absolute -bottom-1.5 -right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] text-[var(--fx-accent-text)] shadow hover:bg-[var(--fx-accent)] hover:text-white transition-colors"
                          >
                            <Camera className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[var(--fx-text-muted)]">
                          #{player.jerseyNumber} · {player.position} ({getPositionLabel(player.position)}) · Age {player.age}
                        </p>
                        <h3 className="font-display text-2xl font-bold text-[var(--fx-text)] truncate">
                          {player.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--fx-accent-text)] font-mono-num">
                          Avg Rating {stats.avgRating.toFixed(2)} · {stats.potm} POTM
                        </p>
                      </div>
                    </div>

                    {/* Crisp Tabular Stat Grid */}
                    <div className="mt-5 grid grid-cols-4 gap-y-3 gap-x-2 border-t border-[var(--fx-border)] pt-4 text-center">
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">Games</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-text)]">
                          {stats.games}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">Goals</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-text)]">
                          {stats.goals}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">Assists</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-text)]">
                          {stats.assists}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">Penalties</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-text)]">
                          {stats.penalties}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">Yellow</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-warn)]">
                          {stats.yellowCards}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">Red</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-loss)]">
                          {stats.redCards}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">POTM</p>
                        <p className="font-mono-num text-base font-semibold text-[var(--fx-accent-text)]">
                          {stats.potm}
                        </p>
                      </div>
                      {showCleanSheets ? (
                        <div>
                          <p className="text-[11px] text-[var(--fx-text-muted)]">Clean Sheets</p>
                          <p className="font-mono-num text-base font-semibold text-[var(--fx-win)]">
                            {stats.cleanSheets ?? 0}
                          </p>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] text-[var(--fx-text-muted)]">Hat-Tricks</p>
                          <p className="font-mono-num text-base font-semibold text-[var(--fx-text-secondary)]">
                            {player.hatTricks}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-[var(--fx-border)] bg-[var(--fx-bg-alt)] px-5 py-3 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelectedPlayer(player)}
                        className="text-xs font-medium text-[var(--fx-accent-text)] hover:underline"
                      >
                        Split Stats
                      </button>
                      {players.length >= 2 && (
                        <button
                          type="button"
                          onClick={() => openCompareWithPlayer(player.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fx-text-secondary)] hover:text-[var(--fx-accent-text)]"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          <span>Compare</span>
                        </button>
                      )}
                    </div>

                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => openQuickPhotoModal(player)}
                          className="inline-flex items-center gap-1 text-xs text-[var(--fx-text-secondary)] hover:text-[var(--fx-accent-text)]"
                        >
                          <Camera className="h-3.5 w-3.5" />
                          <span>Photo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(player)}
                          className="inline-flex items-center gap-1 text-xs text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          <span>Edit</span>
                        </button>
                        {isManager && (
                          <button
                            type="button"
                            onClick={() => handleDeletePlayer(player.id)}
                            className="inline-flex items-center gap-1 text-xs text-[var(--fx-loss)] hover:opacity-80"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* Side-by-Side External vs Inter-Club Comparison Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <div className="flex items-center gap-3.5">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)]">
                  {selectedPlayer.photoUrl && !brokenImages[selectedPlayer.id] ? (
                    <img
                      src={selectedPlayer.photoUrl}
                      alt={`${selectedPlayer.name} profile picture`}
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBrokenImages((prev) => ({ ...prev, [selectedPlayer.id]: true }))
                      }
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center font-display text-lg font-bold text-[var(--fx-accent-text)]">
                      #{selectedPlayer.jerseyNumber}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-xs text-[var(--fx-accent-text)]">
                    #{selectedPlayer.jerseyNumber} · {selectedPlayer.position} ({getPositionLabel(selectedPlayer.position)}) · Age{' '}
                    {selectedPlayer.age}
                  </p>
                  <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                    {selectedPlayer.name} — Split Statistics
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--fx-border)] text-[var(--fx-text-muted)]">
                    <th className="py-2 pr-4 font-medium">Metric</th>
                    <th className="py-2 px-3 text-right font-medium">External Matches</th>
                    <th className="py-2 px-3 text-right font-medium">Inter-Club Matches</th>
                    <th className="py-2 pl-3 text-right font-medium text-[var(--fx-accent-text)]">Combined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--fx-border)] font-mono-num">
                  {(
                    [
                      ['Games Played', 'games'],
                      ['Goals', 'goals'],
                      ['Assists', 'assists'],
                      ['Avg Match Rating', 'avgRating'],
                      ['Penalties Scored', 'penalties'],
                      ['Yellow Cards', 'yellowCards'],
                      ['Red Cards', 'redCards'],
                      ['POTM Won', 'potm'],
                    ] as const
                  ).map(([label, key]) => {
                    const ext = getScopedPlayerStats(selectedPlayer, 'external')[key];
                    const ic = getScopedPlayerStats(selectedPlayer, 'inter_club')[key];
                    const comb = getScopedPlayerStats(selectedPlayer, 'combined')[key];
                    return (
                      <tr key={key}>
                        <td className="py-2.5 pr-4 font-sans text-[var(--fx-text-secondary)]">{label}</td>
                        <td className="py-2.5 px-3 text-right text-[var(--fx-text-secondary)]">{ext}</td>
                        <td className="py-2.5 px-3 text-right text-[var(--fx-text-secondary)]">{ic}</td>
                        <td className="py-2.5 pl-3 text-right font-semibold text-[var(--fx-text)]">{comb}</td>
                      </tr>
                    );
                  })}
                  {isDefensiveOrKeeperPosition(selectedPlayer.position) && (
                    <tr>
                      <td className="py-2.5 pr-4 font-sans text-[var(--fx-win)]">
                        Clean Sheets (DEF/GK Only)
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--fx-win)]">
                        {selectedPlayer.extCleanSheets}
                      </td>
                      <td className="py-2.5 px-3 text-right text-[var(--fx-win)]">
                        {selectedPlayer.icCleanSheets}
                      </td>
                      <td className="py-2.5 pl-3 text-right font-semibold text-[var(--fx-win)]">
                        {selectedPlayer.extCleanSheets + selectedPlayer.icCleanSheets}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Player Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                {editingPlayer ? `Edit ${editingPlayer.name}` : 'Add Squad Player'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSavePlayer} className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Age</label>
                  <input
                    type="number"
                    min={10}
                    max={65}
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Jersey #</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(Number(e.target.value))}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Position</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as PlayerPosition)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  >
                    {PLAYER_POSITION_GROUPS.map((grp) => (
                      <optgroup key={grp.group} label={grp.title}>
                        {grp.positions.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos} — {getPositionLabel(pos)}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Kit Preset</label>
                  <select
                    value={
                      photoUrl === ASSET_IMAGES.striker ||
                      photoUrl === ASSET_IMAGES.midfielder ||
                      photoUrl === ASSET_IMAGES.keeper
                        ? photoUrl
                        : ''
                    }
                    onChange={(e) => {
                      if (!e.target.value) return;
                      setPhotoUrl(e.target.value);
                      setModalPhotoError(false);
                    }}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  >
                    <option value="">Custom Uploaded / URL Photo</option>
                    <option value={ASSET_IMAGES.striker}>Forward Studio Kit</option>
                    <option value={ASSET_IMAGES.midfielder}>Midfielder Studio Kit</option>
                    <option value={ASSET_IMAGES.keeper}>Goalkeeper Studio Kit</option>
                  </select>
                </div>
              </div>

              {/* Player Profile Picture Upload / URL */}
              <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4">
                <p className="text-xs font-semibold text-[var(--fx-text)] mb-3 flex items-center gap-2">
                  <Camera className="h-4 w-4 text-[var(--fx-accent-text)]" />
                  <span>Player Profile Picture</span>
                </p>
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] flex items-center justify-center">
                    {photoUrl && !modalPhotoError ? (
                      <img
                        src={photoUrl}
                        alt="Player profile preview"
                        referrerPolicy="no-referrer"
                        onError={() => setModalPhotoError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="font-display text-lg font-bold text-[var(--fx-accent-text)]">
                        #{jerseyNumber}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)]">
                        <Upload className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
                        <span>{uploadingPhoto ? 'Processing...' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => handleUploadPhoto(e, 'modal')}
                          className="sr-only"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoUrl(getDefaultKitForPosition(position));
                          setModalPhotoError(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border)] px-3 py-1.5 text-xs text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface)]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Default Kit</span>
                      </button>
                    </div>
                    <input
                      type="text"
                      value={photoUrl.startsWith('data:') ? '' : photoUrl}
                      onChange={(e) => {
                        setPhotoUrl(e.target.value);
                        setModalPhotoError(false);
                      }}
                      placeholder={
                        photoUrl.startsWith('data:')
                          ? 'Uploaded photo stored (paste URL here to replace)'
                          : 'Or paste profile picture URL...'
                      }
                      className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                    />
                  </div>
                </div>
              </div>

              {isManager && (
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">
                    Player Instagram ID (Manager Only — unlocks IG alerts &amp; Type 1 Discord)
                  </label>
                  <input
                    type="text"
                    value={playerIgInput}
                    onChange={(e) => setPlayerIgInput(e.target.value)}
                    placeholder="@player_instagram_id"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
              )}

              {/* External vs Inter-Club inputs */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-[var(--fx-accent-text)]">External Matches Stats</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      ['Games', extGames, setExtGames],
                      ['Goals', extGoals, setExtGoals],
                      ['Assists', extAssists, setExtAssists],
                      ['Penalties', extPenalties, setExtPenalties],
                      ['Yellow', extYellowCards, setExtYellowCards],
                      ['Red', extRedCards, setExtRedCards],
                      ['POTM', extPotm, setExtPotm],
                    ].map(([lbl, val, setter]) => (
                      <div key={String(lbl)}>
                        <label className="block text-[11px] text-[var(--fx-text-muted)]">{String(lbl)}</label>
                        <input
                          type="number"
                          min={0}
                          value={Number(val)}
                          onChange={(e) =>
                            (setter as React.Dispatch<React.SetStateAction<number>>)(
                              Number(e.target.value)
                            )
                          }
                          className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-[var(--fx-text)]"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-[11px] text-[var(--fx-text-muted)]">Avg Rating</label>
                      <input
                        type="number"
                        step="0.1"
                        min={1}
                        max={10}
                        value={extAvgRating}
                        onChange={(e) => setExtAvgRating(Number(e.target.value))}
                        className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-[var(--fx-text)]"
                      />
                    </div>
                    {isDefensiveOrKeeperPosition(position) && (
                      <div>
                        <label className="block text-[11px] text-[var(--fx-win)]">Clean Sheets</label>
                        <input
                          type="number"
                          min={0}
                          value={extCleanSheets}
                          onChange={(e) => setExtCleanSheets(Number(e.target.value))}
                          className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-[var(--fx-text)]"
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 space-y-2.5">
                  <p className="text-xs font-semibold text-[var(--fx-warn)]">Inter-Club Matches Stats</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      ['Games', icGames, setIcGames],
                      ['Goals', icGoals, setIcGoals],
                      ['Assists', icAssists, setIcAssists],
                      ['Penalties', icPenalties, setIcPenalties],
                      ['Yellow', icYellowCards, setIcYellowCards],
                      ['Red', icRedCards, setIcRedCards],
                      ['POTM', icPotm, setIcPotm],
                    ].map(([lbl, val, setter]) => (
                      <div key={String(lbl)}>
                        <label className="block text-[11px] text-[var(--fx-text-muted)]">{String(lbl)}</label>
                        <input
                          type="number"
                          min={0}
                          value={Number(val)}
                          onChange={(e) =>
                            (setter as React.Dispatch<React.SetStateAction<number>>)(
                              Number(e.target.value)
                            )
                          }
                          className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-[var(--fx-text)]"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-[11px] text-[var(--fx-text-muted)]">Avg Rating</label>
                      <input
                        type="number"
                        step="0.1"
                        min={1}
                        max={10}
                        value={icAvgRating}
                        onChange={(e) => setIcAvgRating(Number(e.target.value))}
                        className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-[var(--fx-text)]"
                      />
                    </div>
                    {isDefensiveOrKeeperPosition(position) && (
                      <div>
                        <label className="block text-[11px] text-[var(--fx-win)]">Clean Sheets</label>
                        <input
                          type="number"
                          min={0}
                          value={icCleanSheets}
                          onChange={(e) => setIcCleanSheets(Number(e.target.value))}
                          className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-[var(--fx-text)]"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 text-xs">
                <div>
                  <label className="block text-[var(--fx-text-muted)] mb-1">Career Hat-Tricks</label>
                  <input
                    type="number"
                    min={0}
                    value={hatTricks}
                    onChange={(e) => setHatTricks(Number(e.target.value))}
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--fx-text-muted)] mb-1">Best Goals / Game</label>
                  <input
                    type="number"
                    min={0}
                    value={bestSingleGameGoals}
                    onChange={(e) => setBestSingleGameGoals(Number(e.target.value))}
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-[var(--fx-text-muted)] mb-1">Best Assists / Game</label>
                  <input
                    type="number"
                    min={0}
                    value={bestSingleGameAssists}
                    onChange={(e) => setBestSingleGameAssists(Number(e.target.value))}
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1.5 text-[var(--fx-text)]"
                  />
                </div>
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
                  {saving ? 'Saving...' : 'Save Player'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Player Profile Picture Modal */}
      {photoTargetPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <div>
                <p className="text-xs text-[var(--fx-accent-text)]">
                  #{photoTargetPlayer.jerseyNumber} · {photoTargetPlayer.position}
                </p>
                <h3 className="font-display text-xl font-bold text-[var(--fx-text)]">
                  {photoTargetPlayer.name} — Profile Picture
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPhotoTargetPlayer(null)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickPhoto} className="mt-5 space-y-5">
              <div className="flex items-center gap-4">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] flex items-center justify-center">
                  {quickPhotoUrl && !quickPhotoError ? (
                    <img
                      src={quickPhotoUrl}
                      alt={`${photoTargetPlayer.name} preview`}
                      referrerPolicy="no-referrer"
                      onError={() => setQuickPhotoError(true)}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="font-display text-2xl font-bold text-[var(--fx-accent-text)]">
                      #{photoTargetPlayer.jerseyNumber}
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-2.5">
                  <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[var(--fx-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                    <span>{uploadingPhoto ? 'Processing Image...' : 'Upload Photo from Device'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => handleUploadPhoto(e, 'quick')}
                      className="sr-only"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => {
                      setQuickPhotoUrl(getDefaultKitForPosition(photoTargetPlayer.position));
                      setQuickPhotoError(false);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] px-3 py-1.5 text-xs text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Use Default Kit</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">
                  Or Paste Profile Picture URL
                </label>
                <input
                  type="text"
                  value={quickPhotoUrl.startsWith('data:') ? '' : quickPhotoUrl}
                  onChange={(e) => {
                    setQuickPhotoUrl(e.target.value);
                    setQuickPhotoError(false);
                  }}
                  placeholder={
                    quickPhotoUrl.startsWith('data:')
                      ? 'Uploaded image ready (paste a URL here to replace)'
                      : 'https://example.com/player-photo.jpg'
                  }
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs text-[var(--fx-text)] placeholder:text-[var(--fx-text-muted)]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-[var(--fx-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setPhotoTargetPlayer(null)}
                  className="rounded-lg border border-[var(--fx-border-strong)] px-4 py-2 text-xs font-semibold text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingQuickPhoto || uploadingPhoto}
                  className="rounded-lg bg-[var(--fx-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                >
                  {savingQuickPhoto ? 'Saving...' : 'Save Photo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
