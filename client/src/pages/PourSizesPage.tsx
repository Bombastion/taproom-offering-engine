import { useQuery } from '@tanstack/react-query';
import { api, plural } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { ExternalIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';

// Pour sizes are the server's "containers": the ways an item is sold (10 oz, crowler, ...),
// shown on menus in this order.
export function PourSizesPage() {
  const containers = useQuery({ queryKey: ['containers'], queryFn: api.containers });
  return (
    <Screen barTitle="Pour sizes">
      <div className="page">
        <PageHeader eyebrow="Library" title="Pour sizes" sub={containers.data ? `${plural(containers.data.length, 'size')}, in menu order` : undefined} />
        {containers.isPending && <Loading />}
        {containers.isError && <LoadError error={containers.error} onRetry={() => containers.refetch()} />}
        {containers.data && (
          <div className="list-panel">
            {containers.data.map((container) => (
              <div key={container.id} className="lib-row">
                <div className="lib-main">
                  <div className="lib-name">{container.displayName}</div>
                  <div className="card-meta">{container.containerName}</div>
                </div>
              </div>
            ))}
            {containers.data.length === 0 && <p className="muted lib-empty">No pour sizes yet.</p>}
          </div>
        )}
        <a className="link-row" href="/containers/manage" target="_blank" rel="noopener">
          Manage pour sizes in the classic editor <ExternalIcon />
        </a>
      </div>
    </Screen>
  );
}
