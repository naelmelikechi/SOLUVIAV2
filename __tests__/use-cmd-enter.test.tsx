// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useCmdEnter } from '@/lib/hooks/use-cmd-enter';

afterEach(() => cleanup());

function dispatchKey(opts: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
}) {
  const evt = new KeyboardEvent('keydown', {
    key: opts.key,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    cancelable: true,
    bubbles: true,
  });
  document.dispatchEvent(evt);
  return evt;
}

describe('useCmdEnter', () => {
  it('declenche handler sur Cmd+Enter (Mac)', () => {
    const handler = vi.fn();
    renderHook(() => useCmdEnter(handler));

    dispatchKey({ key: 'Enter', metaKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('declenche handler sur Ctrl+Enter (Windows/Linux)', () => {
    const handler = vi.fn();
    renderHook(() => useCmdEnter(handler));

    dispatchKey({ key: 'Enter', ctrlKey: true });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('ignore Enter sans modificateur', () => {
    const handler = vi.fn();
    renderHook(() => useCmdEnter(handler));

    dispatchKey({ key: 'Enter' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('ignore d autres touches avec Cmd', () => {
    const handler = vi.fn();
    renderHook(() => useCmdEnter(handler));

    dispatchKey({ key: 'a', metaKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('enabled=false : n attache pas le listener', () => {
    const handler = vi.fn();
    renderHook(() => useCmdEnter(handler, false));

    dispatchKey({ key: 'Enter', metaKey: true });

    expect(handler).not.toHaveBeenCalled();
  });

  it('preventDefault est appele (anti soumission de form)', () => {
    const handler = vi.fn();
    renderHook(() => useCmdEnter(handler));

    const evt = dispatchKey({ key: 'Enter', metaKey: true });

    expect(evt.defaultPrevented).toBe(true);
  });

  it('cleanup retire le listener au demontage', () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useCmdEnter(handler));

    unmount();
    dispatchKey({ key: 'Enter', metaKey: true });

    expect(handler).not.toHaveBeenCalled();
  });
});
