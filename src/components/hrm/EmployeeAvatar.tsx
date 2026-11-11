'use client';

import React, { useState } from 'react';

interface EmployeeAvatarProps {
  photoUrl?: string | null;
  firstName?: string;
  lastName?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const SIZE_CLASSES = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

export function EmployeeAvatar({
  photoUrl,
  firstName = '',
  lastName = '',
  size = 'md',
}: EmployeeAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const initials =
    `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`.toUpperCase() || 'EM';

  const normalizedUrl =
    photoUrl && photoUrl.startsWith('/uploads/')
      ? `/api${photoUrl}`
      : photoUrl;

  if (normalizedUrl && failedUrl !== normalizedUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={normalizedUrl}
        alt={`${firstName} ${lastName}`}
        onError={() => setFailedUrl(normalizedUrl)}
        className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-slate-200 shrink-0 bg-slate-100`}
      />
    );
  }

  return (
    <div
      className={`${SIZE_CLASSES[size]} rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center border border-emerald-200 shrink-0`}
    >
      {initials}
    </div>
  );
}
