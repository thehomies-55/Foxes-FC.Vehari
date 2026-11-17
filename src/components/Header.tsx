import React, { useState } from 'react';
import { LogIn, LogOut, Menu, X } from 'lucide-react';
import type { User } from 'firebase/auth';
import type { ClubProfileConfig, UserRole } from '../types';

export type AppPageId =
  | 'home'
  | 'matchday'
  | 'head_to_head'
  | 'squad'
  | 'tournaments'
  | 'club_milestones'
  | 'player_milestones'
  | 'discipline'
  | 'news'
  | 'discord'
  | 'ig_desk'
  | 'access'
  | 'club_settings';

interface HeaderProps {
  activePage: AppPageId;
  onNavigate: (page: AppPageId) => void;
  clubProfile: ClubProfileConfig;
  user: User | null;
  role: UserRole;
  onSignIn: () => void;
  onSignOut: () => void;
  authLoading: boolean;
}

const NAV_ITEMS: { id: AppPageId; label: string }[] = [
  { id: 'home', label: 'Start Page' },
  { id: 'matchday', label: 'Matchday' },
  { id: 'squad', label: 'Squad' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'discord', label: 'Discord' },
];

export const Header: React.FC<HeaderProps> = ({
  activePage,
  onNavigate,
  clubProfile,
  user,
  role,
  onSignIn,
  onSignOut,
  authLoading,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSelect = (id: AppPageId) => {
    setMobileOpen(false);
    onNavigate(id);
  };

  const roleText =
    role === 'manager'
      ? 'Manager'
      : role === 'editor'
      ? 'Editor'
      : role === 'fan'
      ? 'Member'
      : '';

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--fx-border)] bg-[var(--fx-header)] backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-8 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Single text element wordmark */}
        <button
          type="button"
          onClick={() => handleSelect('home')}
          className="font-display text-2xl font-bold tracking-tight text-[var(--fx-text)] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)] rounded"
        >
          {clubProfile.clubName}
        </button>

        {/* Zone 2: 5 concise single-line text nav links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--fx-text-secondary)]">
          {NAV_ITEMS.map((item) => {
            const isActive = activePage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleSelect(item.id)}
                className={`relative py-1 whitespace-nowrap shrink-0 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)] rounded ${
                  isActive
                    ? 'text-[var(--fx-text)] underline decoration-[var(--fx-accent)] decoration-2 underline-offset-8'
                    : 'text-[var(--fx-text-muted)] hover:text-[var(--fx-text)] hover:underline hover:decoration-[var(--fx-border-strong)] hover:underline-offset-8'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          {user ? (
            <button
              type="button"
              onClick={onSignOut}
              disabled={authLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--fx-border-strong)] bg-[var(--fx-surface)] px-4 py-2 text-xs font-semibold text-[var(--fx-text)] hover:bg-[var(--fx-surface-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)]"
              title={`Signed in as ${user.email || user.displayName}`}
            >
              <span className="max-w-[140px] truncate">
                {user.displayName || user.email} {roleText ? `· ${roleText}` : ''}
              </span>
              <LogOut className="h-3.5 w-3.5 text-[var(--fx-text-muted)] shrink-0" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onSignIn}
              disabled={authLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--fx-accent)] px-4 py-2 text-xs font-semibold text-white hover:bg-[var(--fx-accent-hover)] transition-colors whitespace-nowrap shrink-0 min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fx-accent)]"
            >
              <LogIn className="h-3.5 w-3.5 shrink-0" />
              <span>{authLoading ? 'Signing in...' : 'Sign In'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label="Toggle navigation menu"
            className="md:hidden inline-flex items-center justify-center rounded-lg border border-[var(--fx-border)] p-2 text-[var(--fx-text-secondary)] hover:text-[var(--fx-text)] min-h-[44px] min-w-[44px]"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="md:hidden border-t border-[var(--fx-border)] bg-[var(--fx-surface)] px-4 py-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium min-h-[44px] ${
                activePage === item.id
                  ? 'bg-[var(--fx-accent-soft)] text-[var(--fx-accent-text)]'
                  : 'text-[var(--fx-text-secondary)] hover:bg-[var(--fx-surface-hover)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
};
