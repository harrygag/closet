// Utility functions for consistent number and currency formatting

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

export const formatPercent = (value: number): string => {
  return `${value > 0 ? '+' : ''}${value}%`;
};

export const formatNumber = (value: number): string => {
  return new Intl.NumberFormat('en-US').format(value);
};

export const formatDays = (days: number): string => {
  if (days === 0) return 'Today';
  if (days === 1) return '1 day';
  return `${days} days`;
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Active': return 'text-green-400';
    case 'Inactive': return 'text-red-400';
    case 'SOLD': return 'text-blue-400';
    default: return 'text-gray-400';
  }
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};
