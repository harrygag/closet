import { useState } from 'react';
import { LogIn, UserPlus, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuthStore } from '../store/useAuthStore';

type AuthMode = 'signin' | 'signup';

export function SignIn() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '', displayName: '', general: '' });
  
  const { signIn, signUp, isLoading, error: authError, clearError } = useAuthStore();

  const validateForm = (): boolean => {
    const newErrors = { email: '', password: '', displayName: '', general: '' };
    let isValid = true;

    if (!email.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
      isValid = false;
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
      isValid = false;
    } else if (password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
      isValid = false;
    }

    if (mode === 'signup' && !displayName.trim()) {
      newErrors.displayName = 'Display name is required';
      isValid = false;
    } else if (mode === 'signup' && displayName.trim().length < 2) {
      newErrors.displayName = 'Name must be at least 2 characters';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    
    if (validateForm()) {
      try {
        if (mode === 'signin') {
          await signIn(email.trim(), password);
        } else {
          await signUp(email.trim(), password, displayName.trim());
        }
      } catch (error) {
        // Error is handled by the store
        setErrors(prev => ({ 
          ...prev, 
          general: error instanceof Error ? error.message : 'Authentication failed' 
        }));
      }
    }
  };

  const switchMode = () => {
    setMode(mode === 'signin' ? 'signup' : 'signin');
    setErrors({ email: '', password: '', displayName: '', general: '' });
    clearError();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-pink-500">
            {mode === 'signin' ? (
              <LogIn className="h-8 w-8 text-white" />
            ) : (
              <UserPlus className="h-8 w-8 text-white" />
            )}
          </div>
          <h1 className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-4xl font-bold text-transparent">
            Virtual Closet
          </h1>
          <p className="mt-2 text-gray-400">
            Manage your apparel inventory with ease
          </p>
        </div>

        {/* Auth Form */}
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 backdrop-blur-sm">
          <h2 className="mb-6 text-2xl font-bold text-white">
            {mode === 'signin' ? 'Sign In' : 'Create Account'}
          </h2>
          
          {(authError || errors.general) && (
            <div className="mb-4 rounded-lg border border-red-500/50 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{authError || errors.general}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label htmlFor="displayName" className="mb-2 block text-sm font-medium text-gray-300">
                  Display Name
                </label>
                <Input
                  id="displayName"
                  type="text"
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={errors.displayName ? 'border-red-500' : ''}
                  disabled={isLoading}
                />
                {errors.displayName && (
                  <p className="mt-1 text-sm text-red-400">{errors.displayName}</p>
                )}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-gray-300">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={errors.email ? 'border-red-500' : ''}
                disabled={isLoading}
                autoComplete="email"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-300">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={errors.password ? 'border-red-500' : ''}
                disabled={isLoading}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-400">{errors.password}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {mode === 'signin' ? 'Signing In...' : 'Creating Account...'}
                </>
              ) : (
                <>
                  {mode === 'signin' ? (
                    <><LogIn className="mr-2 h-5 w-5" />Sign In</>
                  ) : (
                    <><UserPlus className="mr-2 h-5 w-5" />Create Account</>
                  )}
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={switchMode}
              className="text-sm text-purple-400 hover:text-purple-300 hover:underline"
              disabled={isLoading}
            >
              {mode === 'signin' 
                ? "Don't have an account? Sign up" 
                : 'Already have an account? Sign in'}
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-gray-400">
            <p>Your data is securely stored in Supabase</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Built with React + TypeScript + Supabase</p>
        </div>
      </div>
    </div>
  );
}
