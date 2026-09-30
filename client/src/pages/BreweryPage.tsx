import { FormEvent, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, BreweryDetail, errorMessage, plural } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { Loading, LoadError } from '../components/QueryState';
import { LogoEditor } from '../components/LogoEditor';
import { useToast } from '../components/Toast';

export function BreweryPage() {
  const breweryId = useParams().breweryId!;
  const queryKey = ['brewery', breweryId];
  const brewery = useQuery({ queryKey, queryFn: () => api.brewery(breweryId) });
  const queryClient = useQueryClient();
  const toast = useToast();

  const name = brewery.data?.name ?? 'Brewery';

  // A new logo or name also changes the breweries list and anything showing brewery names
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['breweries'] }),
    ]);

  return (
    <Screen
      barTitle="Brewery"
      parent="/breweries"
      crumbs={[
        { label: 'Breweries', to: '/breweries' },
        { label: name, to: `/breweries/${breweryId}` },
      ]}
    >
      <div className="page">
        {brewery.isPending && <Loading />}
        {brewery.isError && <LoadError error={brewery.error} onRetry={() => brewery.refetch()} />}
        {brewery.data && (
          <>
            <PageHeader eyebrow="Brewery" title={brewery.data.name} sub={brewery.data.location ?? undefined} />

            <LogoEditor
              label="Brewery logo"
              logo={brewery.data.logo}
              hint="Shown next to this brewery's beers in the website widget"
              removeWarning="This brewery's beers will show the menu's logo in the website widget instead."
              onUpload={async (logo) => {
                await api.setBreweryLogo(breweryId, logo);
                await refresh();
                toast('Brewery logo updated');
              }}
              onRemove={async () => {
                await api.removeBreweryLogo(breweryId);
                await refresh();
                toast('Brewery logo removed');
              }}
            />

            <BreweryDetailsForm
              key={`${brewery.data.name}|${brewery.data.location ?? ''}`}
              brewery={brewery.data}
              onSaved={async (updated) => {
                queryClient.setQueryData(queryKey, updated);
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: ['breweries'] }),
                  queryClient.invalidateQueries({ queryKey: ['items'] }),
                  queryClient.invalidateQueries({ queryKey: ['section'] }),
                ]);
                toast('Brewery saved');
              }}
            />

            <div className="section-head">
              <h2>Beers</h2>
              <span className="muted-sm">{plural(brewery.data.items.length, 'item')} in your library</span>
            </div>
            {brewery.data.items.length === 0 ? (
              <div className="empty">No beers from this brewery yet. Pick it as the brewery when you create an item.</div>
            ) : (
              <div className="list-panel">
                {brewery.data.items.map((item) => (
                  <div key={item.id} className="lib-row">
                    <div className="lib-main">
                      <div className="lib-name">{item.displayName}</div>
                      <div className="card-meta">
                        {[item.style, item.abv !== null ? `${item.abv}%` : null].filter(Boolean).join(' · ') || 'No style set'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Screen>
  );
}

function BreweryDetailsForm({ brewery, onSaved }: { brewery: BreweryDetail; onSaved: (updated: BreweryDetail) => Promise<void> }) {
  const [name, setName] = useState(brewery.name);
  const [location, setLocation] = useState(brewery.location ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = name.trim() !== brewery.name || location.trim() !== (brewery.location ?? '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('The brewery needs a name.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSaved(await api.updateBrewery(brewery.id, name.trim(), location.trim() || null));
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <form className="panel stack" onSubmit={submit} noValidate>
      <label className="field-label">
        Name
        <input className="field" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} aria-invalid={error ? true : undefined} />
      </label>
      <label className="field-label">
        Location
        <input className="field" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Littleton, CO" maxLength={200} />
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn-primary" disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save details'}
      </button>
    </form>
  );
}
