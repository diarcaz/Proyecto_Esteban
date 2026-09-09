import { redirect } from 'next/navigation';

/**
 * Phase 4 Root Landing:
 * The system strictly separates /admin and /clock as independent portals.
 * Default traffic / tablet kiosk visitors land directly at /clock.
 * Administrative users navigate directly to /admin.
 */
export default function RootPage() {
  redirect('/clock');
}
