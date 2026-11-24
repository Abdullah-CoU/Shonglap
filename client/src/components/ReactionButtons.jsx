import { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';
const storageKey = (trackingId) => `shonglap:reaction:${trackingId}`;

function readStoredVote(trackingId) {
  try {
    const value = localStorage.getItem(storageKey(trackingId));
    return value === 'up' || value === 'down' ? value : '';
  } catch {
    return '';
  }
}

/**
 * Upvote/downvote control for a complaint. The voter's choice is kept
 * locally (anonymous allowed) so they can toggle it on/off.
 */
export default function ReactionButtons({ trackingId, upvotes = 0, downvotes = 0, compact = false }) {
  const [vote, setVote] = useState(() => readStoredVote(trackingId));
  const [counts, setCounts] = useState({ up: upvotes, down: downvotes });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCounts({ up: upvotes, down: downvotes });
  }, [upvotes, downvotes]);

  const handleReact = async (event, type) => {
    event.stopPropagation();
    event.preventDefault();
    if (busy) return;

    const previousVote = vote;
    const nextVote = vote === type ? '' : type;
    const action = nextVote ? 'add' : 'remove';

    // Optimistic update
    const next = { up: counts.up, down: counts.down };
    if (previousVote === 'up') next.up -= 1;
    if (previousVote === 'down') next.down -= 1;
    if (nextVote === 'up') next.up += 1;
    if (nextVote === 'down') next.down += 1;
    setCounts({ up: Math.max(0, next.up), down: Math.max(0, next.down) });
    setVote(nextVote);
    try { localStorage.setItem(storageKey(trackingId), nextVote); } catch { /* ignore */ }
    setBusy(true);

    const send = async (reactionType, reactionAction) => {
      const res = await fetch(`${API_BASE}/api/complaints/${trackingId}/react`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: reactionType, action: reactionAction }),
      });
      if (!res.ok) throw new Error('Reaction failed');
      return res.json();
    };

    try {
      // Switching sides removes the previous vote first.
      if (previousVote && previousVote !== type) {
        await send(previousVote, 'remove');
      }
      if (nextVote) await send(type, action);
      else if (previousVote) await send(previousVote, 'remove');

      // Re-read authoritative counts from the track endpoint.
      const fresh = await fetch(`${API_BASE}/api/complaints/track/${trackingId}`);
      if (fresh.ok) {
        const data = await fresh.json();
        setCounts({ up: data.upvotes || 0, down: data.downvotes || 0 });
      }
    } catch {
      // Roll back on failure
      setCounts({ up: upvotes, down: downvotes });
      setVote(previousVote);
      try {
        if (previousVote) localStorage.setItem(storageKey(trackingId), previousVote);
        else localStorage.removeItem(storageKey(trackingId));
      } catch { /* ignore */ }
    } finally {
      setBusy(false);
    }
  };

  const size = compact ? 'text-sm px-1.5 py-1 gap-1' : 'text-base px-3 py-2 gap-2';

  return (
    <div className={`inline-flex items-center ${size} rounded-lg`} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={busy}
        aria-label="Up vote"
        title="Up vote"
        onClick={(e) => handleReact(e, 'up')}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
          vote === 'up' ? 'bg-green-100 ring-1 ring-green-400' : 'hover:bg-green-50'
        }`}
      >
        <span aria-hidden="true">👍</span>
        <span className="tabular-nums text-gray-700">{counts.up}</span>
      </button>
      <button
        type="button"
        disabled={busy}
        aria-label="Down vote"
        title="Down vote"
        onClick={(e) => handleReact(e, 'down')}
        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors disabled:opacity-50 ${
          vote === 'down' ? 'bg-red-100 ring-1 ring-red-400' : 'hover:bg-red-50'
        }`}
      >
        <span aria-hidden="true">👎</span>
        <span className="tabular-nums text-gray-700">{counts.down}</span>
      </button>
    </div>
  );
}
