// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useDebounce } from '@/hooks/use-debounce';

afterEach(() => cleanup());

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('debounce les appels rapides (1 seul exec apres le delai)', () => {
    const spy = vi.fn();
    const { result } = renderHook(() => useDebounce(spy, 100));

    act(() => {
      result.current();
      result.current();
      result.current();
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('passe les arguments au callback', () => {
    const spy = vi.fn();
    const { result } = renderHook(() =>
      useDebounce(spy as (...args: unknown[]) => unknown, 50),
    );

    act(() => {
      result.current('a', 42);
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(spy).toHaveBeenCalledWith('a', 42);
  });

  it('utilise toujours le dernier callback (closure courante)', () => {
    let captured = 0;
    const { result, rerender } = renderHook(({ cb }) => useDebounce(cb, 100), {
      initialProps: {
        cb: (() => {
          captured = 1;
        }) as (...args: unknown[]) => void,
      },
    });

    act(() => {
      result.current();
    });

    // Le user change le callback avant que le timer ne se declenche.
    rerender({
      cb: (() => {
        captured = 2;
      }) as (...args: unknown[]) => void,
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(captured).toBe(2);
  });

  it('clear le timeout au demontage (pas de fuite ni d appel posthume)', () => {
    const spy = vi.fn();
    const { result, unmount } = renderHook(() => useDebounce(spy, 100));

    act(() => {
      result.current();
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
