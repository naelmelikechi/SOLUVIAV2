import { describe, it, expect } from 'vitest';
import { clientIpFromHeaders } from '@/lib/utils/request-id';

// clientIpFromHeaders sert de CLE de rate-limit (login, password-reset,
// webauthn : `${ip}:${email}`). Une regression du parsing => soit bypass du
// rate-limit (tous sous 'unknown'/IP proxy -> brute-force), soit DoS.
describe('clientIpFromHeaders', () => {
  it('renvoie l IP unique de x-forwarded-for', () => {
    expect(
      clientIpFromHeaders(new Headers({ 'x-forwarded-for': '1.2.3.4' })),
    ).toBe('1.2.3.4');
  });

  it('prend le PREMIER hop (vrai client) dans une chaine de proxies', () => {
    expect(
      clientIpFromHeaders(
        new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8, 9.9.9.9' }),
      ),
    ).toBe('1.2.3.4');
  });

  it('trim les espaces autour du segment', () => {
    expect(
      clientIpFromHeaders(
        new Headers({ 'x-forwarded-for': '  1.2.3.4 , 5.6.7.8' }),
      ),
    ).toBe('1.2.3.4');
  });

  it('fallback sur x-real-ip si pas de x-forwarded-for', () => {
    expect(clientIpFromHeaders(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe(
      '9.9.9.9',
    );
  });

  it('LIMITE : x-forwarded-for vide retombe sur x-real-ip', () => {
    expect(
      clientIpFromHeaders(
        new Headers({ 'x-forwarded-for': '', 'x-real-ip': '9.9.9.9' }),
      ),
    ).toBe('9.9.9.9');
  });

  it('LIMITE : aucun header pertinent -> unknown', () => {
    expect(clientIpFromHeaders(new Headers())).toBe('unknown');
  });
});
