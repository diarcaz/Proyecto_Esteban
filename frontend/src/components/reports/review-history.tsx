import { displayLabel } from '@/lib/display-labels';
import { correctionTime } from '@/lib/correction-ux';

export function ReviewHistory({ history = [], timezone }: { history?: any[]; timezone?: string }) {
  return <details className="mt-2"><summary className="cursor-pointer">History</summary>
    {!history.length ? <p className="p-2">No review history yet.</p> : <ol className="space-y-2 p-2">{[...history].sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt)).map(h=><li key={h.id}>
      <time title={h.createdAt}>{correctionTime(h.createdAt, timezone)}</time> · {h.actor ? `${h.actor.firstName} ${h.actor.lastName}` : 'Reviewer'} · Step {h.stepOrder} · {displayLabel(h.previousStatus)} → {displayLabel(h.newStatus)}{h.notes ? ` · ${h.notes}` : ''}
    </li>)}</ol>}
  </details>;
}
