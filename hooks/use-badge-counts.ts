'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface BadgeCounts {
  facturesEnRetard: number;
  tempsNonSaisi: number;
  notifications: number;
  tachesEnAttente: number;
}

const INITIAL_COUNTS: BadgeCounts = {
  facturesEnRetard: 0,
  tempsNonSaisi: 0,
  notifications: 0,
  tachesEnAttente: 0,
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

/** Returns the Monday of the current week as YYYY-MM-DD. */
function getMondayISO(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = Sun, 1 = Mon, …
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

/** Returns the Friday of the current week as YYYY-MM-DD. */
function getFridayISO(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -2 : 5 - day;
  const friday = new Date(now);
  friday.setDate(now.getDate() + diff);
  return friday.toISOString().slice(0, 10);
}

/**
 * Returns the number of business days (Mon-Fri) elapsed this week, including
 * today. On Saturday/Sunday it returns 5 (the full work-week).
 */
function getBusinessDaysElapsed(): number {
  const day = new Date().getDay(); // 0 = Sun … 6 = Sat
  if (day === 0) return 5; // Sunday  → full week
  if (day === 6) return 5; // Saturday → full week
  return day; // Mon=1 … Fri=5
}

// ---------------------------------------------------------------------------
// Core fetch logic (returns a Promise so callers can use .then())
// ---------------------------------------------------------------------------

async function fetchBadgeCounts(): Promise<BadgeCounts> {
  const supabase = createClient();

  const [facturesRes, tempsRes, notifRes, tachesRes] = await Promise.all([
    supabase
      .from('factures')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'en_retard'),

    // Get the dates this week that already have time entries for the user.
    // RLS ensures we only see the current user's rows.
    supabase
      .from('saisies_temps')
      .select('date')
      .gte('date', getMondayISO())
      .lte('date', getFridayISO()),

    // Unread notifications for the current user (RLS-filtered).
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null),

    // Quality tasks not yet completed.
    supabase
      .from('taches_qualite')
      .select('id', { count: 'exact', head: true })
      .eq('fait', false),
  ]);

  const uniqueDays = new Set((tempsRes.data ?? []).map((s) => s.date));
  const businessDaysElapsed = getBusinessDaysElapsed();

  return {
    facturesEnRetard: facturesRes.count ?? 0,
    tempsNonSaisi: Math.max(0, businessDaysElapsed - uniqueDays.size),
    notifications: notifRes.count ?? 0,
    tachesEnAttente: tachesRes.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBadgeCounts(): BadgeCounts {
  const [counts, setCounts] = useState<BadgeCounts>(INITIAL_COUNTS);
  const mountedRef = useRef(true);

  const refresh = useCallback(() => {
    fetchBadgeCounts().then((next) => {
      if (mountedRef.current) setCounts(next);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch — setState happens inside .then(), not synchronously.
    refresh();

    // Subscribe to Realtime changes so badges stay up-to-date.
    const supabase = createClient();

    const channel = supabase
      .channel('sidebar-badges')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'factures' },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications' },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saisies_temps' },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'taches_qualite' },
        () => refresh(),
      )
      .subscribe();

    return () => {
      mountedRef.current = false;
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return counts;
}
