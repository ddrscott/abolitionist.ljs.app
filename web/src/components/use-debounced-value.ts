import { useEffect, useState } from 'react';

/** Returns `value` delayed by `delay` ms — so expensive work keyed off it
 *  (Fuse searches, big re-renders) runs after typing pauses, not per keystroke.
 *  The raw input stays instant; only the debounced copy lags. */
export function useDebouncedValue<T>(value: T, delay = 170): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
