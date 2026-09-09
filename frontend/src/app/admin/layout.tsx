import React from 'react';

/**
 * Neutral Root Admin Layout (Phase 4 Constraint 5).
 * Has ZERO auth guards, ZERO redirects, and ZERO admin chrome/sidebars.
 * Both (auth) and (protected) route groups are nested here without collisions.
 * Protected shell logic lives exclusively in admin/(protected)/layout.tsx.
 */
export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
