'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  currentMondayLocalISO,
  currentFridayLocalISO,
  toLocalISODate,
  businessDaysElapsedThisWeek,
} from '@/lib/utils/dates';
import { logger } from '@/lib/utils/logger';

export interface BadgeCounts {
  facturesEnRetard: number;
  tempsNonSaisi: number;
  notifications: number;
  intercontrat: number;
  bugsNouveaux: number;
  contratsAFacturer: number;
}

const INITIAL_COUNTS: BadgeCounts = {
  facturesEnRetard: 0,
  tempsNonSaisi: 0,
  notifications: 0,
  intercontrat: 0,
  bugsNouveaux: 0,
  contratsAFacturer: 0,
};

// ---------------------------------------------------------------------------
// Targeted fetch functions - one per badge type
// ---------------------------------------------------------------------------

const supabaseClient = () => createClient();

async function fetchFacturesCount(): Promise<number> {
  // Exclut les clients démo/archivés pour s'aligner sur dashboard + accueil
  // (même définition de « factures en retard » partout).
  const res = await supabaseClient()
    .from('factures')
    .select('id, projet:projets!inner(client:clients!inner(is_demo, archive))')
    .eq('statut', 'en_retard');
  let count = 0;
  for (const f of res.data ?? []) {
    const projet = Array.isArray(f.projet) ? f.projet[0] : f.projet;
    const client =
      projet &&
      (Array.isArray(projet.client) ? projet.client[0] : projet.client);
    if (client && !client.is_demo && !client.archive) count++;
  }
  return count;
}

async function fetchTempsCount(): Promise<number> {
  // Jours sans saisie PERSONNELS (mêmes que l'accueil/dashboard via
  // getJoursSansSaisie). On scope explicitement sur l'utilisateur courant.
  const supabase = supabaseClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return 0;
  const res = await supabase
    .from('saisies_temps')
    .select('date')
    .eq('user_id', uid)
    .gte('date', currentMondayLocalISO())
    .lte('date', currentFridayLocalISO());
  const uniqueDays = new Set((res.data ?? []).map((s) => s.date));
  return Math.max(0, businessDaysElapsedThisWeek() - uniqueDays.size);
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

/**
 * Compte les contrats à facturer : contrats ENGAGE/TRANSMIS (non archivés,
 * non verrouillés) avec une échéance OPCO ouverte mais non transmise
 * (eduvia_invoice_steps.invoice_state null, opening_date <= aujourd'hui).
 * RLS scope par CDP (admin = tout) via la policy de eduvia_invoice_steps.
 */
async function fetchAFacturerCount(): Promise<number> {
  const today = toLocalISODate(new Date());
  const res = await supabaseClient()
    .from('eduvia_invoice_steps')
    .select(
      'contrat_id, contrats!inner(contract_state, archive, facturation_verrouillee)',
    )
    .is('invoice_state', null)
    .lte('opening_date', today);
  const ids = new Set<string>();
  for (const r of res.data ?? []) {
    const c = Array.isArray(r.contrats) ? r.contrats[0] : r.contrats;
    if (!c || c.archive || c.facturation_verrouillee) continue;
    if (c.contract_state !== 'ENGAGE' && c.contract_state !== 'TRANSMIS')
      continue;
    ids.add(r.contrat_id);
  }
  return ids.size;
}

/** Fetch all badge counts at once (used for initial load). */
async function fetchAllBadgeCounts(): Promise<BadgeCounts> {
  const [
    facturesEnRetard,
    tempsNonSaisi,
    notifications,
    intercontrat,
    bugsNouveaux,
    contratsAFacturer,
  ] = await Promise.all([
    fetchFacturesCount(),
    fetchTempsCount(),
    fetchNotificationsCount(),
    fetchIntercontratCount(),
    fetchBugsCount(),
    fetchAFacturerCount(),
  ]);

  return {
    facturesEnRetard,
    tempsNonSaisi,
    notifications,
    intercontrat,
    bugsNouveaux,
    contratsAFacturer,
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

  // Targeted updaters - only re-fetch the count that changed.
  // Les .catch() evitent les unhandled promise rejections si le client
  // Supabase rejette (panne reseau). Le badge garde son ancienne valeur,
  // pas de crash UI.
  const refreshAll = useCallback(() => {
    fetchAllBadgeCounts()
      .then((next) => {
        if (mountedRef.current) setCounts(next);
      })
      .catch((err) => logger.warn('badge-counts', err));
  }, []);

  const refreshFactures = useCallback(() => {
    fetchFacturesCount()
      .then((v) => {
        if (mountedRef.current)
          setCounts((prev) => ({ ...prev, facturesEnRetard: v }));
      })
      .catch((err) => logger.warn('badge-counts.factures', err));
  }, []);

  const refreshNotifications = useCallback(() => {
    fetchNotificationsCount()
      .then((v) => {
        if (mountedRef.current)
          setCounts((prev) => ({ ...prev, notifications: v }));
      })
      .catch((err) => logger.warn('badge-counts.notifications', err));
  }, []);

  const refreshTemps = useCallback(() => {
    fetchTempsCount()
      .then((v) => {
        if (mountedRef.current)
          setCounts((prev) => ({ ...prev, tempsNonSaisi: v }));
      })
      .catch((err) => logger.warn('badge-counts.temps', err));
  }, []);

  const refreshIntercontrat = useCallback(() => {
    fetchIntercontratCount()
      .then((v) => {
        if (mountedRef.current)
          setCounts((prev) => ({ ...prev, intercontrat: v }));
      })
      .catch((err) => logger.warn('badge-counts.intercontrat', err));
  }, []);

  const refreshBugs = useCallback(() => {
    fetchBugsCount()
      .then((v) => {
        if (mountedRef.current)
          setCounts((prev) => ({ ...prev, bugsNouveaux: v }));
      })
      .catch((err) => logger.warn('badge-counts.bugs', err));
  }, []);

  const refreshAFacturer = useCallback(() => {
    fetchAFacturerCount()
      .then((v) => {
        if (mountedRef.current)
          setCounts((prev) => ({ ...prev, contratsAFacturer: v }));
      })
      .catch((err) => logger.warn('badge-counts.a-facturer', err));
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
      aFacturer: null,
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
        // eduvia_invoice_steps : invoice_state passe a TRANSMIS/REGLE (sync
        // Eduvia) ou nouvelle echeance ouverte -> le compte "a facturer"
        // change. RLS scope les events par CDP.
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'eduvia_invoice_steps' },
          () => debouncedRefresh('aFacturer', refreshAFacturer),
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
    refreshAFacturer,
  ]);

  return counts;
}
