import React, { useEffect, useState } from 'react';
import { Bell, Moon, Sun, Globe, LogOut, ShieldCheck } from 'lucide-react';
import { AegisProvider, useAegis } from './context/AegisContext';
import { CustomerPortal } from './components/CustomerPortal';
import { OperatorPortal } from './components/OperatorPortal';
import { AuthGateModal } from './components/AuthGateModal';
import { NotificationDrawer } from './components/NotificationDrawer';
import { TRANSLATIONS } from './lib/i18n';
import type { LanguageCode } from './types/aegis';

const AegisShell: React.FC = () => {
  const {
    theme,
    toggleTheme,
    language,
    setLanguage,
    activePortal,
    setActivePortal,
    user,
    notifications,
    loadingData,
    dataError,
    openAuthModal,
    logout,
  } = useAegis();

  const [notifOpen, setNotifOpen] = useState(false);
  const [mapsQuotaExceeded, setMapsQuotaExceeded] = useState(false);

  useEffect(() => {
    const onQuota = () => setMapsQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const t = TRANSLATIONS[language];

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/40 to-cyan-50/30 dark:from-[#0B1120] dark:via-slate-950 dark:to-slate-900 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Tier 2 Demo Quota Notice Banner when triggered */}
      {mapsQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Clean Single-Row Top Bar Contract (3 Zones) */}
      <header className="sticky top-0 z-40 glass-surface border-b border-slate-200/80 dark:border-slate-800/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single text wordmark */}
          <button
            type="button"
            onClick={() => setActivePortal('customer')}
            className="text-xl font-display font-bold tracking-tight text-blue-600 dark:text-cyan-400 whitespace-nowrap shrink-0 cursor-pointer"
          >
            AEGIS
          </button>

          {/* Zone 2: Concise single-line navigation links */}
          <nav
            aria-label="Primary portal navigation"
            className="hidden md:flex items-center gap-6 text-sm font-semibold"
          >
            <button
              type="button"
              onClick={() => setActivePortal('customer')}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                activePortal === 'customer'
                  ? 'text-blue-600 dark:text-cyan-400 border-b-2 border-blue-600 dark:border-cyan-400'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.customerPortal}
            </button>
            <button
              type="button"
              onClick={() => {
                if (user?.role !== 'operator') {
                  setActivePortal('operator');
                  openAuthModal('operator');
                } else {
                  setActivePortal('operator');
                }
              }}
              className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
                activePortal === 'operator'
                  ? 'text-blue-600 dark:text-cyan-400 border-b-2 border-blue-600 dark:border-cyan-400'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {t.operatorPortal}
            </button>
          </nav>

          {/* Zone 3: Primary Action */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="min-h-[40px] px-4 rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 text-white text-sm font-semibold flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>{t.signOut}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuthModal('customer')}
                className="min-h-[40px] px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold whitespace-nowrap shrink-0 cursor-pointer"
              >
                {t.signIn}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Workspace Utility Strip (Role switcher on mobile + Theme + Language + Notification Bell) */}
      <div className="border-b border-slate-200/70 dark:border-slate-800/70 bg-white/50 dark:bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={() => setActivePortal('customer')}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activePortal === 'customer'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200/70 dark:bg-slate-800'
              }`}
            >
              {t.customerPortal}
            </button>
            <button
              type="button"
              onClick={() => {
                setActivePortal('operator');
                if (user?.role !== 'operator') openAuthModal('operator');
              }}
              className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold cursor-pointer ${
                activePortal === 'operator'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200/70 dark:bg-slate-800'
              }`}
            >
              {t.operatorPortal}
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span>
              {activePortal === 'operator'
                ? 'AEGIS Flight Operations & Oracle Command'
                : 'AEGIS Consumer Air Delivery · Hyderabad Hub'}
            </span>
          </div>

          <div className="flex items-center gap-2.5 ml-auto">
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-2.5 min-h-[38px]">
              <Globe className="w-4 h-4 text-slate-500" />
              <select
                aria-label="Select Language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
                className="bg-transparent text-xs font-semibold focus:outline-none cursor-pointer"
              >
                <option value="en" className="dark:bg-slate-900">English</option>
                <option value="te" className="dark:bg-slate-900">తెలుగు</option>
                <option value="hi" className="dark:bg-slate-900">हिन्दी</option>
              </select>
            </div>

            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Toggle Light and Dark Mode"
              className="min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {theme === 'light' ? (
                <>
                  <Moon className="w-4 h-4" />
                  <span>Dark</span>
                </>
              ) : (
                <>
                  <Sun className="w-4 h-4 text-amber-400" />
                  <span>Light</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen(true)}
              aria-label="Open notifications"
              className="relative min-h-[38px] px-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Bell className="w-4 h-4 text-blue-600 dark:text-cyan-400" />
              <span>Alerts</span>
              {unreadCount > 0 && (
                <span className="font-mono text-xs font-bold text-blue-600 dark:text-cyan-400">
                  ({unreadCount})
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inline Data Error Banner */}
      {dataError && (
        <div className="max-w-7xl mx-auto px-4 mt-4 w-full">
          <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-200">
            {dataError}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1">
        {loadingData ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
            <div className="h-48 rounded-3xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="h-36 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
              <div className="h-36 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
              <div className="h-36 rounded-2xl bg-slate-200/70 dark:bg-slate-800/60 animate-pulse" />
            </div>
          </div>
        ) : activePortal === 'operator' ? (
          <OperatorPortal />
        ) : (
          <CustomerPortal />
        )}
      </main>

      <AuthGateModal />
      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <AegisProvider>
      <AegisShell />
    </AegisProvider>
  );
}
