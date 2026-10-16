import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useCursorList } from '../../lib/hooks';
import { leadKeys, timelineApi } from './api';
import { TimelineItem } from './LeadWidgets';
import { TIMELINE_CATALOG } from './logic';
import './leads.css';

/** /timeline — tenant-wide activity feed with event-type chips (mobile TimelinePage). */
export function TimelinePage() {
  const [params, setParams] = useSearchParams();
  const eventCode = params.get('event') ?? '';
  const catalog = useQuery({ queryKey: ['timeline', 'catalog'], queryFn: timelineApi.catalog, staleTime: 60 * 60_000 });
  const chips = catalog.data?.length ? catalog.data : TIMELINE_CATALOG;
  const feed = useCursorList(leadKeys.timeline(eventCode || 'all'), (cursor) => timelineApi.list(eventCode || undefined, cursor));

  const select = (code: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (code) next.set('event', code);
        else next.delete('event');
        return next;
      },
      { replace: true },
    );

  return (
    <>
      <PageHeader
        title="Timeline"
        subtitle="Lead changes, follow-ups, quotations, visits and messages across your team."
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => feed.refetch()} disabled={feed.isFetching}>
            {feed.isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        }
      />
      <div className="leads-chips chip-scroll" role="group" aria-label="Event type">
        <button type="button" className={`chip${!eventCode ? ' chip-active' : ''}`} aria-pressed={!eventCode} onClick={() => select('')}>
          All
        </button>
        {chips.map((c) => (
          <button
            key={c.code}
            type="button"
            className={`chip${eventCode === c.code ? ' chip-active' : ''}`}
            aria-pressed={eventCode === c.code}
            onClick={() => select(c.code)}
          >
            {c.title}
          </button>
        ))}
      </div>

      {feed.isLoading ? (
        <Spinner />
      ) : feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => feed.refetch()} />
      ) : feed.items.length === 0 ? (
        <EmptyState>No timeline events. Lead changes, follow-ups, quotations, and visits appear here.</EmptyState>
      ) : (
        <section className="card">
          <ul className="leads-tl">
            {feed.items.map((e) => (
              <TimelineItem key={e.id} event={e} showLead />
            ))}
          </ul>
          {feed.hasNextPage ? (
            <div className="table-footer">
              <button type="button" className="btn btn-ghost" onClick={() => feed.fetchNextPage()} disabled={feed.isFetchingNextPage}>
                {feed.isFetchingNextPage ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </section>
      )}
    </>
  );
}
