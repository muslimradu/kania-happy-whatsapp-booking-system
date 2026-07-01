import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthContext } from '@/lib/AuthContext';

const NAV_ITEMS = [
  { to: '/payments',  label: 'Pembayaran',  icon: '💳' },
  { to: '/takeover',  label: 'Takeover',    icon: '👤' },
];

export function Sidebar() {
  const { username, logout } = useAuthContext();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="w-60 shrink-0 flex flex-col bg-white border-r border-surface-border min-h-screen">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-surface-border">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">💕</span>
          <div>
            <p className="font-bold text-primary-700 text-sm leading-tight">Kania Happy</p>
            <p className="text-xs text-gray-400">Admin Dashboard</p>
          </div>
        </div>
      </div>

      {/* Navigasi */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV_ITEMS.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer user */}
      <div className="px-3 py-4 border-t border-surface-border">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-gray-50 mb-1">
          <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-600">
            {username?.[0]?.toUpperCase() ?? 'A'}
          </div>
          <span className="text-sm font-medium text-gray-700 truncate">{username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500
                     hover:bg-red-50 hover:text-red-600 transition-colors"
        >
          <span>🚪</span> Keluar
        </button>
      </div>
    </aside>
  );
}
