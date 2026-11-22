import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthenticated, getUser, isAdmin, logout } from '../auth.js';

/**
 * Shared sidebar navigation, available on every route.
 * Highlights the active route and supports a mobile drawer.
 */
export default function Sidebar({ open, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n } = useTranslation();
  const isBn = i18n.language === 'bn';
  const authed = isAuthenticated();
  const user = getUser();

  const navItems = [
    { key: 'home', label: isBn ? 'হোম' : 'Home', icon: '⌂', path: '/' },
    { key: 'report', label: isBn ? 'অভিযোগ রিপোর্ট' : 'Report Complaint', icon: '✎', path: '/report' },
    { key: 'track', label: isBn ? 'অভিযোগ ট্র্যাক' : 'Track Complaint', icon: '⌕', path: '/track' },
    { key: 'analytics', label: isBn ? 'বিশ্লেষণ' : 'Analytics', icon: '▤', path: '/analytics' },
  ];

  if (authed) {
    navItems.push(
      { key: 'dashboard', label: isBn ? 'ড্যাশবোর্ড' : 'Dashboard', icon: '▦', path: '/dashboard' }
    );
    if (isAdmin()) {
      navItems.push({ key: 'admin', label: isBn ? 'অ্যাডমিন' : 'Admin', icon: '⚙', path: '/dashboard/admin' });
    }
  } else {
    navItems.push({ key: 'login', label: isBn ? 'স্টাফ লগইন' : 'Staff Login', icon: '⚿', path: '/login' });
  }

  const go = (path) => {
    navigate(path);
    if (onClose) onClose();
  };

  const isActive = (item) => {
    if (item.path === '/') return location.pathname === '/';
    return location.pathname.startsWith(item.path);
  };

  const handleLogout = () => {
    logout();
    go('/');
  };

  return (
    <>
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black bg-opacity-40 z-40 md:hidden" onClick={onClose} />}

      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-60 bg-blue-800 text-white flex flex-col flex-shrink-0 transform transition-transform duration-200 ${
        open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      }`}>
        <button onClick={() => go('/')} className="flex items-center gap-3 px-5 py-6 border-b border-blue-700 hover:bg-blue-700 text-left">
          <span className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center text-xl">🏛️</span>
          <div>
            <div className="font-bold text-lg">{isBn ? 'শোনালাপ' : 'Shonglap'}</div>
            <div className="text-xs text-blue-200">{isBn ? 'ঢাকা নাগরিক পোর্টাল' : 'Dhaka Civic Portal'}</div>
          </div>
        </button>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => go(item.path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                isActive(item) ? 'bg-white text-blue-800 shadow' : 'text-blue-100 hover:bg-blue-700'
              }`}
            >
              <span className="text-lg w-6 text-center">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-blue-700 space-y-2">
          {authed && (
            <div className="px-3 text-xs text-blue-200 truncate">
              {isBn ? 'ব্যবহারকারী' : 'Signed in'}: {user?.name || user?.email}
            </div>
          )}
          {authed && (
            <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2 rounded-lg text-sm text-red-200 hover:bg-blue-700">
              <span className="text-lg w-6 text-center">⏻</span>
              {isBn ? 'লগআউট' : 'Logout'}
            </button>
          )}
          <div className="px-3 text-xs text-blue-300">© 2026 Shonglap</div>
        </div>
      </aside>
    </>
  );
}
