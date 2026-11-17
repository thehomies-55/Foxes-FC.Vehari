import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  MANAGER_EMAIL,
  OperationType,
  testFirestoreConnection,
} from './firebase';
import type {
  ClubProfileConfig,
  ClubTrophyConfig,
  DiscordMessage,
  DisciplineIncident,
  EditorGrant,
  IgAlertLog,
  MatchRecord,
  NewsPost,
  Player,
  PlayerIgContact,
  SeriesEvent,
  UserRole,
  WebsiteThemeId,
} from './types';
import {
  computeClubMilestones,
  computeDisciplineSummary,
  computeOpponentHeadToHead,
  computePlayerMilestones,
} from './utils/clubCalculations';
import { DEFAULT_CLUB_PROFILE, seedFoxesClubData } from './utils/seedData';
import { Header, type AppPageId } from './components/Header';
import { HeroSection } from './components/HeroSection';
import { MatchdaySection } from './components/MatchdaySection';
import { HeadToHeadSection } from './components/HeadToHeadSection';
import { SquadSection } from './components/SquadSection';
import { SeriesSection } from './components/SeriesSection';
import { RecordsSection } from './components/RecordsSection';
import { CommunitySection } from './components/CommunitySection';
import { ClubSettingsSection } from './components/ClubSettingsSection';

