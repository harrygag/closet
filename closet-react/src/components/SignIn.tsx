import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { useAuthStore } from '../store/useAuthStore';

export function SignIn() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [errors, setErrors] = useState({ email: '', name: '' });
  const signIn = useAuthStore((state) => state.signIn);

  const validateForm = (): boolean => {
    const newErrors = { email: '', name: '' };
    let isValid = true;

    if (!email.trim()) {
      newErrors.email = 'Email is required';
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = 'Please enter a valid email';
      isValid = false;
    }

    if (!name.trim()) {
      newErrors.name = 'Name is required';
      isValid = false;
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (validateForm()) {
      signIn(email.trim(), name.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-black to-gray-900 px-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-full bg-gray-800 border-2 border-gray-600">
            <span className="text-5xl">⚡</span>
          </div>
          <h1 className="bg-gradient-to-r from-gray-300 via-white to-gray-400 bg-clip-text text-4xl font-bold text-transparent">
            Pokemon Closet Trainer
          </h1>
          <p className="mt-2 text-gray-400">
            Manage your Pokemon card collection
          </p>
        </div>

        {/* Sign In Form */}
        <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-8 backdrop-blur-sm">
          <h2 className="mb-6 text-2xl font-bold text-white">Sign In</h2>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="name" className="mb-2 block text-sm font-medium text-gray-300">
                Full Name
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={errors.name ? 'border-red-500' : ''}
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-400">{errors.name}</p>
              )}
            </div>

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
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-400">{errors.email}</p>
              )}
            </div>

            <Button type="submit" className="w-full" size="lg">
              <LogIn className="mr-2 h-5 w-5" />
              Sign In
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-400">
            <p>Your data is stored locally on your device</p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Built with React + TypeScript + Tailwind</p>
        </div>
      </div>
    </div>
  );
}
