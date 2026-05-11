'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  currentMondayLocalISO,
  currentFridayLocalISO,
} from '@/lib/utils/dates';

export interface BadgeCounts {
  facturesEnRetard: number;
  tempsNonSaisi: number;
  notifications: number;
  intercontrat: number;
  bugsNouveaux: number;
}

const INITIAL_COUNTS: BadgeCounts = {
  facturesEnRetard: 0,
  tempsNonSaisi: 0,
  notifications: 0,
  intercontrat: 0,
  bugsNouveaux: 0,
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
// Les helpers sont dans lib/utils/dates.ts pour eviter le piege TZ documente
// dans ce fichier (toISOString = UTC, qui shift d'un jour cote Europe/Paris).

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
    .gte('date', currentMondayLocalISO())
    .lte('date', currentFridayLocalISO());
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

/**
 * Compte les bugs "ouverts" (status nouveau OU en_cours) non archives.
 * Aligne avec l'onglet "Ouverts" de /admin/bugs : un bug reste dans le
 * badge tant qu'il n'est pas ferme (resolu/wontfix). RLS limite l acces
 * a admin/superadmin ; pour les autres le count remonte 0 (et le badge
 * n'est pas affiche dans la sidebar car l'item Bugs est adminOnly).
 */
async function fetchBugsCount(): Promise<number> {
  const res = await supabaseClient()
    .from('bug_reports')
    .select('id', { count: 'exact', head: true })
    .in('status', ['nouveau', 'en_cours'])
    .eq('archive', false);
  return res.count ?? 0;
}

/** Fetch all badge counts at once (used for initial load). */
async function fetchAllBadgeCounts(): Promise<BadgeCounts> {
  const [
    facturesEnRetard,
    tempsNonSaisi,
    notifications,
    intercontrat,
    bugsNouveaux,
  ] = await Promise.all([
    fetchFacturesCount(),
    fetchTempsCount(),
    fetchNotificationsCount(),
    fetchIntercontratCount(),
    fetchBugsCount(),
  ]);

  return {
    facturesEnRetard,
    tempsNonSaisi,
    notifications,
    intercontrat,
    bugsNouveaux,
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

  const refreshIntercontrat = useCallback(() => {
    fetchIntercontratCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, intercontrat: v }));
    });
  }, []);

  const refreshBugs = useCallback(() => {
    fetchBugsCount().then((v) => {
      if (mountedRef.current)
        setCounts((prev) => ({ ...prev, bugsNouveaux: v }));
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

    // Debounce 2s pour eviter le storm de re-fetch sur des bursts d'evenements
    // (ex. saisies_temps ecrit toutes les 2s par utilisateur). Voir audit I4.
    const debouncers: Record<string, ReturnType<typeof setTimeout> | null> = {
      factures: null,
      notifications: null,
      temps: null,
      intercontrat: null,
      bugs: null,
    };
    const debouncedRefresh = (key: keyof typeof debouncers, fn: () => void) => {
      if (debouncers[key]) clearTimeout(debouncers[key]!);
      debouncers[key] = setTimeout(() => {
        if (mountedRef.current) fn();
      }, 2000);
    };

    try {
      supabase = createClient();
      channel = supabase
        .channel(channelIdRef.current)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'factures' },
          () => debouncedRefresh('factures', refreshFactures),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'notifications' },
          () => debouncedRefresh('notifications', refreshNotifications),
        )
        // saisies_temps : narrow a INSERT/DELETE. Le badge "tempsNonSaisi"
        // compte les jours AVEC ou SANS row, donc UPDATE de heures n'a aucun
        // impact (et l'auto-save 2s genere des dizaines d'UPDATE par session).
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'saisies_temps' },
          () => debouncedRefresh('temps', refreshTemps),
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'saisies_temps' },
          () => debouncedRefresh('temps', refreshTemps),
        )
        // intercontrat : narrow aux changements qui peuvent affecter le
        // count. Seuls les projets clients non archives entrent dans le
        // calcul (lib/queries cote fetchIntercontratCount), et seuls les
        // users role=cdp sont candidats. Filtrer reduit le bruit WS.
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'projets',
            filter: 'est_interne=eq.false',
          },
          () => debouncedRefresh('intercontrat', refreshIntercontrat),
        )
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'users',
            filter: 'role=eq.cdp',
          },
          () => debouncedRefresh('intercontrat', refreshIntercontrat),
        )
        // bug_reports : un nouveau bug (INSERT) ou un changement de statut
        // (UPDATE) peut modifier le compte des "ouverts" (nouveau + en_cours).
        // RLS empeche les non-admin de recevoir des events, donc safe a
        // abonner globalement.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bug_reports' },
          () => debouncedRefresh('bugs', refreshBugs),
        )
        .subscribe();
    } catch {
      // Realtime unavailable (e.g. bad API key) - badges still work via initial fetch
    }

    return () => {
      mountedRef.current = false;
      Object.values(debouncers).forEach((t) => {
        if (t) clearTimeout(t);
      });
      if (supabase && channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [
    refreshAll,
    refreshFactures,
    refreshNotifications,
    refreshTemps,
    refreshIntercontrat,
    refreshBugs,
  ]);

  return counts;
}
