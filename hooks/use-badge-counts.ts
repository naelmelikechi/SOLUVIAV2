'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface BadgeCounts {
  facturesEnRetard: number;
  tempsNonSaisi: number;
  notifications: number;
  tachesEnAttente: number;
  intercontrat: number;
}

const INITIAL_COUNTS: BadgeCounts = {
  facturesEnRetard: 0,
  tempsNonSaisi: 0,
  notifications: 0,
  tachesEnAttente: 0,
  intercontrat: 0,
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
// Targeted fetch functions - one per badge type
// ---------------------------------------------------------------------------

const supabaseClient = () => createClient();

async function fetchFacturesCount(): Promise<number> {
  const res = await supabaseClient()
    .from('factures')
    .select('id', { count: 'exact', head: true })
    .eq('statut', 'en_retard');
  return res.count ?? 0;
}

async function fetchTempsCount(): Promise<number> {
  const res = await supabaseClient()
    .from('saisies_temps')
    .select('date')
    .gte('date', getMondayISO())
    .lte('date', getFridayISO());
  const uniqueDays = new Set((res.data ?? []).map((s) => s.date));
  return Math.max(0, getBusinessDaysElapsed() - uniqueDays.size);
}

async function fetchNotificationsCount(): Promise<number> {
  const res = await supabaseClient()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  return res.count ?? 0;
}

async function fetchQualiteCount(): Promise<number> {
  const res = await supabaseClient()
    .from('taches_qualite')
    .select('id', { count: 'exact', head: true })
    .eq('fait', false);
  return res.count ?? 0;
}

/**
 * Compte les collaborateurs en intercontrat (CDP actifs sans pipeline_access
 * ni projet client). RLS limite l acces a admin/superadmin (qui sont admin
 * du systeme) - le badge ne s affiche que pour eux dans la sidebar.
 */
async function fetchIntercontratCount(): Promise<number> {
  const supabase = supabaseClient();

  const usersRes = await supabase
    .from('users')
    .select('id, role, pipeline_access')
    .eq('actif', true)
    .eq('role', 'cdp');

  const candidates = (usersRes.data ?? []).filter((u) => !u.pipeline_access);
  if (candidates.length === 0) return 0;

  const projetsRes = await supabase
    .from('projets')
    .select('cdp_id, backup_cdp_id')
    .eq('archive', false)
    .eq('est_interne', false);

  const assigned = new Set<string>();
  for (const p of projetsRes.data ?? []) {
    if (p.cdp_id) assigned.add(p.cdp_id);
    if (p.backup_cdp_id) assigned.add(p.backup_cdp_id);
  }

  return candidates.filter((u) => !assigned.has(u.id)).length;
}

/** Fetch all badge counts at once (used for initial load). */
async function fetchAllBadgeCounts(): Promise<BadgeCounts> {
  const [
    facturesEnRetard,
    tempsNonSaisi,
    notifications,
    tachesEnAttente,
    intercontrat,
  ] = await Promise.all([
    fetchFacturesCount(),
    fetchTempsCount(),
    fetchNotificationsCount(),
    fetchQualiteCount(),
    fetchIntercontratCount(),
  ]);

  return {
    facturesEnRetard,
    tempsNonSaisi,
    notifications,
    tachesEnAttente,
    intercontrat,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

let channelCounter = 0;

export function useBadgeCounts(): BadgeCounts {
  const [counts, setCounts] = useState<BadgeCounts>(INITIAL_COUNTS);
  const mountedRef = useRef(true);
  const channelIdRef = useRef(`sidebar-badges-${++channelCounter}`);

  // Targeted updaters - only re-fetch the count that changed
  const refreshAll = useCallback(() => {
    fetchAllBadgeCounts().then((next) => {
      if (mountedRef.current) setCounts(next);
    });
  }, []);

  const refreshFactures = useCallback(() => {
    fetchFacturesCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, facturesEnRetard: v }));
    });
  }, []);

  const refreshNotifications = useCallback(() => {
    fetchNotificationsCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, notifications: v }));
    });
  }, []);

  const refreshTemps = useCallback(() => {
    fetchTempsCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, tempsNonSaisi: v }));
    });
  }, []);

  const refreshQualite = useCallback(() => {
    fetchQualiteCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, tachesEnAttente: v }));
    });
  }, []);

  const refreshIntercontrat = useCallback(() => {
    fetchIntercontratCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, intercontrat: v }));
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // Initial fetch - all counts at once.
    refreshAll();

    // Subscribe to Realtime changes - only refresh the relevant badge.
    // Wrapped in try/catch so a broken WebSocket doesn't crash the app.
    let channel: ReturnType<ReturnType<typeof createClient>['channel']> | null =
      null;
    let supabase: ReturnType<typeof createClient> | null = null;

    try {
      supabase = createClient();
      channel = supabase
        .channel(channelIdRef.current)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'factures' },
          () => refreshFactures(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          () => refreshNotifications(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'saisies_temps' },
          () => refreshTemps(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'taches_qualite' },
          () => refreshQualite(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'projets' },
          () => refreshIntercontrat(),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'users' },
          () => refreshIntercontrat(),
        )
        .subscribe();
    } catch {
      // Realtime unavailable (e.g. bad API key) - badges still work via initial fetch
    }

    return () => {
      mountedRef.current = false;
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    refreshAll,
    refreshFactures,
    refreshNotifications,
    refreshTemps,
    refreshQualite,
    refreshIntercontrat,
  ]);

  return counts;
}
