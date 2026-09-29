import type { ApplicationStatus } from '../../types/api';

export const applicationStatuses: { value: ApplicationStatus; label: string }[] = [
  { value: 'not_applied', label: 'Not applied' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'offer', label: 'Offer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export function statusLabel(status: ApplicationStatus): string {
  return applicationStatuses.find((item) => item.value === status)?.label ?? status;
}
