import { branchDate } from './staff-ux';

export function correctionTime(value: string, timezone?: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time unavailable';
  try { return branchDate(value, timezone || 'UTC'); }
  catch { return branchDate(value, 'UTC') + ' UTC'; }
}

// Map only known validation failures; never render arbitrary backend exception text.
export function correctionError(error: any, type: string) {
  const message = String(error?.message || '');
  if (message.includes('Effective CLOCK_OUT must be after effective CLOCK_IN')) {
    return type === 'INCORRECT_CLOCK_IN'
      ? 'This correction cannot be approved. The proposed Clock In would occur at or after the current Clock Out. Choose an earlier Clock In time or correct the Clock Out first.'
      : 'This correction cannot be approved. The proposed Clock Out would occur at or before the current Clock In. Choose a later Clock Out time or correct the Clock In first.';
  }
  if (message.includes('conflicts with recorded lunch/break punches')) return 'This correction cannot be approved because the proposed shift excludes recorded lunch or break times. Review the surrounding attendance first.';
  if (message.includes('overlapping WorkShift')) return 'This correction cannot be approved because the proposed times overlap another shift. Review the surrounding attendance first.';
  if (message.includes('no active assignment')) return 'This correction cannot be approved because the Staff member had no active assignment at the proposed Clock In time.';
  if (error?.status === 403) return 'You do not have permission for this correction action. Refresh the review or contact your Company Administrator.';
  return 'The correction action could not be completed. Check the verified time, reason and reviewer comments, then refresh the review before retrying.';
}
