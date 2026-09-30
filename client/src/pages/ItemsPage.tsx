import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, plural } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { ExternalIcon, SearchIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';

// The item library: every beer the system knows about, whether or not it's on a menu right now.
export function ItemsPage() {
  const items = useQuery({ queryKey: ['items'], queryFn: api.items });
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items.data ?? []).filter(
      (item) => !q || [item.displayName, item.style, item.breweryName].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [items.data, query]);

  return (
    <Screen barTitle="Items">
      <div className="page">
        <PageHeader
          eyebrow="Library"
          title="Items"
          sub={items.data ? `${plural(items.data.length, 'item')}. Add them to a menu from any section.` : undefined}
        />
        <div className="search">
          <span className="search-icon"><SearchIcon /></span>
          <input className="field" type="search" aria-label="Search items" placeholder="Search your beers" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {items.isPending && <Loading />}
        {items.isError && <LoadError error={items.error} onRetry={() => items.refetch()} />}
        {items.data && (
          <div className="list-panel">
            {matches.map((item) => (
              <div key={item.id} className="lib-row">
                <div className="lib-main">
                  <div className="lib-name">{item.displayName}</div>
                  <div className="card-meta truncate">
                    {[item.style, item.abv !== null ? `${item.abv}%` : null, item.breweryName].filter(Boolean).join(' · ') || item.internalName}
                  </div>
                </div>
              </div>
            ))}
            {matches.length === 0 && <p className="muted lib-empty">{query ? `No items match "${query}".` : 'No items yet.'}</p>}
          </div>
        )}
        <a className="link-row" href="/items/manage" target="_blank" rel="noopener">
          Manage items in the classic editor <ExternalIcon />
        </a>
      </div>
    </Screen>
  );
}
