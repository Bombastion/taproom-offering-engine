import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { BreweryIcon, ChevronRight, PlusIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { NameSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

export function BreweriesPage() {
  const breweries = useQuery({ queryKey: ['breweries'], queryFn: api.breweries });
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const count = breweries.data?.length ?? 0;

  return (
    <Screen barTitle="Breweries">
      <div className="page">
        <PageHeader eyebrow="Library" title="Breweries" sub={breweries.data ? `${count} ${count === 1 ? 'brewery' : 'breweries'}` : undefined} />
        {breweries.isPending && <Loading />}
        {breweries.isError && <LoadError error={breweries.error} onRetry={() => breweries.refetch()} />}
        {breweries.data && (
          <div className="stack-sm">
            {breweries.data.length === 0 && <div className="empty">No breweries yet.</div>}
            {breweries.data.map((brewery) => (
              <Link key={brewery.id} to={`/breweries/${brewery.id}`} className="card">
                <div className="card-icon"><BreweryIcon /></div>
                <div className="card-main">
                  <div className="card-title">{brewery.name}</div>
                  <div className="card-meta">
                    {[brewery.location ?? 'No location set', brewery.hasLogo ? null : 'No logo'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <span className="card-chevron"><ChevronRight /></span>
              </Link>
            ))}
          </div>
        )}
        <button type="button" className="btn-dashed" onClick={() => setCreating(true)}>
          <PlusIcon />New brewery
        </button>
      </div>

      {creating && (
        <NameSheet
          title="New brewery"
          label="Brewery name"
          placeholder="e.g. Zymos Brewing"
          submitLabel="Create brewery"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const brewery = await api.createBrewery(name);
            await queryClient.invalidateQueries({ queryKey: ['breweries'] });
            setCreating(false);
            toast(`Created ${brewery.name}`);
            navigate(`/breweries/${brewery.id}`);
          }}
        />
      )}
    </Screen>
  );
}
