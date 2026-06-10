import { useState } from 'react';
import { LogIn, UserPlus, Loader2 } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuthStore } from '../store/useAuthStore';
import { auth } from '../lib/firebase/client';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

type AuthMode = 'signin' | 'signup';

export function SignIn() {
  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState({ email: '', password: '', displayName: '', general: '' });
  const [googleLoading, setGoogleLoading] = useState(false);

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
        // Don't navigate - let App.tsx routing handle it
      } catch (error) {
        // Error is handled by the store
        setErrors(prev => ({
          ...prev,
          general: error instanceof Error ? error.message : 'Authentication failed'
        }));
      }
    }
  };

  const handleGoogleSignIn = async () => {
    if (googleLoading) return; // Prevent double-clicks

    console.log('[SIGNIN] Button clicked - calling signInWithPopup directly');
    setGoogleLoading(true);

    try {
      const provider = new GoogleAuthProvider();
      console.log('[SIGNIN] Provider created, calling signInWithPopup...');
      const result = await signInWithPopup(auth, provider);
      console.log('[SIGNIN] Success! User:', result.user.email);
    } catch (error: any) {
      console.error('[SIGNIN] Error:', error.code, error.message);
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        alert('Error: ' + error.code + ' - ' + error.message);
      }
    } finally {
      setGoogleLoading(false);
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

          {/* Divider */}
          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-gray-600"></div>
            <span className="px-4 text-sm text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-600"></div>
          </div>

          {/* Google Sign-In */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading || googleLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-600 bg-white px-4 py-3 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Continue with Google
          </button>

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
            <p>Your data is securely stored in Firebase</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Built with React + TypeScript + Firebase</p>
        </div>
      </div>
    </div>
  );
}
