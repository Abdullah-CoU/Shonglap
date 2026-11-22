import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isAuthenticated, getUser, isAdmin, logout } from '../auth.js';

/**
 * Shared address bar / header used on every page.
 * Shows app identity, Dhaka address, language toggle, notifications, and profile.
 */
export default function Header({ compact = false }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  const toggleLang = () => i18n.changeLanguage(i18n.language === 'bn' ? 'en' : 'bn');
  const authed = isAuthenticated();
  const user = getUser();
  const homePath = authed ? (isAdmin() ? '/dashboard/admin' : '/dashboard') : '/';

  return (
    <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2.5 flex items-center justify-between gap-3">
        {/* Brand + Address */}
        <button
          onClick={() => navigate(homePath)}
          className="flex items-center gap-2.5 min-w-0 text-left"
        >
          <span className="text-2xl sm:text-3xl flex-shrink-0">🏛️</span>
          <div className="min-w-0">
            <div className="font-bold text-sm sm:text-base text-blue-900 truncate">
              {i18n.language === 'bn' ? 'শোনালাপ' : 'Shonglap'}
            </div>
            <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-500">
              <span>📍</span>
              <span className="truncate">
                {i18n.language === 'bn' ? 'ঢাকা, বাংলাদেশ' : 'Dhaka, Bangladesh'}
              </span>
            </div>
          </div>
        </button>

        {/* Center: address label on larger screens */}
        {!compact && (
          <div className="hidden md:flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5">
            <span className="text-gray-400">⌕</span>
            <span className="text-sm text-gray-600">
              {i18n.language === 'bn' ? 'আপনার এলাকার সমস্যা রিপোর্ট করুন' : 'Report your area problem'}
            </span>
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
          <button className="relative text-lg sm:text-xl" aria-label="Notifications">
            🔔<span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">1</span>
          </button>
          <button
            onClick={() => {
              if (authed) { logout(); navigate('/login'); }
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
