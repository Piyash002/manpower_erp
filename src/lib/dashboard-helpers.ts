import type { AppRole } from '@/lib/jwt';

export type DateRangePreset = 'today' | 'week' | 'month' | 'year' | 'custom';

export const ADMISSION_DASHBOARD_ROLES: AppRole[] = ['Admin', 'Counselor'];
export const HRM_DASHBOARD_ROLES: AppRole[] = ['Admin', 'HR'];
export const ACCOUNTS_DASHBOARD_ROLES: AppRole[] = ['Admin', 'Accountant', 'Viewer'];

export type DashboardSection = 'admission' | 'hrm' | 'accounts';

export function getAllowedDashboards(role?: AppRole | string | null): DashboardSection[] {
  if (!role) return [];
  const allowed: DashboardSection[] = [];
  if (ADMISSION_DASHBOARD_ROLES.includes(role as AppRole)) allowed.push('admission');
  if (HRM_DASHBOARD_ROLES.includes(role as AppRole)) allowed.push('hrm');
  if (ACCOUNTS_DASHBOARD_ROLES.includes(role as AppRole)) allowed.push('accounts');
  return allowed;
}

export function getDefaultDashboardHref(role?: AppRole | string | null): string {
  const allowed = getAllowedDashboards(role);
  if (allowed.length === 1) {
    if (allowed[0] === 'admission') return '/admission/dashboard';
    if (allowed[0] === 'hrm') return '/hrm/dashboard';
    return '/accounts/dashboard';
  }
  if (allowed.length > 1) return '/';
  return '/payroll';
}

export interface ResolvedDateRange {
  preset: DateRangePreset;
  startDate: Date;
  endDate: Date;
  startIso: string;
  endIso: string;
  label: string;
}

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function resolveDateRange(
  presetInput?: string | null,
  customStartInput?: string | null,
  customEndInput?: string | null
): ResolvedDateRange {
  const now = new Date();
  const preset: DateRangePreset =
    presetInput === 'today' ||
    presetInput === 'week' ||
    presetInput === 'month' ||
    presetInput === 'year' ||
    presetInput === 'custom'
      ? presetInput
      : 'month';

  let startDate: Date;
  let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let label = 'This Month';

  if (preset === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    label = 'Today';
  } else if (preset === 'week') {
    const day = now.getDay(); // 0=Sun
    const diff = day === 0 ? 6 : day - 1; // Monday start
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0, 0);
    label = 'This Week';
  } else if (preset === 'year') {
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    label = `This Year (${now.getFullYear()})`;
  } else if (preset === 'custom' && (customStartInput || customEndInput)) {
    const parsedStart = customStartInput ? new Date(customStartInput) : new Date(now.getFullYear(), now.getMonth(), 1);
    const parsedEnd = customEndInput ? new Date(customEndInput) : now;
    startDate = Number.isNaN(parsedStart.getTime())
      ? new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
      : new Date(parsedStart.getFullYear(), parsedStart.getMonth(), parsedStart.getDate(), 0, 0, 0, 0);
    endDate = Number.isNaN(parsedEnd.getTime())
      ? endDate
      : new Date(parsedEnd.getFullYear(), parsedEnd.getMonth(), parsedEnd.getDate(), 23, 59, 59, 999);
    if (startDate > endDate) {
      const tmp = startDate;
      startDate = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 0, 0, 0, 0);
      endDate = new Date(tmp.getFullYear(), tmp.getMonth(), tmp.getDate(), 23, 59, 59, 999);
    }
    label = `${toIsoDate(startDate)} to ${toIsoDate(endDate)}`;
  } else {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    label = 'This Month';
  }

  return {
    preset,
    startDate,
    endDate,
    startIso: toIsoDate(startDate),
    endIso: toIsoDate(endDate),
    label,
  };
}

