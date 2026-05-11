'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  /**
   * Si true, force le declenchement du tour (bouton Refaire la visite).
   * Le parent doit reset ce flag apres usage.
   */
  forceStart?: boolean;
  /** Callback apres start consomme (reset du forceStart cote parent). */
  onStartConsumed?: () => void;
}

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

export function OnboardingTour({
  role,
  completedAt,
  forceStart,
  onStartConsumed,
}: OnboardingTourProps) {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const startedRef = useRef(false);

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const steps = getTourForRole(role);
    if (!steps) return;

    const shouldStart = forceStart || (!completedAt && !startedRef.current);
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
          markComplete();
          if (onStartConsumed) onStartConsumed();
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
  }, [role, completedAt, forceStart]);

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
