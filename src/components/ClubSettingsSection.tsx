import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Image as ImageIcon,
  Instagram,
  MapPin,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Settings,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { ClubProfileConfig, Player, PlayerIgContact, WebsiteThemeId } from '../types';
import { normalizeIgHandleKey } from '../utils/clubCalculations';
import { ASSET_IMAGES, DEFAULT_CLUB_PROFILE } from '../utils/seedData';

interface ClubSettingsSectionProps {
  clubProfile: ClubProfileConfig;
  players: Player[];
  playerIgContacts: PlayerIgContact[];
  hostIgId: string;
  onNotify: (msg: string) => void;
}

const WEBSITE_THEMES: {
  id: WebsiteThemeId;
  name: string;
  mode: 'Dark' | 'Light';
  description: string;
  swatches: [string, string, string, string];
}[] = [
  {
    id: 'light_ivory',
    name: 'Daylight Ivory',
    mode: 'Light',
    description: 'Clean daylight ivory canvas with stadium turf emerald accents.',
    swatches: ['#F4F6F4', '#FFFFFF', '#047857', '#0F172A'],
  },
  {
    id: 'obsidian_orange',
    name: 'Obsidian Orange',
    mode: 'Dark',
    description: 'Deep stadium night canvas with Foxes burnt orange highlights.',
    swatches: ['#0B0F17', '#182030', '#C2410C', '#F8FAFC'],
  },
  {
    id: 'midnight_emerald',
    name: 'Midnight Pitch',
    mode: 'Dark',
    description: 'Deep stadium pine surface with crisp turf emerald accents.',
    swatches: ['#07110D', '#11231B', '#047857', '#34D399'],
  },
  {
    id: 'royal_navy',
    name: 'Royal Night',
    mode: 'Dark',
    description: 'Midnight championship navy paired with royal cobalt & sky.',
    swatches: ['#091022', '#152240', '#1D4ED8', '#60A5FA'],
  },
  {
    id: 'crimson_slate',
    name: 'Crimson Floodlight',
    mode: 'Dark',
    description: 'Deep charcoal floodlit surface with matchday crimson highlights.',
    swatches: ['#110D10', '#221A1F', '#B91C1C', '#FB7185'],
  },
];

