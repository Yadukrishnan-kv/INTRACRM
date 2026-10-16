import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { humanize } from '../../lib/format';
import { useDebounced } from '../../lib/hooks';
import { searchApi } from './api';
import { canSearch, SEARCH_FIELDS, searchHitPath } from './logic';
import type { SearchField } from './types';
import './leads.css';

const FIELD_CODES = new Set(SEARCH_FIELDS.map((f) => f.code).filter(Boolean));

/** /search — global lead/quotation search with field chips (mobile SearchPage). */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const byParam = params.get('by');
  const by = (byParam && FIELD_CODES.has(byParam as SearchField) ? byParam : null) as SearchField | null;
  const [text, setText] = useState(params.get('q') ?? '');
  const q = useDebounced(text.trim(), 280);

  // Keep the URL shareable without a history entry per keystroke.
  useEffect(() => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (q) next.set('q', q);
        else next.delete('q');
        return next;
      },
      { replace: true },
    );
  }, [q, setParams]);

  const catalog = useQuery({ queryKey: ['search', 'catalog'], queryFn: searchApi.catalog, staleTime: 60 * 60_000 });
  const results = useQuery({
    queryKey: ['search', q, by],
    queryFn: ({ signal }) => searchApi.search(q, by ?? undefined, signal),
    enabled: canSearch(q),
    placeholderData: (prev) => prev,
  });

  const placeholder =
    (by ? catalog.data?.fields.find((f) => f.code === by)?.placeholder : null) ?? 'Customer, mobile, lead ID or quotation number';

  return (
    <>
      <PageHeader title="Search" subtitle="Find leads and quotations by customer, mobile, lead ID or quotation number." />
      <div className="toolbar">
        <input
          type="search"
          className="input"
          autoFocus
          placeholder={placeholder}
          aria-label="Search"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>
      <div className="leads-chips chip-scroll" role="group" aria-label="Search by">
        {SEARCH_FIELDS.map((f) => {
          const active = by === f.code;
          return (
            <button
              key={f.label}
              type="button"
              className={`chip${active ? ' chip-active' : ''}`}
              aria-pressed={active}
              title={f.code ? catalog.data?.fields.find((c) => c.code === f.code)?.description : catalog.data?.auto.description}
              onClick={() =>
                setParams(
                  (prev) => {
                    const next = new URLSearchParams(prev);
                    if (f.code) next.set('by', f.code);
                    else next.delete('by');
                    return next;
                  },
                  { replace: true },
                )
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {!canSearch(text) ? (
        <EmptyState>Search by customer, mobile, lead ID, or quotation number.</EmptyState>
      ) : results.isLoading || (!canSearch(q) && canSearch(text)) ? (
        <Spinner label="Searching…" />
      ) : results.isError ? (
        <ErrorState error={results.error} onRetry={() => results.refetch()} />
      ) : !results.data?.hits.length ? (
        <EmptyState>No matching leads or quotations.</EmptyState>
      ) : (
        <section className="card">
          {results.data.classifiedAs && !by ? (
            <p className="muted small">Matched as {humanize(results.data.classifiedAs)}</p>
          ) : null}
          <ul className="list">
            {results.data.hits.map((hit) => (
              <li key={`${hit.type}-${hit.id}`}>
                <div className="list-row">
                  <Link to={searchHitPath(hit)}>
                    <span aria-hidden>{hit.type === 'quotation' ? '₹ ' : '👤 '}</span>
                    <strong>{hit.title}</strong>
                  </Link>
                  <span className="btn-row">
                    {hit.status ? <Badge value={hit.status} /> : null}
                    <span className="muted small">{hit.matchedBy.replace(/_/g, ' ')}</span>
                  </span>
                </div>
                <span className="muted small">{hit.subtitle}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
