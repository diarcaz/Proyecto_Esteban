import { redirect } from 'next/navigation';

/**
 * Phase 4 Backward Compatibility Redirect:
 * Legacy /kiosk traffic is redirected to the authoritative /clock portal.
 */
export default function KioskRedirectPage() {
  redirect('/clock');
}
