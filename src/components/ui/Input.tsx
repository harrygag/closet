import React from 'react';
import { clsx } from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  error,
  className,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <input
        className={clsx(
          'w-full rounded-lg border bg-gray-800 px-3 py-2 text-white placeholder-gray-500 transition-colors',
          'focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500',
          error ? 'border-red-500' : 'border-gray-600',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const TextArea: React.FC<TextAreaProps> = ({
  label,
  error,
  className,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <textarea
        className={clsx(
          'w-full rounded-lg border bg-gray-800 px-3 py-2 text-white placeholder-gray-500 transition-colors',
          'focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500',
          error ? 'border-red-500' : 'border-gray-600',
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({
  label,
  error,
  options,
  className,
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <select
        className={clsx(
          'w-full rounded-lg border bg-gray-800 px-3 py-2 text-white transition-colors',
          'focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500',
          error ? 'border-red-500' : 'border-gray-600',
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
    </div>
  );
};
