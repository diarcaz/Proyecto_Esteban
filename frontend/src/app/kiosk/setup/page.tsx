import { redirect } from 'next/navigation';

/**
 * Phase 4 Backward Compatibility Redirect:
 * Legacy /kiosk/setup traffic is redirected to /clock/setup.
 */
export default function KioskSetupRedirectPage() {
  redirect('/clock/setup');
}
