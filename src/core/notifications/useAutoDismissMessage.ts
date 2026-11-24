import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export const ALERT_DISMISS_MS = 5000;

/**
 * Transient action feedback with the same setter contract as useState.
 * A repeated message receives a fresh timer, and timers are cleaned up
 * when a message is replaced or the page unmounts.
 */
export function useAutoDismissMessage<T = string>(empty: T = '' as T): [T, Dispatch<SetStateAction<T>>] {
  const [current, setCurrent] = useState(() => ({ value: empty }));

  const setMessage = useCallback<Dispatch<SetStateAction<T>>>((action) => {
    setCurrent(previous => {
      const value = typeof action === 'function'
        ? (action as (previous: T) => T)(previous.value)
        : action;
      if (Object.is(value, empty) && Object.is(previous.value, empty)) return previous;
      return { value };
    });
  }, [empty]);

  useEffect(() => {
    if (Object.is(current.value, empty)) return;

    const timeout = window.setTimeout(() => {
      setCurrent(previous => previous === current ? { value: empty } : previous);
    }, ALERT_DISMISS_MS);

    return () => window.clearTimeout(timeout);
  }, [current, empty]);

  return [current.value, setMessage];
}
