/**
 * Search.
 *
 * Sits at the top of the map rather than inside a panel, because jumping
 * somewhere is a navigation action, not a report to read. Results say whether
 * you have been there — which is the one thing this app knows that a normal map
 * search does not.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { LngLat } from '../../core/types';
import type { ExplorationState, SearchContext, SearchResult } from '../../subsystems/search';
import { search } from '../../subsystems/search';
import { Icon } from '../../ui/primitives';

const STATE_LABEL: Record<ExplorationState, string> = {
  explored: 'Explored',
  'partially-explored': 'Partly explored',
  unexplored: 'Unexplored',
  'recently-visited': 'Recently visited',
  'frequently-visited': 'Frequently visited',
};

export interface SearchBarProps {
  context: SearchContext;
  onGoTo: (coord: LngLat, zoom: number) => void;
}

export function SearchBar({ context, onGoTo }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const response = useMemo(() => search(query, context), [query, context]);
  const results: readonly SearchResult[] =
    response.kind === 'empty' ? [] : response.results;

  useEffect(() => setActive(0), [query]);

  // Close when focus or a click leaves the search entirely, but not when it
  // moves between the field and its own result list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (result: SearchResult) => {
    onGoTo(result.coord, result.zoom);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="search" ref={rootRef}>
      <div className="search__field">
        <Icon.Search />
        <input
          type="search"
          className="search__input"
          placeholder="Search the world"
          aria-label="Search for a place, city or country"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (!open || results.length === 0) return;
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => (i + 1) % results.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => (i - 1 + results.length) % results.length);
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const result = results[active];
              if (result) choose(result);
            }
          }}
        />
      </div>

      {open && (
        <div className="search__panel">
          {response.kind === 'empty' ? (
            <p className="search__none">
              Nothing matches &ldquo;{response.query}&rdquo;.
            </p>
          ) : (
            <>
              {response.kind === 'suggestions' && (
                <p className="search__hint">Recent and frequent places</p>
              )}
              <ul className="search__list">
                {results.map((result, i) => (
                  <li key={result.id}>
                    <button
                      type="button"
                      className={`search__item ${i === active ? 'search__item--active' : ''}`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(result)}
                    >
                      <span className="search__main">
                        <span className="search__name">{result.name}</span>
                        {result.secondary && (
                          <span className="search__secondary">{result.secondary}</span>
                        )}
                      </span>
                      <span className={`search__state search__state--${result.explorationState}`}>
                        {STATE_LABEL[result.explorationState]}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