const PAGE_TITLES: Record<AppPageId, string> = {
  home: 'Start Page',
  matchday: 'Fixtures & Match Results',
  head_to_head: 'Opponent Teams & Head-to-Head',
  squad: 'Player Stats & Squad',
  tournaments: 'Tournaments & Series',
  club_milestones: 'Club Milestones & Records',
  player_milestones: 'Player Milestones',
  discipline: 'Discipline & PKR Fines',
  news: 'Club News & Reports',
  discord: 'Discord Chat',
  ig_desk: 'Fox IG Match Alerts',
  access: 'Editor Permissions',
  club_settings: 'Club Settings & IG IDs',
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [role, setRole] = useState<UserRole>('guest');
  const [verifiedIgHandle, setVerifiedIgHandle] = useState('');
  const [activePage, setActivePage] = useState<AppPageId>('home');
  const [prefillOpponent, setPrefillOpponent] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  // Public Club Data
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<MatchRecord[]>([]);
  const [seriesList, setSeriesList] = useState<SeriesEvent[]>([]);
  const [news, setNews] = useState<NewsPost[]>([]);
  const [incidents, setIncidents] = useState<DisciplineIncident[]>([]);
  const [discordMessages, setDiscordMessages] = useState<DiscordMessage[]>([]);
  const [trophyConfig, setTrophyConfig] = useState<ClubTrophyConfig>({
    firstPlaceBonus: 0,
    secondPlaceBonus: 0,
    thirdPlaceBonus: 0,
  });
  const [clubProfile, setClubProfile] = useState<ClubProfileConfig>(DEFAULT_CLUB_PROFILE);

  // Manager-Only Data
  const [editors, setEditors] = useState<EditorGrant[]>([]);
  const [hostIgId, setHostIgId] = useState('@foxesfc.vehari');
  const [playerIgContacts, setPlayerIgContacts] = useState<PlayerIgContact[]>([]);
  const [igAlertLogs, setIgAlertLogs] = useState<IgAlertLog[]>([]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 4200);
  };

  useEffect(() => {
    testFirestoreConnection();

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setRole('guest');
        setVerifiedIgHandle('');
        setAuthReady(true);
        return;
      }

      const emailLower = (firebaseUser.email || '').toLowerCase();
      if (firebaseUser.emailVerified && emailLower === MANAGER_EMAIL.toLowerCase()) {
        setRole('manager');
      } else if (firebaseUser.emailVerified && emailLower) {
        try {
          const editorDoc = await getDoc(doc(db, 'editors', emailLower));
          setRole(editorDoc.exists() ? 'editor' : 'fan');
        } catch {
          setRole('fan');
        }
      } else {
        setRole('fan');
      }

      if (firebaseUser.emailVerified && firebaseUser.email) {
        try {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const existingSnap = await getDoc(userRef);
          if (!existingSnap.exists()) {
            await setDoc(userRef, {
              uid: firebaseUser.uid,
              email: firebaseUser.email,
              displayName: firebaseUser.displayName || firebaseUser.email.split('@')[0],
              verifiedIgHandle: '',
              createdAt: serverTimestamp(),
            });
            setVerifiedIgHandle('');
          } else {
            const existingHandle = String(existingSnap.data().verifiedIgHandle || '');
            setVerifiedIgHandle(existingHandle);
          }
        } catch {
          setVerifiedIgHandle('');
        }
      }
      setAuthReady(true);
    });

    return () => unsubAuth();
  }, []);

  useEffect(() => {
    const unsubPlayers = onSnapshot(
      collection(db, 'players'),
      (snap) => {
        setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Player)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'players')
    );

    const unsubMatches = onSnapshot(
      collection(db, 'matches'),
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MatchRecord)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'matches')
    );

    const unsubSeries = onSnapshot(
      collection(db, 'series'),
      (snap) => {
        setSeriesList(snap.docs.map((d) => ({ id: d.id, ...d.data() } as SeriesEvent)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'series')
    );

    const unsubNews = onSnapshot(
      query(collection(db, 'news'), orderBy('publishedDate', 'desc')),
      (snap) => {
        setNews(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NewsPost)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'news')
    );

    const unsubIncidents = onSnapshot(
      query(collection(db, 'disciplineIncidents'), orderBy('incidentDate', 'desc')),
      (snap) => {
        setIncidents(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as DisciplineIncident))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'disciplineIncidents')
    );

    const unsubDiscord = onSnapshot(
      query(collection(db, 'discordMessages'), orderBy('createdAt', 'asc')),
      (snap) => {
        setDiscordMessages(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as DiscordMessage))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'discordMessages')
    );

    const unsubTrophy = onSnapshot(
      doc(db, 'clubConfig', 'trophies'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setTrophyConfig({
            firstPlaceBonus: Number(data.firstPlaceBonus) || 0,
            secondPlaceBonus: Number(data.secondPlaceBonus) || 0,
            thirdPlaceBonus: Number(data.thirdPlaceBonus) || 0,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'clubConfig/trophies')
    );

    const unsubProfile = onSnapshot(
      doc(db, 'clubConfig', 'profile'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const rawTheme = String(data.websiteTheme || '');
          const validThemes: WebsiteThemeId[] = [
            'obsidian_orange',
            'midnight_emerald',
            'royal_navy',
            'crimson_slate',
            'light_ivory',
          ];
          let websiteTheme: WebsiteThemeId =
            DEFAULT_CLUB_PROFILE.websiteTheme || 'obsidian_orange';
          if (validThemes.includes(rawTheme as WebsiteThemeId)) {
            websiteTheme = rawTheme as WebsiteThemeId;
          } else if (rawTheme === 'pitch_ivory' || rawTheme === 'daylight_orange') {
            websiteTheme = 'light_ivory';
          } else if (rawTheme === 'crimson_derby') {
            websiteTheme = 'crimson_slate';
          }
          setClubProfile({
            clubName: String(data.clubName || DEFAULT_CLUB_PROFILE.clubName),
            shortName: String(data.shortName || DEFAULT_CLUB_PROFILE.shortName),
            foundingDate: String(data.foundingDate || DEFAULT_CLUB_PROFILE.foundingDate),
            logoUrl: String(data.logoUrl || DEFAULT_CLUB_PROFILE.logoUrl),
            homeGround: String(data.homeGround || DEFAULT_CLUB_PROFILE.homeGround),
            clubSlogan:
              data.clubSlogan !== undefined
                ? String(data.clubSlogan)
                : DEFAULT_CLUB_PROFILE.clubSlogan,
            websiteTheme,
          });
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'clubConfig/profile')
    );

    return () => {
      unsubPlayers();
      unsubMatches();
      unsubSeries();
      unsubNews();
      unsubIncidents();
      unsubDiscord();
      unsubTrophy();
      unsubProfile();
    };
  }, []);

  useEffect(() => {
    document.title = `${clubProfile.clubName} · ${PAGE_TITLES[activePage]}`;
  }, [clubProfile.clubName, activePage]);

  useEffect(() => {
    const activeTheme = clubProfile.websiteTheme || 'obsidian_orange';
    document.documentElement.setAttribute('data-theme', activeTheme);
    try {
      window.localStorage.setItem('foxes_website_theme', activeTheme);
    } catch {
      // Ignore storage failures in restricted contexts
    }
  }, [clubProfile.websiteTheme]);

  useEffect(() => {
    if (!authReady || role !== 'manager') {
      setEditors([]);
      setPlayerIgContacts([]);
      setIgAlertLogs([]);
      return;
    }

    const unsubEditors = onSnapshot(
      collection(db, 'editors'),
      (snap) => {
        setEditors(snap.docs.map((d) => ({ id: d.id, ...d.data() } as EditorGrant)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'editors')
    );

    const unsubHostIg = onSnapshot(
      doc(db, 'managerIgConfig', 'host'),
      (snap) => {
        if (snap.exists()) {
          setHostIgId(String(snap.data().hostInstagramId || '@foxesfc.vehari'));
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'managerIgConfig/host')
    );

    const unsubPlayerIg = onSnapshot(
      collection(db, 'playerIgDirectory'),
      (snap) => {
        setPlayerIgContacts(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as PlayerIgContact))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'playerIgDirectory')
    );

    const unsubIgLogs = onSnapshot(
      query(collection(db, 'igAlertLogs'), orderBy('sentAt', 'desc')),
      (snap) => {
        setIgAlertLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as IgAlertLog)));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'igAlertLogs')
    );

    return () => {
      unsubEditors();
      unsubHostIg();
      unsubPlayerIg();
      unsubIgLogs();
    };
  }, [authReady, role]);

  const handleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in to Foxes FC.vehari.');
    } catch {
      showToast('Sign-in was cancelled or blocked by popup settings.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setAuthLoading(true);
    try {
      await signOut(auth);
      setVerifiedIgHandle('');
      if (activePage === 'ig_desk' || activePage === 'access' || activePage === 'club_settings') {
        setActivePage('home');
      }
      showToast('Signed out.');
    } catch {
      showToast('Could not sign out cleanly. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleNavigate = (page: AppPageId) => {
    setActivePage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSeedData = async () => {
    if (!user || role !== 'manager') return;
    setSeeding(true);
    try {
      await seedFoxesClubData(user.uid);
      showToast('Initialized Foxes FC.vehari starter squad, fixtures, series, and discipline records.');
    } catch {
      showToast('Could not initialize starter club data. Please check permissions and retry.');
    } finally {
      setSeeding(false);
    }
  };

  const clubMilestones = useMemo(
    () => computeClubMilestones(matches, seriesList, trophyConfig),
    [matches, seriesList, trophyConfig]
  );

  const playerMilestones = useMemo(() => computePlayerMilestones(players), [players]);

  const disciplineSummary = useMemo(
    () => computeDisciplineSummary(players, incidents),
    [players, incidents]
  );

  const opponentHeadToHead = useMemo(
    () => computeOpponentHeadToHead(matches),
    [matches]
  );

  const handleScheduleVsTeam = (teamName: string) => {
    setPrefillOpponent(teamName);
    handleNavigate('matchday');
  };

  const nextFixture = useMemo(() => {
    const scheduled = matches
      .filter((m) => m.status === 'scheduled')
      .sort((a, b) => a.dateIso.localeCompare(b.dateIso));
    return scheduled[0] || null;
  }, [matches]);

  const communityProps = {
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
    onUpdateVerifiedIgHandle: setVerifiedIgHandle,
    onSignIn: handleSignIn,
    onNotify: showToast,
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--fx-bg)] text-[var(--fx-text)] transition-colors duration-200">
      <Header
        activePage={activePage}
        onNavigate={handleNavigate}
        clubProfile={clubProfile}
        user={user}
        role={role}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
        authLoading={authLoading}
      />

      <main className="flex-1">
        {activePage === 'home' ? (
          <HeroSection
            clubProfile={clubProfile}
            milestones={clubMilestones}
            nextFixture={nextFixture}
            role={role}
            isEmptyDb={players.length === 0 && matches.length === 0}
            onSeedData={handleSeedData}
            seeding={seeding}
            onNavigate={handleNavigate}
            counts={{
              matches: matches.length,
              opponents: opponentHeadToHead.length,
              players: players.length,
              series: seriesList.length,
              news: news.length,
              pendingFinesPkr: disciplineSummary.pendingFinePkr,
              discordMessages: discordMessages.length,
            }}
          />
        ) : (
          <div>
            <div className="border-b border-[var(--fx-border)] bg-[var(--fx-bg-alt)]">
              <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => handleNavigate('home')}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-3.5 py-1.5 text-xs font-semibold text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)] transition-colors min-h-[36px]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Start Page</span>
                </button>
                <p className="text-xs text-[var(--fx-text-muted)]">
                  Start Page <span aria-hidden="true">/</span>{' '}
                  <span className="text-[var(--fx-text)] font-medium">{PAGE_TITLES[activePage]}</span>
                </p>
              </div>
            </div>

            {activePage === 'matchday' && (
              <MatchdaySection
                clubProfile={clubProfile}
                matches={matches}
                players={players}
                seriesList={seriesList}
                role={role}
                currentUid={user?.uid || null}
                prefillOpponent={prefillOpponent}
                onClearPrefillOpponent={() => setPrefillOpponent('')}
                onNotify={showToast}
              />
            )}

            {activePage === 'head_to_head' && (
              <HeadToHeadSection
                clubProfile={clubProfile}
                matches={matches}
                role={role}
                onScheduleVsTeam={handleScheduleVsTeam}
                onNotify={showToast}
              />
            )}

            {activePage === 'squad' && (
              <SquadSection
                players={players}
                role={role}
                playerIgContacts={playerIgContacts}
                onNotify={showToast}
              />
            )}

            {activePage === 'tournaments' && (
              <SeriesSection
                clubProfile={clubProfile}
                seriesList={seriesList}
                matches={matches}
                players={players}
                role={role}
                onNotify={showToast}
              />
            )}

            {activePage === 'club_milestones' && (
              <RecordsSection
                clubMilestones={clubMilestones}
                playerMilestones={playerMilestones}
                players={players}
                incidents={incidents}
                trophyConfig={trophyConfig}
                role={role}
                onNotify={showToast}
                fixedTab="club"
              />
            )}

            {activePage === 'player_milestones' && (
              <RecordsSection
                clubMilestones={clubMilestones}
                playerMilestones={playerMilestones}
                players={players}
                incidents={incidents}
                trophyConfig={trophyConfig}
                role={role}
                onNotify={showToast}
                fixedTab="players"
              />
            )}

            {activePage === 'discipline' && (
              <RecordsSection
                clubMilestones={clubMilestones}
                playerMilestones={playerMilestones}
                players={players}
                incidents={incidents}
                trophyConfig={trophyConfig}
                role={role}
                onNotify={showToast}
                fixedTab="discipline"
              />
            )}

            {activePage === 'news' && (
              <CommunitySection {...communityProps} fixedTab="news" />
            )}

            {activePage === 'discord' && (
              <CommunitySection {...communityProps} fixedTab="discord" />
            )}

            {activePage === 'ig_desk' && role === 'manager' && (
              <CommunitySection {...communityProps} fixedTab="ig_desk" />
            )}

            {activePage === 'access' && role === 'manager' && (
              <CommunitySection {...communityProps} fixedTab="access" />
            )}

            {activePage === 'club_settings' && role === 'manager' && (
              <ClubSettingsSection
                clubProfile={clubProfile}
                players={players}
                playerIgContacts={playerIgContacts}
                hostIgId={hostIgId}
                onNotify={showToast}
              />
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--fx-border)] bg-[var(--fx-footer)] py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--fx-text-muted)]">
          <p className="font-semibold text-[var(--fx-text)]">
            {clubProfile.clubName} · {clubProfile.foundingDate} · {clubProfile.homeGround}
          </p>
          <p>Official Matchday, Squad Analytics, Discipline &amp; Supporter Hub</p>
        </div>
      </footer>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 rounded-lg border border-[var(--fx-accent-border)] bg-[var(--fx-surface)] px-4 py-3 text-xs font-medium text-[var(--fx-text)] shadow-xl"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
