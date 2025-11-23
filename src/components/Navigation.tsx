import { Link, useLocation } from 'react-router-dom';
import { Home, ShoppingBag, LogOut } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';

export const Navigation = () => {
  const location = useLocation();
  const { signOut, user } = useAuthStore();

  const navItems = [
    { path: '/closet', label: 'Inventory', icon: Home },
    { path: '/ebay', label: 'eBay', icon: ShoppingBag },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/closet" className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-xl">👔</span>
            </div>
            <span className="text-xl font-bold text-white hidden sm:block">Virtual Closet</span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-2">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive(path)
                    ? 'bg-purple-600 text-white'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}

            {/* User Menu */}
            {user && (
              <div className="flex items-center gap-2 ml-4 pl-4 border-l border-gray-800">
                <span className="text-gray-400 text-sm hidden md:inline">
                  {user.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="flex items-center gap-2 px-3 py-2 text-gray-400 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                  title="Sign Out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

