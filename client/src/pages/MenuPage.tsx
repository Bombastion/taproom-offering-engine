import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, MenuDetail, plural } from '../api';
import { PageHeader, Screen } from '../components/Screen';
import { ChevronRight, PencilIcon, PlusIcon, PrintIcon, ReorderIcon, ScreenIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { NameSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { moved, MoveButtons } from '../components/Reorder';
import { LogoEditor } from '../components/LogoEditor';

export function MenuPage() {
  const menuId = useParams().menuId!;
  const queryKey = ['menu', menuId];
  const menu = useQuery({ queryKey, queryFn: () => api.menu(menuId) });
  const queryClient = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState<'rename' | 'add' | null>(null);
  const [reordering, setReordering] = useState(false);

  const name = menu.data?.displayName ?? 'Menu';

  const move = async (from: number, to: number) => {
    const current = queryClient.getQueryData<MenuDetail>(queryKey);
    if (!current) return;
    const sections = moved(current.sections, from, to);
    queryClient.setQueryData<MenuDetail>(queryKey, { ...current, sections });
    try {
      await api.reorderSections(menuId, sections.map((s) => s.id));
    } catch (e) {
      queryClient.setQueryData(queryKey, current);
      toast(`Couldn't reorder: ${errorMessage(e)}`, 'error');
    }
  };

  return (
    <Screen barTitle="Menu" parent="/" crumbs={[{ label: 'Menus', to: '/' }, { label: name, to: `/menus/${menuId}` }]}>
      <div className="page">
        {menu.isPending && <Loading />}
        {menu.isError && <LoadError error={menu.error} onRetry={() => menu.refetch()} />}
        {menu.data && (
          <>
            <PageHeader eyebrow="Menu" title={menu.data.displayName} mono={menu.data.internalName} />

            <div className="chip-row">
              <button type="button" className="chip" onClick={() => setSheet('rename')}>
                <PencilIcon />Rename
              </button>
              {menu.data.sections.length > 1 && (
                <button type="button" className={`chip${reordering ? ' chip-on' : ''}`} aria-pressed={reordering} onClick={() => setReordering((r) => !r)}>
                  <ReorderIcon />{reordering ? 'Done' : 'Reorder'}
                </button>
              )}
              <a className="chip" href={`/menus/${menuId}?format=print`} target="_blank" rel="noopener">
                <PrintIcon />Print view
              </a>
              {menu.data.hasLogo && (
                <a className="chip" href={`/menus/${menuId}?format=digital`} target="_blank" rel="noopener">
                  <ScreenIcon />Menu board PDF
                </a>
              )}
            </div>

            <LogoEditor
              label="Menu logo"
              logo={menu.data.logo}
              hint="Shown on the print view, menu board PDF and website widget"
              removeWarning="The print view and website widget will show no logo, and the menu board PDF won't be available until you upload a new one."
              onUpload={async (logo) => {
                await api.setMenuLogo(menuId, logo);
                await queryClient.invalidateQueries({ queryKey });
                toast('Menu logo updated');
              }}
              onRemove={async () => {
                await api.removeMenuLogo(menuId);
                await queryClient.invalidateQueries({ queryKey });
                toast('Menu logo removed');
              }}
            />

            <div className="section-head">
              <h2>Sections</h2>
              <span className="muted-sm">
                {reordering ? 'Use the arrows to reorder' : `${plural(menu.data.sections.length, 'section')}`}
              </span>
            </div>

            <div className="stack-sm">
              {menu.data.sections.length === 0 && (
                <div className="empty">
                  <strong>No sections yet</strong>
                  Sections group what's pouring, like "Drafts" or "Guest Taps".
                </div>
              )}
              {menu.data.sections.map((section, index) =>
                reordering ? (
                  <div key={section.id} className="card card-static">
                    <div className="card-main">
                      <div className="card-title">{section.displayName}</div>
                      <div className="card-meta">{plural(section.itemCount, 'item')}</div>
                    </div>
                    <MoveButtons label={section.displayName} index={index} count={menu.data.sections.length} onMove={move} />
                  </div>
                ) : (
                  <Link key={section.id} to={`/menus/${menuId}/sections/${section.id}`} className="card">
                    <div className="card-main">
                      <div className="card-title-row">
                        <span className="card-title">{section.displayName}</span>
                        <span className="count-pill">{section.itemCount}</span>
                      </div>
                      <div className="card-meta truncate">
                        {section.itemNames.length ? section.itemNames.join(', ') : 'Empty — tap to add items'}
                      </div>
                    </div>
                    <span className="card-chevron"><ChevronRight /></span>
                  </Link>
                ),
              )}
            </div>

            {!reordering && (
              <button type="button" className="btn-dashed" onClick={() => setSheet('add')}>
                <PlusIcon />Add section
              </button>
            )}
          </>
        )}
      </div>

      {sheet === 'rename' && menu.data && (
        <NameSheet
          title="Rename menu"
          label="Menu name"
          initialValue={menu.data.displayName}
          submitLabel="Save name"
          onClose={() => setSheet(null)}
          onSubmit={async (newName) => {
            await api.renameMenu(menuId, newName);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey }),
              queryClient.invalidateQueries({ queryKey: ['menus'] }),
            ]);
            setSheet(null);
            toast('Menu renamed');
          }}
        />
      )}
      {sheet === 'add' && (
        <NameSheet
          title="Add section"
          eyebrow={name}
          label="Section name"
          placeholder="e.g. Guest Taps"
          submitLabel="Add section"
          onClose={() => setSheet(null)}
          onSubmit={async (sectionName) => {
            await api.createSection(menuId, sectionName);
            await Promise.all([
              queryClient.invalidateQueries({ queryKey }),
              queryClient.invalidateQueries({ queryKey: ['menus'] }),
            ]);
            setSheet(null);
            toast(`Added ${sectionName}`);
          }}
        />
      )}
    </Screen>
  );
}
