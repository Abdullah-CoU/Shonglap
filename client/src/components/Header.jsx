import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation } from 'react-router-dom';
import { isAuthenticated, getUser, logout, authHeaders, isAdmin } from '../auth.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Popular civic-issue search suggestions (Bangla / English)
const POPULAR_SEARCHES = [
  { en: 'Pothole', bn: 'গর্ত' },
  { en: 'Garbage', bn: 'ময়লা' },
  { en: 'Mosquito', bn: 'মশা' },
  { en: 'Water supply', bn: 'পানি' },
  { en: 'Waterlogging', bn: 'জলাবদ্ধতা' },
  { en: 'Street light', bn: 'বাতি' },
  { en: 'Electricity', bn: 'বিদ্যুৎ' },
  { en: 'Gas leak', bn: 'গ্যাস' },
  { en: 'Traffic jam', bn: 'ট্রাফিক' },
  { en: 'Illegal construction', bn: 'অবৈধ নির্মাণ' },
  { en: 'Gulshan', bn: 'গুলশান' },
  { en: 'Dhanmondi', bn: 'ধানমন্ডি' },
  { en: 'Mirpur', bn: 'মিরপুর' },
  { en: 'Uttara', bn: 'উত্তরা' },
];

/**
 * Shared header used on every page.
 * App icon + name navigate to Home. Functional search, staff notifications, and profile menu.
 */
