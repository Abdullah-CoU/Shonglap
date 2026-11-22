import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser, logout, authHeaders } from '../auth.js';

const API_BASE = import.meta.env.VITE_API_URL || '';

/**
 * Shared header used on every page.
 * App icon + name navigate to Home. Functional search and staff notifications.
 */
export default function Header({ compact = false }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const searchRef = useRef(null);
  const notifRef = useRef(null);

  const authed = isAuthenticated();
  const user = getUser();
  const isStaff = authed && (user?.role === 'admin' || user?.role === 'department');

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');

  // Fetch notifications for staff
  useEffect(() => {
    if (!isStaff) return;
    fetch(`${API_BASE}/api/notifications`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setNotifications(data.notifications || []); })
      .catch(() => {});
  }, [isStaff]);

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
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (trackingId) => {
    setSearchOpen(false);
    setQuery('');
    navigate(`/track/${trackingId}`);
  };

  const unread = notifications.length;

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
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

            {searchOpen && query.trim() && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                {searchLoading ? (
                  <p className="px-4 py-3 text-sm text-gray-500">{t('loading')}</p>
                ) : results.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">
                    {i18n.language === 'bn' ? 'কোনো ফলাফল নেই' : 'No results found'}
                  </p>
                ) : (
                  results.map((r) => (
                    <button
                      key={r.trackingId}
                      onClick={() => handleSelect(r.trackingId)}
                      className="w-full text-left px-4 py-2.5 border-b border-gray-100 hover:bg-gray-50 last:border-0"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-blue-700">{r.trackingId}</span>
                        <span className="text-xs text-gray-400">{r.status}</span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">{r.description}</p>
                      <p className="text-xs text-gray-400">{r.category} · {r.area}</p>
                    </button>
                  ))
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
                onClick={() => setNotifOpen(!notifOpen)}
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
                <div className="absolute top-full right-0 mt-1 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  <div className="px-4 py-2 border-b border-gray-100 font-semibold text-sm text-gray-800">
                    {i18n.language === 'bn' ? 'বিজ্ঞপ্তি' : 'Notifications'} ({unread})
                  </div>
                  {notifications.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-gray-500 text-center">
                      {i18n.language === 'bn' ? 'কোনো বিজ্ঞপ্তি নেই' : 'No notifications'}
                    </p>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => { setNotifOpen(false); navigate(`/track/${n.trackingId}`); }}
                        className="w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 last:border-0"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-base">
                            {n.type === 'escalation' ? '⚠️' : n.type === 'triage' ? '📋' : n.type === 'critical' ? '🚨' : '📢'}
                          </span>
                          <span className="font-medium text-sm text-gray-800">{n.title}</span>
                        </div>
                        <p className="text-xs text-gray-600 mt-1">{n.message}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {n.at ? new Date(n.at).toLocaleString() : ''}
                        </p>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => {
              if (authed) { logout(); navigate('/'); }
              else navigate('/login');
            }}
            className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold"
            aria-label="Profile"
            title={authed ? user?.name || 'Logout' : 'Login'}
          >
            {authed ? (user?.name?.[0] || 'U') : 'S'}
          </button>
        </div>
      </div>
    </header>
  );
}
