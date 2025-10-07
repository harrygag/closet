// Utility functions for formatting data

export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
};

export const formatRelativeDate = (dateString: string): string => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    if (diffInDays < 365) return `${Math.floor(diffInDays / 30)} months ago`;
    return `${Math.floor(diffInDays / 365)} years ago`;
  } catch {
    return '';
  }
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
};

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Active':
      return 'bg-green-500';
    case 'Inactive':
      return 'bg-yellow-500';
    case 'SOLD':
      return 'bg-blue-500';
    default:
      return 'bg-gray-500';
  }
};

export const getTagColor = (tag: string): string => {
  const colors: Record<string, string> = {
    'Hoodie': 'bg-purple-500',
    'Jersey': 'bg-red-500',
    'polo': 'bg-blue-500',
    'Pullover/Jackets': 'bg-green-500',
    'T-shirts': 'bg-yellow-500',
    'Bottoms': 'bg-orange-500',
  };
  return colors[tag] || 'bg-gray-500';
};
