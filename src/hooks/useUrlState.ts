/**
 * Estado de tela persistido na URL.
 *
 * Filtros, busca e paginação deixam de se perder ao navegar ou recarregar,
 * e a tela passa a ser compartilhável por link ("me manda a lista das OS
 * atrasadas") — comportamento esperado de um sistema profissional.
 */

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo(() => {
    const next = { ...defaults };
    (Object.keys(defaults) as Array<keyof T>).forEach((key) => {
      const value = searchParams.get(String(key));
      if (value !== null) next[key] = value as T[keyof T];
    });
    return next;
  }, [defaults, searchParams]);

  const setState = useCallback(
    (patch: Partial<T>) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          Object.entries(patch).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '' || value === defaults[key as keyof T]) {
              next.delete(key);
            } else {
              next.set(key, String(value));
            }
          });
          return next;
        },
        { replace: true },
      );
    },
    [defaults, setSearchParams],
  );

  const reset = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const isFiltered = useMemo(
    () => (Object.keys(defaults) as Array<keyof T>).some((key) => state[key] !== defaults[key]),
    [defaults, state],
  );

  return { state, setState, reset, isFiltered };
}