async function compressLogoFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image.'));
      el.src = objectUrl;
    });

    const maxDim = 256;
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable in this browser.');
    ctx.drawImage(img, 0, 0, width, height);

    const qualities = [0.85, 0.72, 0.55, 0.4];
    for (const q of qualities) {
      const webp = canvas.toDataURL('image/webp', q);
      if (webp.length <= 240000) return webp;
      const jpeg = canvas.toDataURL('image/jpeg', q);
      if (jpeg.length <= 240000) return jpeg;
    }

    throw new Error('Logo image is too large after compression. Please use a smaller image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const ClubSettingsSection: React.FC<ClubSettingsSectionProps> = ({
  clubProfile,
  players,
  playerIgContacts,
  hostIgId,
  onNotify,
}) => {
  // Club Profile Form State
  const [clubName, setClubName] = useState(clubProfile.clubName);
  const [shortName, setShortName] = useState(clubProfile.shortName);
  const [foundingDate, setFoundingDate] = useState(clubProfile.foundingDate);
  const [homeGround, setHomeGround] = useState(clubProfile.homeGround);
  const [clubSlogan, setClubSlogan] = useState(
    clubProfile.clubSlogan ?? DEFAULT_CLUB_PROFILE.clubSlogan ?? ''
  );
  const [logoUrl, setLogoUrl] = useState(clubProfile.logoUrl);
  const [websiteTheme, setWebsiteTheme] = useState<WebsiteThemeId>(
    clubProfile.websiteTheme || 'obsidian_orange'
  );
  const [savingTheme, setSavingTheme] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // Add Club Player IG ID Form State
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerIg, setNewPlayerIg] = useState('');
  const [linkToPlayerId, setLinkToPlayerId] = useState('');
  const [savingNewIg, setSavingNewIg] = useState(false);
  const [editIgMap, setEditIgMap] = useState<Record<string, string>>({});

  // Host IG ID
  const [hostInput, setHostInput] = useState(hostIgId || '@foxesfc.vehari');

  useEffect(() => {
    setClubName(clubProfile.clubName);
    setShortName(clubProfile.shortName);
    setFoundingDate(clubProfile.foundingDate);
    setHomeGround(clubProfile.homeGround);
    setClubSlogan(clubProfile.clubSlogan ?? DEFAULT_CLUB_PROFILE.clubSlogan ?? '');
    setLogoUrl(clubProfile.logoUrl);
    setWebsiteTheme(clubProfile.websiteTheme || 'obsidian_orange');
    setLogoError(false);
  }, [clubProfile]);

  useEffect(() => {
    if (hostIgId) setHostInput(hostIgId);
  }, [hostIgId]);

  const standaloneContacts = useMemo(() => {
    const squadIds = new Set(players.map((p) => p.id));
    return playerIgContacts.filter((c) => !squadIds.has(c.playerId));
  }, [players, playerIgContacts]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const compressed = await compressLogoFile(file);
      setLogoUrl(compressed);
      setLogoError(false);
      onNotify('Logo ready. Click Save Club Branding to apply everywhere.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to process logo file.');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleSaveClubProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = clubName.trim();
    const cleanShort = shortName.trim().toUpperCase();
    const cleanFounding = foundingDate.trim();
    const cleanGround = homeGround.trim();
    const cleanLogo = logoUrl.trim() || ASSET_IMAGES.crest;

    if (cleanName.length < 2 || cleanShort.length < 2 || cleanFounding.length < 2 || cleanGround.length < 2) {
      onNotify('Please complete all club branding fields.');
      return;
    }

    if (cleanLogo.length > 290000) {
      onNotify('Logo exceeds size limit. Please upload a smaller image or provide a URL.');
      return;
    }

    const cleanSlogan = clubSlogan.trim().slice(0, 140);

    setSavingProfile(true);
    try {
      await setDoc(doc(db, 'clubConfig', 'profile'), {
        clubName: cleanName.slice(0, 80),
        shortName: cleanShort.slice(0, 20),
        foundingDate: cleanFounding.slice(0, 40),
        logoUrl: cleanLogo,
        homeGround: cleanGround.slice(0, 120),
        clubSlogan: cleanSlogan,
        websiteTheme,
        updatedAt: serverTimestamp(),
      });
      document.documentElement.setAttribute('data-theme', websiteTheme);
      onNotify(`Saved branding & theme for ${cleanName}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clubConfig/profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSelectWebsiteTheme = async (nextTheme: WebsiteThemeId) => {
    setWebsiteTheme(nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    const cleanName = (clubName.trim().length >= 2 ? clubName.trim() : clubProfile.clubName).slice(0, 80);
    const cleanShort = (shortName.trim().length >= 2 ? shortName.trim() : clubProfile.shortName)
      .toUpperCase()
      .slice(0, 20);
    const cleanFounding = (
      foundingDate.trim().length >= 2 ? foundingDate.trim() : clubProfile.foundingDate
    ).slice(0, 40);
    const cleanGround = (
      homeGround.trim().length >= 2 ? homeGround.trim() : clubProfile.homeGround
    ).slice(0, 120);
    const cleanLogo = logoUrl.trim() || clubProfile.logoUrl || ASSET_IMAGES.crest;
    const cleanSlogan = clubSlogan.trim().slice(0, 140);

    setSavingTheme(true);
    try {
      await setDoc(doc(db, 'clubConfig', 'profile'), {
        clubName: cleanName,
        shortName: cleanShort,
        foundingDate: cleanFounding,
        logoUrl: cleanLogo,
        homeGround: cleanGround,
        clubSlogan: cleanSlogan,
        websiteTheme: nextTheme,
        updatedAt: serverTimestamp(),
      });
      const label = WEBSITE_THEMES.find((t) => t.id === nextTheme)?.name || nextTheme;
      onNotify(`Website theme changed to ${label}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'clubConfig/profile');
    } finally {
      setSavingTheme(false);
    }
  };

  const handleSaveHostIg = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanHost = hostInput.trim();
    if (cleanHost.length < 2) return;
    const handleKey = normalizeIgHandleKey(cleanHost);
    try {
      await setDoc(doc(db, 'managerIgConfig', 'host'), {
        hostInstagramId: cleanHost.slice(0, 80),
        updatedAt: serverTimestamp(),
      });
      if (handleKey) {
        await setDoc(doc(db, 'igVerifiedHandles', handleKey), {
          handleKey,
          playerName: 'Fox (Manager)',
          active: true,
          updatedAt: serverTimestamp(),
        });
      }
      onNotify(`Saved Fox host Instagram ID (${cleanHost}).`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'managerIgConfig/host');
    }
  };

  const saveContactAndHandle = async (
    targetId: string,
    targetName: string,
    igInput: string,
    previousHandle?: string
  ) => {
    const cleanIg = igInput.trim();
    if (cleanIg.length < 2) {
      onNotify('Instagram ID must be at least 2 characters.');
      return;
    }
    const newKey = normalizeIgHandleKey(cleanIg);
    if (!newKey) {
      onNotify('Instagram ID must contain letters or numbers.');
      return;
    }
    const oldKey = previousHandle ? normalizeIgHandleKey(previousHandle) : '';

    await setDoc(doc(db, 'playerIgDirectory', targetId), {
      playerId: targetId,
      playerName: targetName.trim().slice(0, 80),
      instagramId: cleanIg.slice(0, 80),
      updatedAt: serverTimestamp(),
    });

    await setDoc(doc(db, 'igVerifiedHandles', newKey), {
      handleKey: newKey,
      playerName: targetName.trim().slice(0, 80),
      active: true,
      updatedAt: serverTimestamp(),
    });

    if (oldKey && oldKey !== newKey) {
      await deleteDoc(doc(db, 'igVerifiedHandles', oldKey));
    }
  };

  const handleAddClubPlayerIg = async (e: React.FormEvent) => {
    e.preventDefault();
    const linkedPlayer = players.find((p) => p.id === linkToPlayerId);
    const resolvedName = linkedPlayer ? linkedPlayer.name : newPlayerName.trim();
    const cleanIg = newPlayerIg.trim();

    if (!resolvedName || cleanIg.length < 2) {
      onNotify('Enter both player name and Instagram ID.');
      return;
    }

    setSavingNewIg(true);
    try {
      const targetId = linkedPlayer
        ? linkedPlayer.id
        : `ig_plr_${resolvedName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'member'}_${Date.now()}`;
      const existing = playerIgContacts.find((c) => c.playerId === targetId);
      await saveContactAndHandle(targetId, resolvedName, cleanIg, existing?.instagramId);

      setNewPlayerName('');
      setNewPlayerIg('');
      setLinkToPlayerId('');
      onNotify(`Added Instagram ID ${cleanIg} for ${resolvedName}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'playerIgDirectory');
    } finally {
      setSavingNewIg(false);
    }
  };

  const handleSaveRowIg = async (id: string, playerName: string, fallbackIg: string) => {
    const val = (editIgMap[id] ?? fallbackIg).trim();
    if (!val) return;
    try {
      await saveContactAndHandle(id, playerName, val, fallbackIg);
      onNotify(`Updated Instagram ID for ${playerName} to ${val}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `playerIgDirectory/${id}`);
    }
  };

  const handleRemoveIgContact = async (contact: PlayerIgContact) => {
    try {
      await deleteDoc(doc(db, 'playerIgDirectory', contact.playerId));
      const handleKey = normalizeIgHandleKey(contact.instagramId);
      if (handleKey) {
        await deleteDoc(doc(db, 'igVerifiedHandles', handleKey));
      }
      onNotify(`Removed Instagram ID for ${contact.playerName}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `playerIgDirectory/${contact.playerId}`);
    }
  };

  const initials = (shortName || clubName || 'FC')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase() || 'FC';

  return (
    <section id="club-settings" className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-[var(--fx-accent-text)]">
            Manager Identity, Website Theme &amp; Member Directory Controls
          </p>
          <h2 className="font-display text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
            Club Settings &amp; Player Instagram IDs
          </h2>
          <p className="text-sm text-[var(--fx-text-muted)] max-w-3xl">
            Customize the website color theme, update the club&apos;s official name, short name, founding date, home ground, and crest logo across the entire site, and manage saved Instagram IDs for club players.
          </p>
        </div>

        {/* Website Theme Selector Panel */}
        <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--fx-border)] pb-4">
            <div className="flex items-center gap-2.5">
              <Palette className="h-5 w-5 text-[var(--fx-accent-text)]" />
              <div>
                <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                  Website Theme
                </h3>
                <p className="text-xs text-[var(--fx-text-muted)]">
                  Choose the club&apos;s visual theme applied across all pages for every visitor.
                </p>
              </div>
            </div>

            {websiteTheme !== 'obsidian_orange' && (
              <button
                type="button"
                disabled={savingTheme}
                onClick={() => handleSelectWebsiteTheme('obsidian_orange')}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)] disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset Default</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {WEBSITE_THEMES.map((theme) => {
              const isActive = websiteTheme === theme.id;
              return (
                <button
                  key={theme.id}
                  type="button"
                  disabled={savingTheme}
                  onClick={() => handleSelectWebsiteTheme(theme.id)}
                  className={`text-left rounded-xl border p-4 transition-colors flex flex-col justify-between gap-3 ${
                    isActive
                      ? 'border-[var(--fx-accent)] bg-[var(--fx-accent-soft)]'
                      : 'border-[var(--fx-border)] bg-[var(--fx-bg-alt)] hover:border-[var(--fx-border-strong)]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-[var(--fx-text)]">
                        {theme.name}
                      </span>
                      {isActive && <Check className="h-4 w-4 shrink-0 text-[var(--fx-accent-text)]" />}
                    </div>
                    <p className="text-[11px] text-[var(--fx-text-muted)] leading-snug">
                      {theme.mode} · {theme.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 pt-1">
                    {theme.swatches.map((hex, i) => (
                      <span
                        key={`${theme.id}_${i}`}
                        className="h-4 w-4 rounded-sm border border-white/20"
                        style={{ backgroundColor: hex }}
                        aria-hidden="true"
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Club Identity & Branding Form */}
          <div className="lg:col-span-6 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <div className="flex items-center gap-2.5">
                <Settings className="h-5 w-5 text-[var(--fx-accent-text)]" />
                <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                  Club Name, Slogan, Crest &amp; Ground
                </h3>
              </div>
            </div>

            <form onSubmit={handleSaveClubProfile} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Club Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={clubName}
                    onChange={(e) => setClubName(e.target.value)}
                    placeholder="Foxes FC.vehari"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Short Name
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={20}
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    placeholder="FOXES"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] uppercase focus:border-[var(--fx-accent)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Founding Date (e.g. EST 2026)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={40}
                    value={foundingDate}
                    onChange={(e) => setFoundingDate(e.target.value)}
                    placeholder="EST 2026"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)] mb-1">
                    Home Ground
                  </label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--fx-text-muted)]" />
                    <input
                      type="text"
                      required
                      minLength={2}
                      maxLength={120}
                      value={homeGround}
                      onChange={(e) => setHomeGround(e.target.value)}
                      placeholder="Vehari District Floodlit Turf"
                      className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] pl-9 pr-3 py-2 text-sm text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-[var(--fx-text-secondary)]">
                    Club Slogan (Matchday Schedule Background)
                  </label>
                  <span className="text-[11px] font-mono-num text-[var(--fx-text-muted)]">
                    {clubSlogan.length}/140
                  </span>
                </div>
                <input
                  type="text"
                  maxLength={140}
                  value={clubSlogan}
                  onChange={(e) => setClubSlogan(e.target.value)}
                  placeholder="Pride of Vehari · Play With Heart, Win With Honor"
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)] focus:border-[var(--fx-accent)] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-[var(--fx-text-muted)]">
                  Displayed on the Matchday Schedule stadium backdrop in the hero banner. Leave blank to hide.
                </p>
              </div>

              {/* Club Logo Upload & URL */}
              <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 space-y-3">
                <p className="text-xs font-semibold text-[var(--fx-text)] flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[var(--fx-accent-text)]" />
                  <span>Club Logo / Crest</span>
                </p>

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] flex items-center justify-center">
                    {logoUrl && !logoError ? (
                      <img
                        src={logoUrl}
                        alt={`${clubName} crest preview`}
                        referrerPolicy="no-referrer"
                        onError={() => setLogoError(true)}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-[var(--fx-accent-text)]">
                        <Shield className="h-6 w-6" />
                        <span className="text-[11px] font-bold mt-0.5">{initials}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-2 text-xs font-medium text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)]">
                        <Upload className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
                        <span>{uploadingLogo ? 'Processing...' : 'Upload New Logo'}</span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={handleLogoUpload}
                          className="sr-only"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => {
                          setLogoUrl(DEFAULT_CLUB_PROFILE.logoUrl);
                          setLogoError(false);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border)] px-3 py-2 text-xs text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface)]"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>Reset Crest</span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">
                        Or Paste Logo Image URL
                      </label>
                      <input
                        type="text"
                        value={logoUrl.startsWith('data:') ? '' : logoUrl}
                        onChange={(e) => {
                          setLogoUrl(e.target.value);
                          setLogoError(false);
                        }}
                        placeholder={
                          logoUrl.startsWith('data:')
                            ? 'Uploaded image stored (type URL here to replace)'
                            : '/src/assets/images/foxes_crest_1794850648700.jpg'
                        }
                        className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--fx-accent)] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{savingProfile ? 'Saving...' : 'Save Club Branding'}</span>
                </button>
              </div>
            </form>
          </div>

          {/* Right: Add & Manage Club Players Instagram IDs */}
          <div className="lg:col-span-6 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <div className="flex items-center gap-2.5">
                <Instagram className="h-5 w-5 text-[var(--fx-accent-text)]" />
                <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                  Club Players Instagram IDs
                </h3>
              </div>
              <span className="text-xs font-mono-num text-[var(--fx-text-muted)]">
                {playerIgContacts.length} Saved
              </span>
            </div>

            {/* Host ID Quick Save */}
            <form onSubmit={handleSaveHostIg} className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 space-y-2">
              <label className="block text-xs font-semibold text-[var(--fx-text-secondary)]">
                Manager Host Instagram ID (Fox)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={hostInput}
                  onChange={(e) => setHostInput(e.target.value)}
                  placeholder="@foxesfc.vehari"
                  className="flex-1 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-1.5 text-xs text-[var(--fx-text)]"
                />
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)] whitespace-nowrap"
                >
                  Save Host
                </button>
              </div>
            </form>

            {/* Add New Club Player IG ID */}
            <form
              onSubmit={handleAddClubPlayerIg}
              className="rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-4 space-y-3"
            >
              <p className="text-xs font-semibold text-[var(--fx-accent-fg)]">
                Add Club Player Instagram ID (Unlocks Match Alerts &amp; Type 1 Club Discord)
              </p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">
                    Select Squad Player (Optional)
                  </label>
                  <select
                    value={linkToPlayerId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setLinkToPlayerId(pid);
                      const found = players.find((p) => p.id === pid);
                      if (found) setNewPlayerName(found.name);
                    }}
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)]"
                  >
                    <option value="">-- New Club Player / Member --</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>
                        #{p.jerseyNumber} {p.name} ({p.position})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[var(--fx-text-muted)] mb-1">
                    Player Name
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(linkToPlayerId)}
                    value={newPlayerName}
                    onChange={(e) => setNewPlayerName(e.target.value)}
                    placeholder="e.g. Ali Haider"
                    className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-xs text-[var(--fx-text)] disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  required
                  value={newPlayerIg}
                  onChange={(e) => setNewPlayerIg(e.target.value)}
                  placeholder="@player_instagram_id"
                  className="flex-1 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs text-[var(--fx-text)]"
                />
                <button
                  type="submit"
                  disabled={savingNewIg}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{savingNewIg ? 'Adding...' : 'Add IG ID'}</span>
                </button>
              </div>
            </form>

            {/* Saved Squad & Additional Club IG Directory */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--fx-text-secondary)]">
                Squad &amp; Added Club Player Instagram Directory
              </p>

              <div className="max-h-[340px] overflow-y-auto divide-y divide-[var(--fx-border)] rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] px-3">
                {players.map((player) => {
                  const saved = playerIgContacts.find((c) => c.playerId === player.id);
                  const currentVal = editIgMap[player.id] ?? saved?.instagramId ?? '';
                  return (
                    <div
                      key={player.id}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--fx-text)] truncate">{player.name}</p>
                        <p className="text-[11px] text-[var(--fx-text-muted)]">
                          #{player.jerseyNumber} · {player.position}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) =>
                            setEditIgMap((prev) => ({ ...prev, [player.id]: e.target.value }))
                          }
                          placeholder="@instagram_id"
                          className="w-40 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-xs text-[var(--fx-text)]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveRowIg(player.id, player.name, saved?.instagramId || '')
                          }
                          className="inline-flex items-center gap-1 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-2.5 py-1 text-[11px] text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                        >
                          <Check className="h-3 w-3 text-[var(--fx-win)]" />
                          <span>Save</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {standaloneContacts.map((contact) => {
                  const currentVal = editIgMap[contact.playerId] ?? contact.instagramId;
                  return (
                    <div
                      key={contact.playerId}
                      className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[var(--fx-text)] truncate">
                          {contact.playerName}
                        </p>
                        <p className="text-[11px] text-[var(--fx-accent-text)]">Club Member IG Entry</p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) =>
                            setEditIgMap((prev) => ({
                              ...prev,
                              [contact.playerId]: e.target.value,
                            }))
                          }
                          className="w-36 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-1 text-xs text-[var(--fx-text)]"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            handleSaveRowIg(
                              contact.playerId,
                              contact.playerName,
                              contact.instagramId
                            )
                          }
                          className="rounded border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-2 py-1 text-[11px] text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveIgContact(contact)}
                          aria-label={`Remove ${contact.playerName}`}
                          className="rounded border border-[var(--fx-loss-border)] p-1 text-[var(--fx-loss)] hover:bg-[var(--fx-loss-soft)]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {players.length === 0 && standaloneContacts.length === 0 && (
                  <p className="py-6 text-center text-xs text-[var(--fx-text-muted)]">
                    No club player Instagram IDs saved yet. Add one above.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
