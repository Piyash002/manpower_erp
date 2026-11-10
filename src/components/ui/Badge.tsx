import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'gray';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({ children, variant = 'default', size = 'sm', className = '' }: BadgeProps) {
  const variantStyles = {
    default: 'bg-blue-50 text-blue-700 border-blue-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border-rose-200',
    info: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    gray: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'Active':
      return <Badge variant="success">Active</Badge>;
    case 'Passed':
      return <Badge variant="info">Passed</Badge>;
    case 'Failed':
      return <Badge variant="danger">Failed</Badge>;
    case 'Dropped':
      return <Badge variant="gray">Dropped</Badge>;
    case 'Paid':
      return <Badge variant="success">Paid</Badge>;
    case 'Partial':
      return <Badge variant="warning">Partial</Badge>;
    case 'Pending':
      return <Badge variant="gray">Pending</Badge>;
    case 'Overdue':
      return <Badge variant="danger">Overdue</Badge>;
    default:
      return <Badge variant="default">{status}</Badge>;
  }
}

