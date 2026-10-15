// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutosave } from '../src/hooks/useAutosave.js';

beforeEach(() => { vi.useFakeTimers(); globalThis.IS_REACT_ACT_ENVIRONMENT = true; });
afterEach(() => vi.useRealTimers());

describe('useAutosave', () => {
  it('merges rapid edits into a single debounced write', async () => {
    const save = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 500 }));
    act(() => { result.current.queue('n1', { title: 'A' }); });
    act(() => { vi.advanceTimersByTime(200); result.current.queue('n1', { content_html: '<p>x</p>' }); });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.status).toBe('pending');
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('n1', { title: 'A', content_html: '<p>x</p>' });
    expect(result.current.status).toBe('saved');
  });

  it('flush() saves immediately', async () => {
    const save = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 5000 }));
    act(() => { result.current.queue('n1', { title: 'Now' }); });
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenCalledWith('n1', { title: 'Now' });
    expect(result.current.hasPending()).toBe(false);
  });

  it('saves the previous note first when switching notes', async () => {
    const save = vi.fn().mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 500 }));
    act(() => { result.current.queue('a', { title: '1' }); });
    await act(async () => { result.current.queue('b', { title: '2' }); await vi.advanceTimersByTimeAsync(600); });
    expect(save.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('keeps unsaved data after a failure and retries on the next flush', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue();
    const { result } = renderHook(() => useAutosave(save, { delay: 100 }));
    act(() => { result.current.queue('n1', { title: 'Precious' }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(150); });
    expect(result.current.status).toBe('error');
    expect(result.current.hasPending()).toBe(true);
    await act(async () => { await result.current.flush(); });
    expect(save).toHaveBeenLastCalledWith('n1', { title: 'Precious' });
    expect(result.current.status).toBe('saved');
  });
});
