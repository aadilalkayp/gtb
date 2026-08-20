import { useEffect, useState } from "react";

/** The value, trailing-debounced — for search-as-you-type queries so each
 *  keystroke doesn't fire a server request. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}
