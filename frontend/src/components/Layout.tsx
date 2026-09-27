import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useThemeStore } from '../store/themeStore';
import api from '../services/api';
import { assetUrl } from '../constants/assets';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import {
  LayoutDashboard, Mail, FileText, Users, Settings, LogOut,
  ChevronLeft, Menu, X, ImageIcon
} from 'lucide-react';

const mainNav = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/campaigns', icon: Mail, label: 'Campaigns' },
  { to: '/templates', icon: FileText, label: 'Templates' },
];

const adminNav = [
  { to: '/assets', icon: ImageIcon, label: 'Assets' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Layout() {
  const { user, isAuthenticated, logout } = useAuthStore();
  const appName = useThemeStore(s => s.appName);
  const logoUrl = useThemeStore(s => s.logoUrl);
  const iconUrl = useThemeStore(s => s.iconUrl);
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } finally { logout(); }
  };

  const isActive = (to: string) =>
    location.pathname === to || (to !== '/' && location.pathname.startsWith(to));

  const initials = user?.full_name
    ?.split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || '?';

  const NavLink = ({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) => (
    <Link
      to={to}
      onClick={() => setMobileOpen(false)}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
        isActive(to)
          ? 'bg-white/15 text-white shadow-sm shadow-white/5'
          : 'text-brand-200 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon size={18} className={`flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${isActive(to) ? 'text-white' : ''}`} />
      {!collapsed && <span className="truncate">{label}</span>}
      {isActive(to) && !collapsed && (
        <motion.div
          layoutId="nav-indicator"
          className="ml-auto w-1.5 h-1.5 rounded-full bg-highlight"
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      )}
    </Link>
  );

  const SidebarContent = () => (
    <>
      {/* Logo: on a white plate, since the wordmark is dark blue */}
      <div className={`py-4 ${collapsed ? 'px-3 flex justify-center' : 'px-4'}`}>
        <Link
          to="/"
          aria-label={`${appName} home`}
          className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          {collapsed ? (
            <img src={assetUrl(iconUrl)} alt="" className="w-10 h-10 rounded-full bg-white shadow-lg shadow-black/20" />
          ) : (
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-lg shadow-black/20 border-b-[3px] border-highlight">
              <img src={assetUrl(logoUrl)} alt={appName} className="w-full h-auto max-h-16 object-contain" />
            </div>
          )}
        </Link>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3 py-2 space-y-1">
        {!collapsed && (
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
            Main
          </div>
        )}
        {mainNav.map(item => <NavLink key={item.to} {...item} />)}

        {user?.role === 'admin' && (
          <>
            {!collapsed && (
              <div className="px-3 pt-4 pb-2 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                Admin
              </div>
            )}
            {collapsed && <div className="my-3 mx-3 border-t border-white/10" />}
            {adminNav.map(item => <NavLink key={item.to} {...item} />)}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="px-3 pb-4 pt-2 border-t border-white/10 mt-auto">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3 px-3'}`}>
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-500 flex items-center justify-center text-white text-xs font-bold shadow-md flex-shrink-0">
            {initials}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user?.full_name}</div>
              <div className="text-[11px] text-brand-300 truncate">{user?.email}</div>
            </div>
          )}
          {!collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              className="p-2 text-brand-200 hover:text-white hover:bg-white/10 rounded-lg transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              title="Logout"
              aria-label="Log out"
            >
              <LogOut size={15} />
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-gray-50/80">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:flex flex-col fixed inset-y-0 left-0 z-30 bg-gradient-to-b from-brand-900 via-brand-800 to-brand-950 transition-all duration-300 ${
          collapsed ? 'w-[72px]' : 'w-64'
        }`}
      >
        <SidebarContent />
        {/* Collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-8 w-6 h-6 bg-white border border-gray-200 rounded-full shadow-md flex items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          <ChevronLeft size={12} className={`text-gray-600 transition-transform duration-300 ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </aside>

      {/* Mobile Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-64 bg-gradient-to-b from-brand-900 via-brand-800 to-brand-950 z-50 flex flex-col lg:hidden"
            >
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 text-brand-200 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                aria-label="Close navigation menu"
              >
                <X size={18} />
              </button>
              <SidebarContent />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className={`flex-1 min-h-screen transition-all duration-300 ${collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'}`}>
        {/* Mobile Header */}
        <div className="lg:hidden sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-gray-200/50 px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            aria-label="Open navigation menu"
            aria-expanded={mobileOpen}
          >
            <Menu size={20} className="text-gray-700" />
          </button>
          <img src={assetUrl(logoUrl)} alt={appName} className="h-8 w-auto" />
        </div>

        {/* Page Content with animation */}
        <div className={location.pathname.includes('/campaigns/') && location.pathname.includes('/edit') || location.pathname === '/campaigns/new'
          ? 'h-full overflow-hidden'
          : 'p-4 sm:p-6 lg:p-8'
        }>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className={location.pathname.includes('/campaigns/') && location.pathname.includes('/edit') || location.pathname === '/campaigns/new' ? 'h-full' : ''}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
