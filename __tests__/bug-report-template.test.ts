import { describe, it, expect } from 'vitest';
import {
  buildBugReportEmailSubject,
  buildBugReportEmailHtml,
} from '@/lib/email/bug-report-template';

/**
 * Tests pour les builders de l email bug-report.
 *
 * subject : format `[REF] [SEV][CAT] summary` avec tronques. summary
 * fallback sur comment si pas de triage IA. Si comment dispose de
 * sauts de ligne, ils sont normalises en espace simple.
 *
 * html : XSS-safe (escapeHtml sur tous les inputs). Comment garde les
 * sauts de ligne via <br>. Pas de fuite \n dans le HTML brut.
 */

describe('buildBugReportEmailSubject', () => {
  it('format avec triage complet', () => {
    const subject = buildBugReportEmailSubject({
      ref: 'BUG-0042',
      triage: {
        severity: 'high',
        category: 'ui',
        summary: 'Le bouton submit ne marche pas sur Safari',
        hypotheses: [],
      },
      comment: 'Quand je clique sur le bouton submit dans la modale...',
    });
    expect(subject).toBe(
      '[BUG-0042] [HIGH][UI] Le bouton submit ne marche pas sur Safari',
    );
  });

  it('fallback sur comment si pas de triage (pas de double espace)', () => {
    const subject = buildBugReportEmailSubject({
      ref: 'BUG-0042',
      triage: null,
      comment: 'Bug bizarre quand je clique partout',
    });
    expect(subject).toBe('[BUG-0042] Bug bizarre quand je clique partout');
  });

  it('tronque le summary a 90 chars et normalise les espaces', () => {
    const subject = buildBugReportEmailSubject({
      ref: 'BUG-0001',
      triage: null,
      comment:
        'Lorem ipsum   dolor\n\nsit amet\tconsectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua',
    });
    // pas de \n / \t / espaces multiples
    expect(subject).not.toContain('\n');
    expect(subject).not.toContain('\t');
    expect(subject).not.toContain('  ');
    // summary tronque a 90 (la regex slice(0, 80) sur comment puis slice(0, 90)
    // sur cleanSummary = 80 chars max provenant du comment)
    const summary = subject.replace('[BUG-0001]  ', '');
    expect(summary.length).toBeLessThanOrEqual(90);
  });

  it('uppercase severity et category', () => {
    const subject = buildBugReportEmailSubject({
      ref: 'BUG-0001',
      triage: {
        severity: 'critical',
        category: 'auth',
        summary: 'X',
        hypotheses: [],
      },
      comment: 'fallback',
    });
    expect(subject).toContain('[CRITICAL]');
    expect(subject).toContain('[AUTH]');
  });
});

describe('buildBugReportEmailHtml', () => {
  const base = {
    ref: 'BUG-0042',
    comment: 'Hello world',
    perceivedSeverity: null,
    userEmail: 'user@example.com',
    userRole: 'cdp',
    pageUrl: 'https://app.mysoluvia.com/projets',
    userAgent: null,
    viewport: null,
    consoleErrors: null,
    sentryEventId: null,
    autoScreenshotUrl: null,
    extraScreenshotUrl: null,
    triage: null,
    aiError: null,
    dashboardUrl: 'https://app.mysoluvia.com/admin/bugs/BUG-0042',
  };

  it('escape les caracteres HTML dans tous les champs user-controlled', () => {
    const html = buildBugReportEmailHtml({
      ...base,
      comment: '<script>alert(1)</script>',
      userEmail: 'evil<a>@x.com',
      pageUrl: 'https://x.com/?q=<img src=x>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('evil<a>');
    expect(html).toContain('evil&lt;a&gt;');
  });

  it('convertit les sauts de ligne du comment en <br>', () => {
    const html = buildBugReportEmailHtml({
      ...base,
      comment: 'ligne 1\nligne 2',
    });
    expect(html).toContain('ligne 1<br>ligne 2');
  });

  it('inclut le dashboardUrl en lien', () => {
    const html = buildBugReportEmailHtml(base);
    expect(html).toContain('https://app.mysoluvia.com/admin/bugs/BUG-0042');
  });

  it('affiche viewport quand fourni', () => {
    const html = buildBugReportEmailHtml({
      ...base,
      viewport: { width: 1920, height: 1080, dpr: 2 },
    });
    expect(html).toContain('1920 x 1080');
    expect(html).toContain('dpr 2');
  });

  it('inclut le triage IA si fourni', () => {
    const html = buildBugReportEmailHtml({
      ...base,
      triage: {
        severity: 'high',
        category: 'ui',
        summary: 'Resume analyse IA',
        hypotheses: ['Hypothese 1', 'Hypothese 2'],
      },
    });
    expect(html).toContain('Resume analyse IA');
    expect(html).toContain('Hypothese 1');
    expect(html).toContain('Hypothese 2');
  });
});