export default function Header({ compact = false, onMenuClick }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [authState, setAuthState] = useState({ authed: isAuthenticated(), user: getUser() });
  const searchRef = useRef(null);
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  const isStaff = authState.authed && (authState.user?.role === 'admin' || authState.user?.role === 'department');

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');

  // Re-read auth state whenever the route changes (login/logout navigation)
  useEffect(() => {
    setAuthState({ authed: isAuthenticated(), user: getUser() });
    setProfileOpen(false);
    setNotifOpen(false);
  }, [location.pathname]);

  // Fetch notifications for staff
  useEffect(() => {
    if (!isStaff) return;
    fetch(`${API_BASE}/api/notifications`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setNotifications(data.notifications || []); })
      .catch(() => {});
  }, [isStaff, location.pathname]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/complaints/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results || []);
        }
      } catch {
        setResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) setSearchOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (trackingId) => {
    setSearchOpen(false);
    setQuery('');
    navigate(`/track/${trackingId}`);
  };

  const handleSuggestion = (value) => {
    setQuery(value);
    setSearchOpen(true);
    // Keep dropdown open so results appear after debounce
  };

  const handleLogout = () => {
    logout();
    setAuthState({ authed: false, user: null });
    setProfileOpen(false);
    navigate('/');
  };

  const unread = notifications.length;
  const name = authState.user?.name || (i18n.language === 'bn' ? 'অতিথি' : 'Guest');
  const roleLabel = authState.user?.role === 'admin'
    ? (i18n.language === 'bn' ? 'অ্যাডমিন' : 'Admin')
    : authState.user?.role === 'department'
      ? (i18n.language === 'bn' ? 'বিভাগ' : 'Department')
      : (i18n.language === 'bn' ? 'নাগরিক' : 'Citizen');

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Mobile hamburger */}
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden text-2xl text-gray-700"
            aria-label="Open menu"
          >
            ☰
          </button>
        )}

        {/* App icon + name — click navigates to Home */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2.5 min-w-0 text-left hover:opacity-80 transition-opacity"
          aria-label="Go to home page"
        >
          <span className="text-2xl sm:text-3xl flex-shrink-0">🏛️</span>
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base text-blue-900 truncate">
              {i18n.language === 'bn' ? 'সংলাপ' : 'Shonglap'}
            </div>
          </div>
        </button>

        {/* Functional Search */}
        {!compact && (
          <div ref={searchRef} className="hidden md:block relative flex-1 max-w-md mx-4">
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
              <span className="text-gray-400">⌕</span>
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                placeholder={i18n.language === 'bn' ? 'ট্র্যাকিং আইডি, এলাকা বা সমস্যা খুঁজুন...' : 'Search by ID, area, or problem...'}
                className="flex-1 bg-transparent text-sm text-gray-700 outline-none placeholder-gray-400"
                aria-label="Search complaints"
              />
            </div>

            {searchOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 glass-dark rounded-xl z-50 max-h-[70vh] overflow-y-auto">
                {/* Popular suggestions */}
                <div className="px-4 py-3 border-b border-white/15">
                  <p className="text-sm font-semibold text-white mb-2">
                    {i18n.language === 'bn' ? 'জনপ্রিয় অনুসন্ধান' : 'Popular right now'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {POPULAR_SEARCHES.map((s) => {
                      const label = i18n.language === 'bn' ? s.bn : s.en;
                      const active = query.trim() === (i18n.language === 'bn' ? s.bn : s.en);
                      return (
                        <button
                          key={s.en}
                          type="button"
                          onClick={() => handleSuggestion(i18n.language === 'bn' ? s.bn : s.en)}
                          className={`px-2.5 py-1 rounded-full text-xs transition-colors ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-white/15 text-slate-100 hover:bg-white/30'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Results shown only when there's a query */}
                {query.trim() && (
                  <div>
                    {searchLoading ? (
                      <p className="px-4 py-3 text-sm text-slate-300">{t('loading')}</p>
                    ) : results.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-slate-300">
                        {i18n.language === 'bn' ? 'কোনো ফলাফল নেই' : 'No results found'}
                      </p>
                    ) : (
                      results.map((r) => (
                        <button
                          key={r.trackingId}
                          onClick={() => handleSelect(r.trackingId)}
                          className="w-full text-left px-4 py-2.5 border-b border-white/15 hover:bg-gray-50 last:border-0"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs text-sky-300">{r.trackingId}</span>
                            <span className="text-xs text-slate-400">{r.status}</span>
                          </div>
                          <p className="text-sm text-slate-100 truncate">{r.description}</p>
                          <p className="text-xs text-slate-400">{r.category} · {r.area}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <button
            onClick={toggleLang}
            className="flex items-center gap-1 text-xs font-medium border border-gray-300 rounded-full px-2.5 py-1 bg-white hover:bg-gray-50"
            aria-label="Toggle language"
          >
            <span className={i18n.language === 'en' ? 'font-bold text-blue-700' : 'text-gray-500'}>En</span>
            <span className="text-gray-300">|</span>
            <span className={i18n.language === 'bn' ? 'font-bold text-blue-700' : 'text-gray-500'}>বাং</span>
          </button>

          {/* Notifications (staff only) */}
          {isStaff && (
            <div ref={notifRef} className="relative">
              <button
                onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
                className="relative text-lg sm:text-xl"
                aria-label="Notifications"
              >
                🔔
                {unread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center px-1">
                    {unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute top-full right-0 mt-1 w-80 glass-dark rounded-lg z-50 max-h-96 overflow-y-auto">
                  <div className="px-4 py-2 border-b border-white/15 font-semibold text-sm text-gray-800">
                    {i18n.language === 'bn' ? 'বিজ্ঞপ্তি' : 'Notifications'} ({unread})
                  </div>
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-slate-300 text-center">
                      {i18n.language === 'bn' ? 'কোনো বিজ্ঞপ্তি নেই' : 'No notifications'}
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => { setNotifOpen(false); navigate(`/track/${n.trackingId}`); }}
                        className="w-full text-left px-4 py-3 border-b border-white/15 hover:bg-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {n.type === 'escalation' ? '⚠️' : n.type === 'triage' ? '📋' : n.type === 'critical' ? '🚨' : '📢'}
                          </span>
                          <span className="font-medium text-sm text-white">{n.title}</span>
                        </div>
                        <p className="text-xs text-slate-300 mt-1">{n.message}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          {n.at ? new Date(n.at).toLocaleString() : ''}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Profile avatar + dropdown */}
          <div ref={profileRef} className="relative">
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="flex items-center gap-2 rounded-full hover:opacity-80 transition-opacity"
              aria-label="Profile menu"
              aria-expanded={profileOpen}
              title={name}
            >
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold text-white ${
                authState.user?.role === 'admin' ? 'bg-purple-600' : authState.user?.role === 'department' ? 'bg-blue-600' : 'bg-gray-500'
              }`}>
                {name[0]?.toUpperCase() || 'G'}
              </span>
            </button>

            {profileOpen && (
              <div className="absolute top-full right-0 mt-2 w-56 glass-dark rounded-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/15">
                  <p className="text-sm font-semibold text-white truncate">{name}</p>
                  <p className="text-xs text-slate-300 truncate">{authState.user?.email || (i18n.language === 'bn' ? ' Anonymous' : 'Anonymous')}</p>
                  <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{roleLabel}</span>
                </div>
                {authState.authed ? (
                  <>
                    <button
                      onClick={() => { setProfileOpen(false); navigate(isAdmin() ? '/dashboard/admin' : '/dashboard'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-white/10"
                    >
                      ▦ {i18n.language === 'bn' ? 'ড্যাশবোর্ড' : 'Dashboard'}
                    </button>
                    <button
                      onClick={() => { setProfileOpen(false); navigate('/track'); }}
                      className="w-full text-left px-4 py-2.5 text-sm text-slate-100 hover:bg-white/10"
                    >
                      ⌕ {i18n.language === 'bn' ? 'অভিযোগ ট্র্যাক' : 'Track Complaint'}
                    </button>
                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-300 hover:bg-red-500/20 border-t border-white/15"
                    >
                      ⏻ {i18n.language === 'bn' ? 'লগআউট' : 'Logout'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setProfileOpen(false); navigate('/login'); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-sky-300 hover:bg-white/10"
                  >
                    ⏻ {i18n.language === 'bn' ? 'স্টাফ লগইন' : 'Staff Login'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
