'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { getTourForRole, type TourStep } from './tour-steps';
import 'driver.js/dist/driver.css';
import './onboarding-tour.css';

interface OnboardingTourProps {
  /** Role de l user. Le tour ne se lance que pour cdp ou commercial. */
  role: string | null | undefined;
  /**
   * Date ISO du dernier completion. NULL = jamais fait => declenche le tour
   * au montage.
   */
  completedAt: string | null;
}

/**
 * Mode preview : un superadmin (ou admin) peut declencher le tour d'un autre
 * role via le param d'URL `?tour-preview=cdp|commercial`. Pas de POST de
 * completion a la fin : c est uniquement une simulation.
 */
const PREVIEW_PARAM = 'tour-preview';
const PREVIEW_ROLES = new Set(['cdp', 'commercial']);

/**
 * Attend qu un selecteur soit present dans le DOM. Utilise apres une
 * navigation Next.js : le router.push est async, l element cible peut
 * encore etre en train de monter quand on veut highlight.
 */
function waitForElement(selector: string, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve();
      return;
    }
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve();
    }, timeoutMs);
  });
}

export function OnboardingTour({ role, completedAt }: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pathnameRef = useRef(pathname);
  const startedRef = useRef(false);

  // Mode preview pour superadmin/admin : ?tour-preview=cdp ou commercial
  const previewRoleRaw = searchParams.get(PREVIEW_PARAM);
  const previewRole =
    previewRoleRaw && PREVIEW_ROLES.has(previewRoleRaw) ? previewRoleRaw : null;
  const isPreview = previewRole !== null;
  const effectiveRole = previewRole ?? role;

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const steps = getTourForRole(effectiveRole);
    if (!steps) return;

    // En mode preview, on (re)lance a chaque changement de param meme si
    // le tour vient juste de tourner. Sinon, lance une fois si pas encore fait.
    const shouldStart = isPreview || (!completedAt && !startedRef.current);
    if (!shouldStart) return;
    startedRef.current = true;

    let cancelled = false;

    (async () => {
      // Lazy load driver.js: aucun coup bundle pour les users non concernes.
      const { driver } = await import('driver.js');
      if (cancelled) return;

      const driverObj = driver({
        showProgress: true,
        allowClose: true,
        overlayOpacity: 0.6,
        progressText: 'Etape {{current}} sur {{total}}',
        nextBtnText: 'Suivant',
        prevBtnText: 'Precedent',
        doneBtnText: 'Termine',
        steps: steps.map((step) => buildDriverStep(step)),
        onNextClick: async () => {
          const idx = driverObj.getActiveIndex();
          if (idx === undefined) return;
          const nextStep = steps[idx + 1];
          if (nextStep) {
            await ensureStepReady(nextStep, pathnameRef, router);
          }
          driverObj.moveNext();
        },
        onPrevClick: async () => {
          const idx = driverObj.getActiveIndex();
          if (idx === undefined) return;
          const prevStep = steps[idx - 1];
          if (prevStep) {
            await ensureStepReady(prevStep, pathnameRef, router);
          }
          driverObj.movePrevious();
        },
        onCloseClick: () => {
          driverObj.destroy();
        },
        onDestroyed: () => {
          // Mode preview : ne pas marquer comme complete (ce serait set
          // onboarding_completed_at sur le superadmin testeur). On nettoie
          // juste le param d URL pour permettre une relance.
          if (isPreview) {
            const url = new URL(window.location.href);
            url.searchParams.delete(PREVIEW_PARAM);
            router.replace(url.pathname + url.search);
            startedRef.current = false;
            return;
          }
          markComplete();
        },
      });

      // Premier rendu : preparer la route de la 1re etape si besoin
      if (steps[0]) {
        await ensureStepReady(steps[0], pathnameRef, router);
      }
      if (cancelled) return;
      driverObj.drive();
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRole, completedAt, isPreview]);

  return null;
}

function buildDriverStep(step: TourStep) {
  return {
    element: step.element,
    popover: {
      title: step.popover.title,
      description: step.popover.description,
      side: step.popover.side,
      align: step.popover.align,
    },
  };
}

async function ensureStepReady(
  step: TourStep,
  pathnameRef: React.RefObject<string>,
  router: ReturnType<typeof useRouter>,
) {
  if (step.route && step.route !== pathnameRef.current) {
    router.push(step.route);
    // Laisse le temps a Next.js de transitionner avant de chercher l ancre
    await new Promise((r) => setTimeout(r, 250));
  }
  if (step.element) {
    await waitForElement(step.element);
  }
}

function markComplete() {
  fetch('/api/onboarding/complete', { method: 'POST' }).catch(() => {
    // Pas de toast d erreur : si le POST echoue, le tour se relancera
    // a la prochaine connexion. C est moins genant qu une erreur visible.
  });
}
