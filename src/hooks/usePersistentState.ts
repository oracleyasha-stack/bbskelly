import { useCallback, useState } from 'react';

/**
 * useState backed by window.localStorage.
 *
 * - Lazily reads the stored value on mount; falls back to `initialValue`
 *   when storage is unavailable, unparseable, or fails `validate`.
 * - Writes every change back to storage (best-effort — private mode /
 *   quota errors never break the UI).
 * - Stored as JSON so booleans / objects survive round-trips; plain-string
 *   values also read back raw strings written by older versions.
 */
export function usePersistentState<T>(
  key: string,
  initialValue: T,
  validate?: (value: unknown) => value is T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const saved = window.localStorage.getItem(key);
      if (saved == null) return initialValue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(saved);
      } catch {
        // Back-compat: earlier builds stored some prefs as raw strings.
        parsed = saved;
      }
      // JSON.stringify('GP') round-trips to '"GP"' -> parsed 'GP'; a raw
      // unquoted string stays a string. Either way validate decides.
      if (validate) {
        return validate(parsed) ? parsed : initialValue;
      }
      return parsed as T;
    } catch {
      return initialValue;
    }
  });

  const setPersistent = useCallback(
    (next: React.SetStateAction<T>) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Keep the UI usable when browser storage is unavailable.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, setPersistent];
}

/** Accepts only values from an allow-list (function codes, tabs, filters…). */
export const isOneOf =
  <T extends string>(allowed: readonly T[]) =>
  (value: unknown): value is T =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value);
