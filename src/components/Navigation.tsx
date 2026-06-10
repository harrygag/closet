import { Link, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Home, LogOut, TrendingUp, DollarSign, User, BookOpen, ChevronDown, Download, HelpCircle, Wrench, MessagesSquare, Facebook, Radio } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { openOnboarding } from '../lib/onboarding';

export const Navigation = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user } = useAuthStore();

  const navItems = [
    { path: '/closet', label: 'Inventory', icon: Home },
    { path: '/sales', label: 'Sales', icon: DollarSign },
    { path: '/messages', label: 'Messages', icon: MessagesSquare },
    { path: '/facebook', label: 'Facebook', icon: Facebook },
    { path: '/whatnot', label: 'Whatnot', icon: Radio },
    { path: '/import', label: 'Import', icon: Download },
    { path: '/tools', label: 'Tools', icon: Wrench },
    { path: '/marketplaces', label: 'Offers', icon: TrendingUp },
  ];

  // The unified import page lives at /import; deep-links use /import?platform=X
  // so `startsWith('/import')` keeps the nav lit even on the legacy /import/csv.
  const isActive = (path: string) =>
    path === '/import' ? location.pathname.startsWith('/import') : location.pathname === path;

  // Two-char monogram for the avatar circle.
  const initials = (() => {
    const e = user?.email || '';
    const local = e.split('@')[0] || '';
    return (local.slice(0, 2) || '?').toUpperCase();
  })();

  return (
    <nav className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-xl border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/closet" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
              <span className="text-xl">📦</span>
            </div>
            <span className="text-xl font-bold text-gray-100 hidden sm:block">
              Inventory Manager
            </span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200 ${
                  isActive(path)
                    ? 'bg-blue-600 text-white font-medium'
                    : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden lg:inline font-medium">{label}</span>
              </Link>
            ))}

            {/* Onboarding tour replay — auto-opens for new users; this re-launches it. */}
            {user && (
              <button
                type="button"
                onClick={openOnboarding}
                className="ml-2 flex items-center gap-1 px-2 py-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-all duration-200"
                title="Replay the onboarding tour"
                aria-label="Replay onboarding"
              >
                <HelpCircle className="h-5 w-5" />
              </button>
            )}

            {/* Profile dropdown — replaces inline email + signout. Same Radix Dialog
                primitive style other parts of the app use (modals etc.). */}
            {user && (
              <div className="ml-2 pl-2 border-l border-gray-800">
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-2 px-2 py-2 rounded-lg text-gray-300 hover:text-gray-100 hover:bg-gray-800 transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-500/50"
                      aria-label="Open profile menu"
                    >
                      <span className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-600 to-blue-700 text-white text-[11px] font-bold flex items-center justify-center">
                        {initials}
                      </span>
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    </button>
                  </DropdownMenu.Trigger>

                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={6}
                      className="z-[1100] min-w-[220px] rounded-xl border border-gray-700 bg-gray-900/95 backdrop-blur-xl shadow-2xl p-1.5 text-sm text-gray-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
                    >
                      {/* Header: profile — shows email + a "view profile" cue. Non-navigating
                          for now since there's no dedicated /profile route. */}
                      <div className="px-3 py-2 border-b border-gray-800 mb-1">
                        <div className="flex items-center gap-2.5">
                          <span className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-600 to-blue-700 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                            {initials}
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] uppercase tracking-wider text-gray-500">Signed in as</div>
                            <div className="text-gray-100 text-xs truncate">{user.email}</div>
                          </div>
                        </div>
                      </div>

                      <DropdownMenu.Item
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-200 hover:bg-gray-800 focus:bg-gray-800 outline-none cursor-default data-[disabled]:opacity-40 data-[disabled]:cursor-not-allowed"
                        disabled
                      >
                        <User className="h-4 w-4 text-gray-400" />
                        <span className="flex-1">Profile</span>
                        <span className="text-[10px] text-gray-500">soon</span>
                      </DropdownMenu.Item>

                      <DropdownMenu.Item
                        onSelect={() => navigate('/docs')}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-gray-200 hover:bg-gray-800 focus:bg-gray-800 outline-none cursor-pointer"
                      >
                        <BookOpen className="h-4 w-4 text-gray-400" />
                        <span className="flex-1">Docs</span>
                      </DropdownMenu.Item>

                      <DropdownMenu.Separator className="h-px bg-gray-800 my-1" />

                      <DropdownMenu.Item
                        onSelect={() => signOut()}
                        className="flex items-center gap-2 px-3 py-2 rounded-md text-red-300 hover:bg-red-900/30 focus:bg-red-900/30 outline-none cursor-pointer"
                      >
                        <LogOut className="h-4 w-4" />
                        <span className="flex-1">Sign out</span>
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};
