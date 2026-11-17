import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Hash,
  Image as ImageIcon,
  Instagram,
  Lock,
  MessageSquare,
  Newspaper,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  ClubProfileConfig,
  DiscordChannel,
  DiscordMessage,
  EditorGrant,
  IgAlertLog,
  MatchRecord,
  NewsPost,
  Player,
  PlayerIgContact,
  UserRole,
} from '../types';
import {
  buildExternalInstagramAlert,
  buildInterClubInstagramAlert,
  normalizeIgHandleKey,
} from '../utils/clubCalculations';

export type CommunityTab = 'news' | 'discord' | 'ig_desk' | 'access';

async function compressNewsPhotoFile(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not decode selected image file.'));
      el.src = objectUrl;
    });

    const maxWidth = 960;
    const scale = Math.min(1, maxWidth / Math.max(img.width, 1));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is unavailable in this browser.');
    ctx.drawImage(img, 0, 0, width, height);

    for (const q of [0.82, 0.68, 0.54, 0.4]) {
      const webp = canvas.toDataURL('image/webp', q);
      if (webp.length <= 220000) return webp;
      const jpeg = canvas.toDataURL('image/jpeg', q);
      if (jpeg.length <= 220000) return jpeg;
    }

    throw new Error('Selected photo is too large after compression. Please pick a smaller image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

interface CommunitySectionProps {
  clubProfile: ClubProfileConfig;
  news: NewsPost[];
  discordMessages: DiscordMessage[];
  matches: MatchRecord[];
  players: Player[];
  editors: EditorGrant[];
  hostIgId: string;
  playerIgContacts: PlayerIgContact[];
  igAlertLogs: IgAlertLog[];
  user: User | null;
  role: UserRole;
  verifiedIgHandle: string;
  onUpdateVerifiedIgHandle: (handleKey: string) => void;
  onSignIn: () => void;
  onNotify: (msg: string) => void;
  fixedTab?: CommunityTab;
}

export const CommunitySection: React.FC<CommunitySectionProps> = ({
  clubProfile,
  news,
  discordMessages,
  matches,
  players,
  editors,
  hostIgId,
  playerIgContacts,
  igAlertLogs,
  user,
  role,
  verifiedIgHandle,
  onUpdateVerifiedIgHandle,
  onSignIn,
  onNotify,
  fixedTab,
}) => {
  const canEdit = role === 'manager' || role === 'editor';
  const isManager = role === 'manager';

  const [internalTab, setInternalTab] = useState<CommunityTab>(fixedTab || 'news');
  const activeTab = fixedTab ?? internalTab;
  const setActiveTab = setInternalTab;

  // News state
  const [newsModalOpen, setNewsModalOpen] = useState(false);
  const [editingNewsPost, setEditingNewsPost] = useState<NewsPost | null>(null);
  const [newsTitle, setNewsTitle] = useState('');
  const [newsCategory, setNewsCategory] = useState<NewsPost['category']>('Club Announcement');
  const [newsBody, setNewsBody] = useState('');
  const [newsPhotoUrl, setNewsPhotoUrl] = useState('');
  const [uploadingNewsPhoto, setUploadingNewsPhoto] = useState(false);
  const [newsPhotoError, setNewsPhotoError] = useState(false);
  const [brokenNewsPhotos, setBrokenNewsPhotos] = useState<Record<string, boolean>>({});
  const [savingNews, setSavingNews] = useState(false);

  // Two-Type Discord state
  const [discordChannel, setDiscordChannel] = useState<DiscordChannel>('open-fan-chat');
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [igVerifyInput, setIgVerifyInput] = useState('');
  const [verifyingIg, setVerifyingIg] = useState(false);

  // Manager IG Desk state
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [hostInput, setHostInput] = useState(hostIgId || '@foxesfc.vehari');
  const [igApiConfigured, setIgApiConfigured] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);
  const [bulkResults, setBulkResults] = useState<
    { playerName: string; instagramId: string; sent: boolean; detail: string }[]
  >([]);

  useEffect(() => {
    if (hostIgId) setHostInput(hostIgId);
  }, [hostIgId]);

  useEffect(() => {
    if (!isManager) return;
    fetch('/api/instagram/status')
      .then((r) => r.json())
      .then((d: { configured?: boolean }) => {
        setIgApiConfigured(Boolean(d.configured));
      })
      .catch(() => {
        setIgApiConfigured(false);
      });
  }, [isManager]);

  const [igTypeOverride, setIgTypeOverride] = useState<'external' | 'inter_club'>('inter_club');
  const [igOpponent, setIgOpponent] = useState('');
  const [igSubA, setIgSubA] = useState('ORANGE');
  const [igSubB, setIgSubB] = useState('OBSIDIAN');
  const [igDate, setIgDate] = useState('20-11-26');
  const [igTime, setIgTime] = useState('7:30 PM');
  const [igVenue, setIgVenue] = useState('Majeed town');
  const [igHandleInputs, setIgHandleInputs] = useState<Record<string, string>>({});
  const [newIgPlayerName, setNewIgPlayerName] = useState('');
  const [newIgPlayerHandle, setNewIgPlayerHandle] = useState('');
  const [crestImgError, setCrestImgError] = useState(false);

  useEffect(() => {
    setCrestImgError(false);
  }, [clubProfile.logoUrl]);

  // Manager Access Control state
  const [editorEmail, setEditorEmail] = useState('');
  const [editorName, setEditorName] = useState('');

  const upcomingMatches = useMemo(
    () => matches.filter((m) => m.status === 'scheduled').sort((a, b) => a.dateIso.localeCompare(b.dateIso)),
    [matches]
  );

  const channelMessages = useMemo(
    () => discordMessages.filter((m) => m.channel === discordChannel),
    [discordMessages, discordChannel]
  );

  const canChatInMembersChannel = isManager || Boolean(verifiedIgHandle);

  const activeAlertText = useMemo(() => {
    if (igTypeOverride === 'inter_club') {
      return buildInterClubInstagramAlert({
        subTeamA: igSubA,
        subTeamB: igSubB,
        dateDisplay: igDate,
        timeDisplay: igTime,
        venue: igVenue,
      });
    }
    return buildExternalInstagramAlert({
      opponentName: igOpponent,
      dateDisplay: igDate,
      timeDisplay: igTime,
      venue: igVenue,
    });
  }, [igTypeOverride, igOpponent, igSubA, igSubB, igDate, igTime, igVenue]);

  const handleLoadMatchIntoIg = (matchId: string) => {
    setSelectedMatchId(matchId);
    const m = matches.find((item) => item.id === matchId);
    if (!m) return;
    setIgTypeOverride(m.matchType);
    setIgOpponent(m.opponentName || '');
    setIgSubA(m.subTeamA || 'ORANGE');
    setIgSubB(m.subTeamB || 'OBSIDIAN');
    setIgDate(m.dateDisplay);
    setIgTime(m.timeDisplay);
    setIgVenue(m.venue);
  };

  // News CRUD & Photo Upload
  const openCreateNewsModal = () => {
    setEditingNewsPost(null);
    setNewsTitle('');
    setNewsCategory('Club Announcement');
    setNewsBody('');
    setNewsPhotoUrl('');
    setNewsPhotoError(false);
    setNewsModalOpen(true);
  };

  const openEditNewsModal = (post: NewsPost) => {
    setEditingNewsPost(post);
    setNewsTitle(post.title);
    setNewsCategory(post.category);
    setNewsBody(post.body);
    setNewsPhotoUrl(post.photoUrl || '');
    setNewsPhotoError(false);
    setNewsModalOpen(true);
  };

  const handleNewsPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingNewsPhoto(true);
    try {
      const compressed = await compressNewsPhotoFile(file);
      setNewsPhotoUrl(compressed);
      setNewsPhotoError(false);
      onNotify('News photo ready. Save or publish to attach it to the article.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to process news photo.');
    } finally {
      setUploadingNewsPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !user) return;
    const cleanTitle = newsTitle.trim().slice(0, 140);
    const cleanBody = newsBody.trim().slice(0, 4000);
    const cleanPhoto = newsPhotoUrl.trim();
    if (cleanTitle.length < 2) {
      onNotify('Headline must be at least 2 characters.');
      return;
    }
    if (cleanBody.length < 5) {
      onNotify('Article body must be at least 5 characters.');
      return;
    }
    if (cleanPhoto.length > 245000) {
      onNotify('News photo exceeds maximum size. Please upload a smaller photo or paste an image URL.');
      return;
    }

    setSavingNews(true);
    const todayIso = new Date().toISOString().slice(0, 10);

    try {
      if (editingNewsPost) {
        await updateDoc(doc(db, 'news', editingNewsPost.id), {
          title: cleanTitle,
          category: newsCategory,
          body: cleanBody,
          photoUrl: cleanPhoto,
          publishedDate: editingNewsPost.publishedDate || todayIso,
          updatedAt: serverTimestamp(),
        });
        setBrokenNewsPhotos((prev) => ({ ...prev, [editingNewsPost.id]: false }));
        onNotify('News report updated.');
      } else {
        const newId = `news_${Date.now()}`;
        await setDoc(doc(db, 'news', newId), {
          title: cleanTitle,
          category: newsCategory,
          body: cleanBody,
          photoUrl: cleanPhoto,
          authorName: isManager ? 'Fox (Club Manager)' : user.displayName || 'Authorized Editor',
          authorUid: user.uid,
          publishedDate: todayIso,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        onNotify('News report published.');
      }
      setNewsModalOpen(false);
      setEditingNewsPost(null);
      setNewsTitle('');
      setNewsBody('');
      setNewsPhotoUrl('');
    } catch (error) {
      handleFirestoreError(
        error,
        editingNewsPost ? OperationType.UPDATE : OperationType.CREATE,
        editingNewsPost ? `news/${editingNewsPost.id}` : 'news'
      );
    } finally {
      setSavingNews(false);
    }
  };

  const handleDeleteNews = async (newsId: string) => {
    if (!canEdit) return;
    try {
      await deleteDoc(doc(db, 'news', newsId));
      onNotify('News post removed.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `news/${newsId}`);
    }
  };

  // Verify Saved Instagram ID for Type 1 Club Members Discord
  const handleVerifyIgMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !igVerifyInput.trim()) return;
    setVerifyingIg(true);
    const handleKey = normalizeIgHandleKey(igVerifyInput);

    try {
      const handleSnap = await getDoc(doc(db, 'igVerifiedHandles', handleKey));
      if (!handleSnap.exists() || !handleSnap.data().active) {
        onNotify(
          'That Instagram ID is not saved in the club roster yet. Ask Manager Fox to add your Instagram ID.'
        );
        return;
      }

      const userRef = doc(db, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        await updateDoc(userRef, {
          verifiedIgHandle: handleKey,
        });
      } else if (user.email) {
        await setDoc(userRef, {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName || user.email.split('@')[0],
          verifiedIgHandle: handleKey,
          createdAt: serverTimestamp(),
        });
      } else {
        onNotify('Your account must have a verified email to link a club Instagram ID.');
        return;
      }
      onUpdateVerifiedIgHandle(handleKey);
      setIgVerifyInput('');
      onNotify(`Instagram ID @${handleKey} verified! You can now chat in Club Members Discord.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    } finally {
      setVerifyingIg(false);
    }
  };

  // Discord Send Message
  const handleSendDiscordMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !chatInput.trim()) return;
    if (discordChannel === 'club-members' && !canChatInMembersChannel) {
      onNotify('Verify your saved club Instagram ID first to post in Club Members Discord.');
      return;
    }

    setSendingChat(true);
    const msgId = `msg_${Date.now()}_${user.uid.slice(0, 6)}`;
    const authorRole: 'manager' | 'editor' | 'member' | 'fan' =
      role === 'manager'
        ? 'manager'
        : role === 'editor'
        ? 'editor'
        : verifiedIgHandle
        ? 'member'
        : 'fan';

    const effectiveIgHandle =
      discordChannel === 'club-members'
        ? verifiedIgHandle || (isManager ? normalizeIgHandleKey(hostIgId) : '')
        : verifiedIgHandle || '';

    try {
      await setDoc(doc(db, 'discordMessages', msgId), {
        channel: discordChannel,
        text: chatInput.trim(),
        authorUid: user.uid,
        authorName: user.displayName || user.email?.split('@')[0] || 'Foxes Member',
        authorRole,
        verifiedIgHandle: effectiveIgHandle,
        createdAt: serverTimestamp(),
      });
      setChatInput('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'discordMessages');
    } finally {
      setSendingChat(false);
    }
  };

  const handleDeleteDiscordMsg = async (msgId: string) => {
    try {
      await deleteDoc(doc(db, 'discordMessages', msgId));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `discordMessages/${msgId}`);
    }
  };

  // Manager IG Desk actions
  const handleSaveHostIg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    const cleanHost = hostInput.trim();
    const handleKey = normalizeIgHandleKey(cleanHost);
    try {
      await setDoc(doc(db, 'managerIgConfig', 'host'), {
        hostInstagramId: cleanHost,
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
      onNotify(`Updated Fox host Instagram ID to ${cleanHost}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'managerIgConfig/host');
    }
  };

  const handleSavePlayerIgById = async (
    targetId: string,
    targetName: string,
    rawHandle: string,
    previousHandle?: string
  ) => {
    if (!isManager) return;
    const val = rawHandle.trim();
    if (val.length < 2) return;
    const newKey = normalizeIgHandleKey(val);
    if (!newKey) return;
    const oldKey = previousHandle ? normalizeIgHandleKey(previousHandle) : '';

    try {
      await setDoc(doc(db, 'playerIgDirectory', targetId), {
        playerId: targetId,
        playerName: targetName.trim().slice(0, 80),
        instagramId: val.slice(0, 80),
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
      onNotify(`Saved ${val} for ${targetName} (enabled for IG alerts & Club Members Discord).`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `playerIgDirectory/${targetId}`);
    }
  };

  const handleAddStandaloneIgPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager) return;
    const cleanName = newIgPlayerName.trim();
    const cleanIg = newIgPlayerHandle.trim();
    if (!cleanName || cleanIg.length < 2) return;
    const slug = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'member';
    const newId = `ig_plr_${slug}_${Date.now()}`;
    await handleSavePlayerIgById(newId, cleanName, cleanIg);
    setNewIgPlayerName('');
    setNewIgPlayerHandle('');
  };

  const handleCopyAlert = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotify('Exact match alert copied to clipboard.');
    } catch {
      onNotify('Select and copy the message from the preview box.');
    }
  };

  const standaloneIgContacts = useMemo(() => {
    const squadIds = new Set(players.map((p) => p.id));
    return playerIgContacts.filter((c) => !squadIds.has(c.playerId));
  }, [players, playerIgContacts]);

  const handleSendToAllPlayers = async () => {
    if (!isManager) return;
    const squadRecipients = players
      .map((p) => {
        const saved = playerIgContacts.find((c) => c.playerId === p.id);
        const igId = (igHandleInputs[p.id] ?? saved?.instagramId ?? '').trim();
        return { playerId: p.id, playerName: p.name, instagramId: igId };
      })
      .filter((r) => r.instagramId.length > 1);

    const extraRecipients = standaloneIgContacts
      .map((c) => ({
        playerId: c.playerId,
        playerName: c.playerName,
        instagramId: (igHandleInputs[c.playerId] ?? c.instagramId).trim(),
      }))
      .filter((r) => r.instagramId.length > 1);

    const recipients = [...squadRecipients, ...extraRecipients];

    if (recipients.length === 0) {
      onNotify('Save at least one player Instagram ID first.');
      return;
    }

    setBulkSending(true);
    setBulkResults([]);
    try {
      const resp = await fetch('/api/instagram/send-match-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostIgId: hostInput.trim() || hostIgId,
          messageText: activeAlertText,
          recipients,
        }),
      });
      const data = (await resp.json()) as {
        configured: boolean;
        reason?: string;
        results?: { playerId: string; playerName: string; instagramId: string; sent: boolean; detail: string }[];
      };

      if (!data.configured) {
        try {
          await navigator.clipboard.writeText(activeAlertText);
        } catch {
          // ignore clipboard denial
        }
        onNotify(
          'Alert copied! Server Meta IG API credentials are not configured, so use the Send DM buttons on each player to send from Fox Instagram.'
        );
        return;
      }

      const results = data.results || [];
      setBulkResults(results);
      const matchLabel =
        igTypeOverride === 'inter_club'
          ? `Foxes ${igSubA} vs Foxes ${igSubB}`
          : `Foxes FC vs ${igOpponent || 'Opponent'}`;

      for (const r of results) {
        if (r.sent) {
          const logId = `iglog_${r.playerId}_${Date.now()}`;
          await setDoc(doc(db, 'igAlertLogs', logId), {
            matchId: selectedMatchId || 'custom',
            matchLabel,
            playerId: r.playerId,
            playerName: r.playerName,
            recipientIgId: r.instagramId,
            hostIgId: hostInput.trim() || hostIgId,
            messageText: activeAlertText,
            sentAt: serverTimestamp(),
          });
        }
      }

      const sentCount = results.filter((r) => r.sent).length;
      onNotify(`Meta API processed ${results.length} players (${sentCount} delivered).`);
    } catch {
      onNotify('Could not reach Instagram dispatch endpoint.');
    } finally {
      setBulkSending(false);
    }
  };

  const handleRecordIgDispatch = async (
    targetId: string,
    targetName: string,
    recipientIgId: string
  ) => {
    if (!isManager) return;
    try {
      await navigator.clipboard.writeText(activeAlertText);
    } catch {
      // Clipboard optional in non-focused states
    }

    const logId = `iglog_${targetId}_${Date.now()}`;
    const matchLabel =
      igTypeOverride === 'inter_club'
        ? `Foxes ${igSubA} vs Foxes ${igSubB}`
        : `Foxes FC vs ${igOpponent || 'Opponent'}`;

    try {
      await setDoc(doc(db, 'igAlertLogs', logId), {
        matchId: selectedMatchId || 'custom',
        matchLabel,
        playerId: targetId,
        playerName: targetName,
        recipientIgId,
        hostIgId: hostInput.trim() || hostIgId,
        messageText: activeAlertText,
        sentAt: serverTimestamp(),
      });
      onNotify(`Alert copied & logged DM for ${targetName} (${recipientIgId}).`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `igAlertLogs/${logId}`);
    }
  };

  // Manager Access Control
  const handleAddEditor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isManager || !user) return;
    const normalizedEmail = editorEmail.trim().toLowerCase();
    if (!normalizedEmail) return;
    try {
      await setDoc(doc(db, 'editors', normalizedEmail), {
        email: normalizedEmail,
        displayName: editorName.trim() || normalizedEmail.split('@')[0],
        grantedByUid: user.uid,
        createdAt: serverTimestamp(),
      });
      onNotify(`Granted editor permission to ${normalizedEmail}.`);
      setEditorEmail('');
      setEditorName('');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `editors/${normalizedEmail}`);
    }
  };

  const handleRevokeEditor = async (emailId: string) => {
    if (!isManager) return;
    try {
      await deleteDoc(doc(db, 'editors', emailId));
      onNotify(`Revoked editor access for ${emailId}.`);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `editors/${emailId}`);
    }
  };

  const formatMsgTimestamp = (ts: unknown) => {
    if (
      ts &&
      typeof ts === 'object' &&
      'toDate' in ts &&
      typeof (ts as { toDate: () => Date }).toDate === 'function'
    ) {
      const date = (ts as { toDate: () => Date }).toDate();
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return 'Just now';
  };

  const sectionHeading =
    activeTab === 'news'
      ? { kicker: 'Official Club Press & Reports', title: 'Club News & Announcements' }
      : activeTab === 'discord'
      ? {
          kicker: 'Two-Channel Club Discord · IG-Verified Members & Open Fan Chat',
          title: `${clubProfile.clubName} Discord`,
        }
      : activeTab === 'ig_desk'
      ? { kicker: 'Manager Direct Dispatch', title: 'Fox Instagram Match Alerts' }
      : { kicker: 'Manager Role Delegation', title: 'Editor Permissions' };

  return (
    <section id="community" className="py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--fx-accent-text)]">{sectionHeading.kicker}</p>
            <h2 className="font-display mt-1 text-3xl font-bold tracking-tight text-[var(--fx-text)] sm:text-4xl">
              {sectionHeading.title}
            </h2>
          </div>

          {!fixedTab && (
            <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[var(--fx-border)] bg-[var(--fx-surface)] p-1 w-fit">
              <button
                type="button"
                onClick={() => setActiveTab('news')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'news'
                    ? 'bg-[var(--fx-accent)] text-white'
                    : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                }`}
              >
                <Newspaper className="h-3.5 w-3.5" />
                <span>News</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('discord')}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'discord'
                    ? 'bg-[#5865F2] text-white'
                    : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5" />
                <span>Discord</span>
              </button>
              {isManager && (
                <>
                  <button
                    type="button"
                    onClick={() => setActiveTab('ig_desk')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'ig_desk'
                        ? 'bg-[var(--fx-accent)] text-white'
                        : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                    }`}
                  >
                    <Instagram className="h-3.5 w-3.5" />
                    <span>Fox IG Alerts</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('access')}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      activeTab === 'access'
                        ? 'bg-[var(--fx-accent)] text-white'
                        : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]'
                    }`}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>Permissions</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* TAB 1: NEWS */}
        {activeTab === 'news' && (
          <div className="mt-8 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-[var(--fx-text-muted)]">
                Official match reports and announcements published by the Manager and authorized editors.
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={openCreateNewsModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Publish News</span>
                </button>
              )}
            </div>

            {news.length === 0 ? (
              <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-10 text-center">
                <Newspaper className="mx-auto h-8 w-8 text-[var(--fx-text-muted)]" />
                <p className="mt-3 text-sm font-medium text-[var(--fx-text)]">No news reports published yet</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {news.map((post) => (
                  <article
                    key={post.id}
                    className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] overflow-hidden flex flex-col justify-between"
                  >
                    {post.photoUrl && !brokenNewsPhotos[post.id] && (
                      <div className="h-52 w-full overflow-hidden border-b border-[var(--fx-border)] bg-[var(--fx-bg-alt)]">
                        <img
                          src={post.photoUrl}
                          alt={post.title}
                          referrerPolicy="no-referrer"
                          onError={() =>
                            setBrokenNewsPhotos((prev) => ({ ...prev, [post.id]: true }))
                          }
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="p-6 flex-1 flex flex-col justify-between gap-4">
                      <div>
                        <p className="text-xs font-medium text-[var(--fx-accent-text)]">
                          {post.category} · {post.publishedDate} · {post.authorName}
                        </p>
                        <h3 className="font-display mt-2 text-2xl font-bold text-[var(--fx-text)]">
                          {post.title}
                        </h3>
                        <p className="mt-3 text-sm leading-relaxed text-[var(--fx-text-secondary)] whitespace-pre-line">
                          {post.body}
                        </p>
                      </div>
                      {canEdit && (
                        <div className="border-t border-[var(--fx-border)] pt-3 flex items-center justify-end gap-4">
                          <button
                            type="button"
                            onClick={() => openEditNewsModal(post)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fx-text-secondary)] hover:text-[var(--fx-accent-text)]"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            <span>Edit / Photo</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteNews(post.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-[var(--fx-loss)] hover:opacity-80"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Remove</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: TWO-TYPE DISCORD CHAT (DEDICATED DISCORD THEME) */}
        {activeTab === 'discord' && (
          <div className="mt-8 overflow-hidden rounded-xl border border-[#3F4147] bg-[#313338] shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[600px]">
              {/* Discord Server Channel Rail (#2B2D31) */}
              <aside className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-[#1E1F22] bg-[#2B2D31] flex flex-col justify-between">
                <div>
                  <div className="border-b border-[#1E1F22] px-4 py-3.5 flex items-center gap-3 bg-[#232428]">
                    {clubProfile.logoUrl && !crestImgError ? (
                      <img
                        src={clubProfile.logoUrl}
                        alt={`${clubProfile.clubName} Crest`}
                        referrerPolicy="no-referrer"
                        onError={() => setCrestImgError(true)}
                        className="h-9 w-9 rounded-lg object-cover border border-white/10"
                      />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-[#1E1F22] text-xs font-bold text-emerald-300">
                        {clubProfile.shortName.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-display text-lg font-bold text-white leading-tight truncate">
                        {clubProfile.clubName} Server
                      </p>
                      <p className="text-[11px] text-indigo-300">
                        2 Discord Chat Rooms
                      </p>
                    </div>
                  </div>

                  {/* Two Discord Channels */}
                  <div className="p-3 space-y-2">
                    <p className="px-2 pb-1 text-[11px] font-semibold tracking-wide text-[#949BA4]">
                      Chat Rooms
                    </p>

                    <button
                      type="button"
                      onClick={() => setDiscordChannel('club-members')}
                      className={`w-full text-left rounded-md px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                        discordChannel === 'club-members'
                          ? 'bg-[#404249] text-white'
                          : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#DBDEE1]'
                      }`}
                    >
                      <Lock
                        className={`h-4 w-4 mt-0.5 shrink-0 ${
                          discordChannel === 'club-members' ? 'text-emerald-400' : 'text-[#80848E]'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">
                          1. Club Members Only
                        </p>
                        <p className="text-[11px] text-[#949BA4]">
                          Only members whose Instagram ID is saved in the website can chat here.
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setDiscordChannel('open-fan-chat')}
                      className={`w-full text-left rounded-md px-3 py-2.5 flex items-start gap-2.5 transition-colors ${
                        discordChannel === 'open-fan-chat'
                          ? 'bg-[#404249] text-white'
                          : 'text-[#949BA4] hover:bg-[#35373C] hover:text-[#DBDEE1]'
                      }`}
                    >
                      <Hash
                        className={`h-4 w-4 mt-0.5 shrink-0 ${
                          discordChannel === 'open-fan-chat' ? 'text-[#5865F2]' : 'text-[#80848E]'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold truncate">
                          2. Open Fan &amp; Player Chat
                        </p>
                        <p className="text-[11px] text-[#949BA4]">
                          Anyone can message here—fans, supporters, and club players alike.
                        </p>
                      </div>
                    </button>
                  </div>

                  {/* Instagram ID Verification Box for Type 1 */}
                  <div className="mx-3 mt-2 mb-4 rounded-lg border border-[#3F4147] bg-[#1E1F22] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-white">
                        Club Member IG Verification
                      </p>
                      <Users className="h-3.5 w-3.5 text-emerald-400" />
                    </div>

                    {isManager ? (
                      <p className="text-[11px] text-emerald-300">
                        Signed in as Club Manager (Fox) — full access to Club Members Only chat.
                      </p>
                    ) : verifiedIgHandle ? (
                      <div className="flex items-center gap-2 text-[11px] text-emerald-300">
                        <UserCheck className="h-3.5 w-3.5 shrink-0" />
                        <span>Verified Club IG: @{verifiedIgHandle}</span>
                      </div>
                    ) : user ? (
                      <form onSubmit={handleVerifyIgMembership} className="space-y-2">
                        <p className="text-[11px] text-[#949BA4]">
                          Enter your club Instagram ID (saved by Fox) to unlock Type 1 chat:
                        </p>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            required
                            value={igVerifyInput}
                            onChange={(e) => setIgVerifyInput(e.target.value)}
                            placeholder="@your_ig_id"
                            className="flex-1 min-w-0 rounded bg-[#2B2D31] border border-white/10 px-2.5 py-1.5 text-xs text-white focus:border-[#5865F2] focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={verifyingIg}
                            className="rounded bg-[var(--fx-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--fx-accent-hover)] whitespace-nowrap"
                          >
                            {verifyingIg ? '...' : 'Verify'}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <p className="text-[11px] text-[#949BA4]">
                        Sign in to verify your saved club Instagram ID or message in Open Chat.
                      </p>
                    )}

                    <p className="text-[11px] text-[#80848E] border-t border-white/5 pt-2">
                      Match availability IN / OUT voting takes place in the Foxes FC Instagram Announcement GC.
                    </p>
                  </div>
                </div>

                {/* User Footer Strip (#232428) */}
                <div className="border-t border-[#1E1F22] bg-[#232428] px-4 py-3 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">
                      {user ? user.displayName || user.email : 'Guest Spectator'}
                    </p>
                    <p className="text-[11px] text-[#949BA4]">
                      {role === 'manager'
                        ? 'Club Manager (Fox)'
                        : verifiedIgHandle
                        ? `IG Member (@${verifiedIgHandle})`
                        : role === 'fan'
                        ? 'Fan / Supporter'
                        : 'Sign in to chat'}
                    </p>
                  </div>
                </div>
              </aside>

              {/* Main Discord Message Stream (#313338) */}
              <div className="lg:col-span-8 flex flex-col h-[600px] bg-[#313338]">
                <div className="border-b border-[#26282C] px-5 py-3.5 flex items-center justify-between bg-[#313338]">
                  <div className="flex items-center gap-2">
                    {discordChannel === 'club-members' ? (
                      <Lock className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Hash className="h-4 w-4 text-[#5865F2]" />
                    )}
                    <h3 className="text-sm font-bold text-white">
                      {discordChannel === 'club-members'
                        ? 'club-members (Saved IG IDs Only)'
                        : 'open-fan-chat (Fans & Players)'}
                    </h3>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3.5">
                  {channelMessages.length === 0 ? (
                    <div className="py-16 text-center">
                      <Hash className="mx-auto h-10 w-10 text-[#4E5058]" />
                      <p className="mt-3 text-sm font-semibold text-white">
                        Welcome to #{discordChannel}!
                      </p>
                      <p className="mt-1 text-xs text-[#949BA4]">
                        {discordChannel === 'club-members'
                          ? 'Private squad & IG-verified member channel.'
                          : 'Open community chat for all fans and club players.'}
                      </p>
                    </div>
                  ) : (
                    channelMessages.map((msg) => {
                      const canDelete = isManager || (user && msg.authorUid === user.uid);
                      const initials = (msg.authorName || 'F')
                        .split(' ')
                        .map((part) => part[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase();

                      const avatarBg =
                        msg.authorRole === 'manager'
                          ? 'bg-[var(--fx-accent)] text-white'
                          : msg.authorRole === 'editor'
                          ? 'bg-amber-600 text-white'
                          : msg.authorRole === 'member'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-[#5865F2] text-white';

                      const nameColor =
                        msg.authorRole === 'manager'
                          ? 'text-amber-300'
                          : msg.authorRole === 'editor'
                          ? 'text-sky-300'
                          : msg.authorRole === 'member'
                          ? 'text-emerald-300'
                          : 'text-indigo-300';

                      return (
                        <div
                          key={msg.id}
                          className="group flex items-start gap-3.5 rounded-md px-2 py-1.5 hover:bg-[#2E3035] transition-colors"
                        >
                          <div
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarBg}`}
                          >
                            {initials}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className={`text-sm font-semibold ${nameColor}`}>
                                  {msg.authorName}
                                </span>
                                <span className="text-[11px] text-[#949BA4]">
                                  {msg.authorRole === 'manager'
                                    ? 'Manager'
                                    : msg.authorRole === 'editor'
                                    ? 'Editor'
                                    : msg.authorRole === 'member'
                                    ? 'Club Member'
                                    : 'Fan / Player'}
                                </span>
                                <span className="text-[11px] font-mono-num text-[#80848E]">
                                  {formatMsgTimestamp(msg.createdAt)}
                                </span>
                              </div>

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDiscordMsg(msg.id)}
                                  className="opacity-70 hover:opacity-100 text-[11px] text-rose-400"
                                >
                                  Delete
                                </button>
                              )}
                            </div>

                            <p className="mt-1 text-sm leading-relaxed text-[#DBDEE1] whitespace-pre-line break-words">
                              {msg.text}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Discord Message Composer (#383A40) */}
                <div className="px-4 pb-4 pt-2 bg-[#313338]">
                  {!user ? (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg bg-[#2B2D31] px-4 py-3 border border-[#3F4147]">
                      <p className="text-xs text-[#DBDEE1]">
                        {discordChannel === 'club-members'
                          ? 'Sign in and verify your club Instagram ID to chat in Club Members Only.'
                          : 'Sign in with Google to chat with fans and players in Open Fan Chat.'}
                      </p>
                      <button
                        type="button"
                        onClick={onSignIn}
                        className="rounded-md bg-[#5865F2] px-4 py-2 text-xs font-semibold text-white hover:bg-[#4752C4] whitespace-nowrap"
                      >
                        Sign In to Chat
                      </button>
                    </div>
                  ) : discordChannel === 'club-members' && !canChatInMembersChannel ? (
                    <div className="rounded-lg bg-[#2B2D31] px-4 py-3 border border-amber-400/30 text-xs text-amber-200">
                      Only members whose Instagram ID is saved in the website by Fox can send messages in #club-members. Verify your Instagram handle on the left panel or switch to #open-fan-chat.
                    </div>
                  ) : (
                    <form
                      onSubmit={handleSendDiscordMessage}
                      className="flex items-center gap-2 rounded-lg bg-[#383A40] px-3 py-2 border border-white/5 focus-within:border-[#5865F2]"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        placeholder={
                          discordChannel === 'club-members'
                            ? 'Message #club-members (IG-verified squad)...'
                            : 'Message #open-fan-chat (fans & players)...'
                        }
                        maxLength={1000}
                        className="flex-1 bg-transparent text-sm text-[#DBDEE1] placeholder:text-[#80848E] focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={sendingChat || !chatInput.trim()}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[#5865F2] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#4752C4] disabled:opacity-50 transition-colors"
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Send</span>
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MANAGER-ONLY FOX INSTAGRAM MATCH ALERT DESK */}
        {activeTab === 'ig_desk' && isManager && (
          <div className="mt-8 space-y-6">
            <div className="rounded-xl border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-[var(--fx-accent-fg)]">
              <div className="flex items-center gap-3">
                <Lock className="h-4 w-4 shrink-0 text-[var(--fx-accent-text)]" />
                <span>
                  Manager-Only Section (Fox): Add club players&apos; Instagram IDs below (automatically unlocks Club Members Discord for them) and send match alerts directly to their Instagram personal messages from {hostInput || hostIgId}. Players then open the Foxes FC Instagram announcement gc to vote IN or OUT.
                </span>
              </div>
              <span className="shrink-0 font-mono-num text-[11px] text-[var(--fx-text-secondary)]">
                Meta API: {igApiConfigured ? 'Connected' : 'Assisted DM Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="lg:col-span-6 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-5">
                <form onSubmit={handleSaveHostIg} className="space-y-2">
                  <label className="block text-xs font-semibold text-[var(--fx-text-secondary)]">
                    Fox Host Instagram ID (Sender Profile)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      value={hostInput}
                      onChange={(e) => setHostInput(e.target.value)}
                      placeholder="@foxesfc.vehari"
                      className="flex-1 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface-hover)] px-4 py-2 text-xs font-semibold text-[var(--fx-text)] hover:border-[var(--fx-accent-border)]"
                    >
                      Save Host ID
                    </button>
                  </div>
                </form>

                <div className="border-t border-[var(--fx-border)] pt-4 space-y-3">
                  <label className="block text-xs font-semibold text-[var(--fx-text-secondary)]">
                    Load Scheduled Match or Customize Bracketed Fields
                  </label>
                  <select
                    value={selectedMatchId}
                    onChange={(e) => handleLoadMatchIntoIg(e.target.value)}
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-xs text-[var(--fx-text)]"
                  >
                    <option value="">-- Load from Scheduled Fixtures --</option>
                    {upcomingMatches.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.matchType === 'inter_club'
                          ? `[Inter-Club] Foxes ${m.subTeamA} vs Foxes ${m.subTeamB} (${m.dateDisplay})`
                          : `[External] Foxes FC vs ${m.opponentName} (${m.dateDisplay})`}
                      </option>
                    ))}
                  </select>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="block text-[var(--fx-text-muted)] mb-1">Alert Template</label>
                      <select
                        value={igTypeOverride}
                        onChange={(e) =>
                          setIgTypeOverride(e.target.value as 'external' | 'inter_club')
                        }
                        className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-[var(--fx-text)]"
                      >
                        <option value="external">External Match Alert</option>
                        <option value="inter_club">Inter-Club Match Alert</option>
                      </select>
                    </div>
                    {igTypeOverride === 'external' ? (
                      <div>
                        <label className="block text-[var(--fx-text-muted)] mb-1">(opponent team name!)</label>
                        <input
                          type="text"
                          value={igOpponent}
                          onChange={(e) => setIgOpponent(e.target.value)}
                          placeholder="Burewala United"
                          className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-[var(--fx-text)]"
                        />
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[var(--fx-text-muted)] mb-1">(SUB NAME A)</label>
                          <input
                            type="text"
                            value={igSubA}
                            onChange={(e) => setIgSubA(e.target.value)}
                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-2 text-[var(--fx-text)]"
                          />
                        </div>
                        <div>
                          <label className="block text-[var(--fx-text-muted)] mb-1">(SUB NAME B)</label>
                          <input
                            type="text"
                            value={igSubB}
                            onChange={(e) => setIgSubB(e.target.value)}
                            className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2 py-2 text-[var(--fx-text)]"
                          />
                        </div>
                      </div>
                    )}
                    <div>
                      <label className="block text-[var(--fx-text-muted)] mb-1">(dd-mm-yy)</label>
                      <input
                        type="text"
                        value={igDate}
                        onChange={(e) => setIgDate(e.target.value)}
                        className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-[var(--fx-text)]"
                      />
                    </div>
                    <div>
                      <label className="block text-[var(--fx-text-muted)] mb-1">(time! Am or pm)</label>
                      <input
                        type="text"
                        value={igTime}
                        onChange={(e) => setIgTime(e.target.value)}
                        className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-[var(--fx-text)]"
                      />
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="block text-[var(--fx-text-muted)] mb-1">(location)</label>
                    <input
                      type="text"
                      value={igVenue}
                      onChange={(e) => setIgVenue(e.target.value)}
                      className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-2 text-[var(--fx-text)]"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-bg-alt)] p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-[var(--fx-accent-text)]">
                      Locked Permanent DM Message Preview (From: {hostInput || hostIgId})
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--fx-text)] select-all">
                    {activeAlertText}
                  </pre>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSendToAllPlayers}
                      disabled={bulkSending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>
                        {bulkSending ? 'Dispatching...' : 'Send Alert to All Saved Players'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyAlert(activeAlertText)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3.5 py-2 text-xs font-semibold text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)]"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Exact Alert</span>
                    </button>
                  </div>
                  {!igApiConfigured && (
                    <p className="mt-3 text-[11px] text-[var(--fx-text-muted)]">
                      Note: Automatic background Instagram DM delivery requires Meta Business API tokens (IG_ACCESS_TOKEN &amp; IG_BUSINESS_ACCOUNT_ID) in server environment. Without Meta API tokens, clicking Send copies the exact alert so you can dispatch directly via each player&apos;s Send DM link below.
                    </p>
                  )}

                  {bulkResults.length > 0 && (
                    <div className="mt-3 border-t border-[var(--fx-border)] pt-3 space-y-1 text-[11px]">
                      {bulkResults.map((res, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[var(--fx-text-secondary)]">
                            {res.playerName} ({res.instagramId})
                          </span>
                          <span className={res.sent ? 'text-[var(--fx-win)]' : 'text-[var(--fx-loss)]'}>
                            {res.detail}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-6 rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6 space-y-4">
                <div>
                  <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                    Club Players Instagram IDs &amp; Direct Message Queue
                  </h3>
                  <p className="text-xs text-[var(--fx-text-muted)] mt-0.5">
                    Add or save any club player&apos;s Instagram ID below. Saved IDs automatically unlock Type 1 Club Members Discord. Click Send DM to copy the alert and open their personal Instagram DM from Fox.
                  </p>
                </div>

                {/* Add Club Player IG ID Form */}
                <form
                  onSubmit={handleAddStandaloneIgPlayer}
                  className="rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-accent-soft)] p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
                >
                  <input
                    type="text"
                    required
                    value={newIgPlayerName}
                    onChange={(e) => setNewIgPlayerName(e.target.value)}
                    placeholder="Player Name"
                    className="flex-1 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                  <input
                    type="text"
                    required
                    value={newIgPlayerHandle}
                    onChange={(e) => setNewIgPlayerHandle(e.target.value)}
                    placeholder="@club_player_ig"
                    className="flex-1 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-1 rounded bg-[var(--fx-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] whitespace-nowrap"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Club Player IG</span>
                  </button>
                </form>

                <div className="divide-y divide-[var(--fx-border)]">
                  {players.map((player) => {
                    const savedContact = playerIgContacts.find((c) => c.playerId === player.id);
                    const currentHandle =
                      igHandleInputs[player.id] ?? savedContact?.instagramId ?? '';
                    const cleanHandle = currentHandle.replace(/^@/, '').trim();
                    const dmUrl = cleanHandle
                      ? `https://ig.me/m/${encodeURIComponent(cleanHandle)}`
                      : 'https://instagram.com/direct/inbox/';

                    return (
                      <div
                        key={player.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--fx-text)]">{player.name}</p>
                          <p className="text-[11px] text-[var(--fx-text-muted)]">
                            #{player.jerseyNumber} · {player.position}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={currentHandle}
                            onChange={(e) =>
                              setIgHandleInputs((prev) => ({
                                ...prev,
                                [player.id]: e.target.value,
                              }))
                            }
                            placeholder="@player_ig_id"
                            className="w-40 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleSavePlayerIgById(
                                player.id,
                                player.name,
                                currentHandle,
                                savedContact?.instagramId
                              )
                            }
                            className="rounded border border-[var(--fx-border-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                          >
                            Save
                          </button>
                          <a
                            href={dmUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              handleRecordIgDispatch(
                                player.id,
                                player.name,
                                currentHandle || `@${player.name.toLowerCase()}`
                              )
                            }
                            className="inline-flex items-center gap-1 rounded bg-[var(--fx-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--fx-accent-hover)] whitespace-nowrap"
                          >
                            <span>Send DM</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}

                  {standaloneIgContacts.map((contact) => {
                    const currentHandle =
                      igHandleInputs[contact.playerId] ?? contact.instagramId;
                    const cleanHandle = currentHandle.replace(/^@/, '').trim();
                    const dmUrl = cleanHandle
                      ? `https://ig.me/m/${encodeURIComponent(cleanHandle)}`
                      : 'https://instagram.com/direct/inbox/';

                    return (
                      <div
                        key={contact.playerId}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[var(--fx-text)]">{contact.playerName}</p>
                          <p className="text-[11px] text-[var(--fx-accent-text)]">Club Player IG Contact</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={currentHandle}
                            onChange={(e) =>
                              setIgHandleInputs((prev) => ({
                                ...prev,
                                [contact.playerId]: e.target.value,
                              }))
                            }
                            className="w-40 rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              handleSavePlayerIgById(
                                contact.playerId,
                                contact.playerName,
                                currentHandle,
                                contact.instagramId
                              )
                            }
                            className="rounded border border-[var(--fx-border-strong)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                          >
                            Save
                          </button>
                          <a
                            href={dmUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() =>
                              handleRecordIgDispatch(
                                contact.playerId,
                                contact.playerName,
                                currentHandle
                              )
                            }
                            className="inline-flex items-center gap-1 rounded bg-[var(--fx-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[var(--fx-accent-hover)] whitespace-nowrap"
                          >
                            <span>Send DM</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {igAlertLogs.length > 0 && (
                  <div className="border-t border-[var(--fx-border)] pt-4">
                    <p className="text-xs font-semibold text-[var(--fx-text-secondary)] mb-2">
                      Recent Instagram Dispatch Log ({igAlertLogs.length})
                    </p>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto text-[11px] text-[var(--fx-text-muted)]">
                      {igAlertLogs.slice(0, 8).map((log) => (
                        <div key={log.id} className="flex items-center justify-between">
                          <span>
                            {log.hostIgId} → {log.recipientIgId} ({log.playerName})
                          </span>
                          <span className="text-[var(--fx-text-muted)]">{log.matchLabel}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: MANAGER-ONLY ACCESS CONTROL */}
        {activeTab === 'access' && isManager && (
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)] flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-[var(--fx-accent-text)]" />
                <span>Grant Editor Permission</span>
              </h3>
              <p className="mt-1 text-xs text-[var(--fx-text-muted)]">
                Authorized editors can add/update matches, squad stats, series, news, and discipline fines. Only the Manager (Fox) can assign Official POTM/POTS, manage permissions, or access Instagram Match Alerts.
              </p>

              <form onSubmit={handleAddEditor} className="mt-5 space-y-3">
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Google Email Address</label>
                  <input
                    type="email"
                    required
                    value={editorEmail}
                    onChange={(e) => setEditorEmail(e.target.value)}
                    placeholder="coach.assistant@gmail.com"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Display Name</label>
                  <input
                    type="text"
                    value={editorName}
                    onChange={(e) => setEditorName(e.target.value)}
                    placeholder="Assistant Coach"
                    className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)]"
                >
                  <Check className="h-4 w-4" />
                  <span>Grant Editor Access</span>
                </button>
              </form>
            </div>

            <div className="rounded-xl border border-[var(--fx-border)] bg-[var(--fx-surface)] p-6">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                Authorized Club Editors ({editors.length})
              </h3>
              {editors.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--fx-text-muted)]">
                  No delegated editors yet. Only the Club Manager has edit rights.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-[var(--fx-border)]">
                  {editors.map((ed) => (
                    <div key={ed.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-[var(--fx-text)]">{ed.displayName}</p>
                        <p className="text-xs text-[var(--fx-text-muted)]">{ed.email}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRevokeEditor(ed.id)}
                        className="rounded-lg border border-[var(--fx-loss-border)] px-3 py-1.5 text-xs font-medium text-[var(--fx-loss)] hover:bg-[var(--fx-loss-soft)]"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Publish / Edit News Modal */}
      {newsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[var(--fx-border)] pb-4">
              <h3 className="font-display text-2xl font-bold text-[var(--fx-text)]">
                {editingNewsPost ? 'Edit Club News or Report' : 'Publish Club News or Report'}
              </h3>
              <button
                type="button"
                onClick={() => setNewsModalOpen(false)}
                className="rounded-lg p-2 text-[var(--fx-text-muted)] hover:text-[var(--fx-text)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveNews} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Headline</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={140}
                  value={newsTitle}
                  onChange={(e) => setNewsTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                />
              </div>
              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Category</label>
                <select
                  value={newsCategory}
                  onChange={(e) => setNewsCategory(e.target.value as NewsPost['category'])}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                >
                  <option value="Club Announcement">Club Announcement</option>
                  <option value="Match Report">Match Report</option>
                  <option value="Squad Update">Squad Update</option>
                  <option value="Tournament">Tournament</option>
                </select>
              </div>

              {/* News Article Photo Upload / URL */}
              <div className="rounded-lg border border-[var(--fx-border)] bg-[var(--fx-bg-alt)] p-4 space-y-3">
                <p className="text-xs font-semibold text-[var(--fx-text)] flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-[var(--fx-accent-text)]" />
                  <span>Article Photo (Optional)</span>
                </p>

                {newsPhotoUrl && !newsPhotoError && (
                  <div className="relative h-40 w-full overflow-hidden rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)]">
                    <img
                      src={newsPhotoUrl}
                      alt="News photo preview"
                      referrerPolicy="no-referrer"
                      onError={() => setNewsPhotoError(true)}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3 py-1.5 text-xs font-medium text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)]">
                    <Upload className="h-3.5 w-3.5 text-[var(--fx-accent-text)]" />
                    <span>{uploadingNewsPhoto ? 'Uploading...' : 'Upload Photo'}</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleNewsPhotoUpload}
                      className="sr-only"
                    />
                  </label>
                  {newsPhotoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setNewsPhotoUrl('');
                        setNewsPhotoError(false);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--fx-loss-border)] px-3 py-1.5 text-xs text-[var(--fx-loss)] hover:bg-[var(--fx-loss-soft)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Remove Photo</span>
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={newsPhotoUrl.startsWith('data:') ? '' : newsPhotoUrl}
                  onChange={(e) => {
                    setNewsPhotoUrl(e.target.value);
                    setNewsPhotoError(false);
                  }}
                  placeholder={
                    newsPhotoUrl.startsWith('data:')
                      ? 'Uploaded photo attached (paste URL here to replace)'
                      : 'Or paste image URL...'
                  }
                  className="w-full rounded border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-2.5 py-1.5 text-xs text-[var(--fx-text)]"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--fx-text-secondary)] mb-1">Article / Report Body</label>
                <textarea
                  rows={5}
                  required
                  minLength={5}
                  maxLength={4000}
                  value={newsBody}
                  onChange={(e) => setNewsBody(e.target.value)}
                  className="w-full rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-input-bg)] px-3 py-2 text-sm text-[var(--fx-text)]"
                />
              </div>
              <div className="flex justify-end gap-3 border-t border-[var(--fx-border)] pt-4">
                <button
                  type="button"
                  onClick={() => setNewsModalOpen(false)}
                  className="rounded-lg border border-[var(--fx-border-strong)] px-4 py-2 text-xs text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingNews || uploadingNewsPhoto}
                  className="rounded-lg bg-[var(--fx-accent)] px-5 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] disabled:opacity-50"
                >
                  {savingNews
                    ? 'Saving...'
                    : editingNewsPost
                    ? 'Save Changes'
                    : 'Publish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
