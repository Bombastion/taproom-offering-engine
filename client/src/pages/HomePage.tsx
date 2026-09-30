import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, plural } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { ChevronRight, ListIcon, PlusIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { NameSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

export function HomePage() {
  const menus = useQuery({ queryKey: ['menus'], queryFn: api.menus });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();

  return (
    <Screen barTitle="Taproom Offering Engine">
      <div className="page">
        <PageHeader
          eyebrow="Menu manager"
          title="Menus"
          sub="What's pouring, how it's grouped, and what it costs. Changes show on the website widget and printed menus."
        />

        {menus.isPending && <Loading />}
        {menus.isError && <LoadError error={menus.error} onRetry={() => menus.refetch()} />}
        {menus.data && (
          <div className="stack-sm">
            {menus.data.length === 0 && <div className="empty">No menus yet. Create your first one below.</div>}
            {menus.data.map((menu) => (
              <Link key={menu.id} to={`/menus/${menu.id}`} className="card">
                <div className="card-icon"><ListIcon /></div>
                <div className="card-main">
                  <div className="card-title">{menu.displayName}</div>
                  <div className="card-meta">
                    {plural(menu.sectionCount, 'section')} · {plural(menu.itemCount, 'item')}
                  </div>
                </div>
                <span className="card-chevron"><ChevronRight /></span>
              </Link>
            ))}
          </div>
        )}

        <button type="button" className="btn-dashed" onClick={() => setCreating(true)}>
          <PlusIcon />New menu
        </button>
      </div>

      {creating && (
        <NameSheet
          title="New menu"
          label="Menu name"
          placeholder="e.g. Currently On Tap"
          submitLabel="Create menu"
          onClose={() => setCreating(false)}
          onSubmit={async (name) => {
            const menu = await api.createMenu(name);
            await queryClient.invalidateQueries({ queryKey: ['menus'] });
            setCreating(false);
            toast(`Created ${menu.displayName}`);
            navigate(`/menus/${menu.id}`);
          }}
        />
      )}
    </Screen>
  );
}
