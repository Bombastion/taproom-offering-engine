import { ReactNode, useId, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { PrintDesign, PrintDesignState, sameDesign, setIn } from '../design';
import { PageHeader, Screen } from '../components/Screen';
import { ChevronRight } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { ConfirmSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { DesignPreview } from '../components/design/DesignPreview';
import { FooterGroup, HeaderGroup, HeadingsGroup, ItemTextGroup, PageGroup, PricesGroup } from '../components/design/groups';

type GroupId = 'page' | 'header' | 'headings' | 'items' | 'prices' | 'footer';

// Changes how a menu's print view looks, with a preview that follows every change. Nothing is
// kept until it is saved.
export function PrintDesignPage() {
  const menuId = useParams().menuId!;
  const queryClient = useQueryClient();
  const toast = useToast();
  const designKey = ['printDesign', menuId];

  const menu = useQuery({ queryKey: ['menu', menuId], queryFn: () => api.menu(menuId) });
  // Always start from what is saved now
  const saved = useQuery({ queryKey: designKey, queryFn: () => api.printDesign(menuId), staleTime: 0 });
  const fonts = useQuery({ queryKey: ['designFonts'], queryFn: api.designFonts, staleTime: Infinity });

  // The changes made since the last save, or nothing yet
  const [draft, setDraft] = useState<PrintDesign | null>(null);
  const [open, setOpen] = useState<GroupId | null>('headings');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const queries = [saved, fonts];
  const failed = queries.find((q) => q.isError);
  const ready = saved.isSuccess && fonts.isSuccess;

  const design = draft ?? saved.data?.design;
  const dirty = ready && draft !== null && !sameDesign(draft, saved.data!.design);

  const change = (path: (string | number)[], value: unknown) => {
    if (design) setDraft(setIn(design, path, value));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const state = await api.savePrintDesign(menuId, draft);
      queryClient.setQueryData<PrintDesignState>(designKey, state);
      setDraft(null);
      toast('Design saved');
    } catch (e) {
      toast(`Couldn't save the design: ${errorMessage(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const menuName = menu.data?.displayName ?? 'Menu';
  const controls = ready && design ? { design, fonts: fonts.data, change } : null;

  return (
    <Screen
      wide
      barTitle="Design print menu"
      parent={`/menus/${menuId}`}
      crumbs={[
        { label: 'Menus', to: '/' },
        { label: menuName, to: `/menus/${menuId}` },
        { label: 'Print design', to: `/menus/${menuId}/design/print` },
      ]}
      tabs={false}
      footer={
        ready ? (
          <div className="save-bar">
            <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={() => setDraft(null)}>
              Revert
            </button>
            <button type="button" className="btn-primary save-btn" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save design'}
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="page">
        <PageHeader eyebrow={menuName} title="Print menu design" sub="Changes show in the preview straight away and are kept when you save." />
        {!ready && !failed && <Loading />}
        {failed && <LoadError error={failed.error} onRetry={() => queries.forEach((q) => q.refetch())} />}
        {ready && design && controls && (
          <>
            {saved.data.storedDesignInvalid && (
              <div className="notice" role="status">
                The saved design couldn't be read, so the standard design is shown. Saving replaces it.
              </div>
            )}
            <div className="chip-row">
              <a className="chip" href={`/menus/${menuId}?format=print`} target="_blank" rel="noopener">
                Saved print view
              </a>
              {!saved.data.isDefault && (
                <button type="button" className="chip" onClick={() => setConfirmReset(true)}>
                  Reset to standard design
                </button>
              )}
              {dirty && <span className="count-pill" role="status">Unsaved changes</span>}
            </div>

            <div className="designer">
              <div className="designer-preview">
                <DesignPreview menuId={menuId} design={design} />
              </div>

              <div className="designer-controls stack-sm">
                <Group id="page" title="Page" open={open === 'page'} onToggle={setOpen}>
                  <PageGroup {...controls} />
                </Group>
                <Group id="header" title="Logo and title" open={open === 'header'} onToggle={setOpen}>
                  <HeaderGroup {...controls} />
                </Group>
                <Group id="headings" title="Section headings" open={open === 'headings'} onToggle={setOpen}>
                  <HeadingsGroup {...controls} />
                </Group>
                <Group id="items" title="Item text" open={open === 'items'} onToggle={setOpen}>
                  <ItemTextGroup {...controls} />
                </Group>
                <Group id="prices" title="Prices" open={open === 'prices'} onToggle={setOpen}>
                  <PricesGroup {...controls} />
                </Group>
                <Group id="footer" title="Footer" open={open === 'footer'} onToggle={setOpen}>
                  <FooterGroup {...controls} />
                </Group>
              </div>
            </div>
          </>
        )}
      </div>

      {confirmReset && (
        <ConfirmSheet
          title="Reset to the standard design?"
          message="This menu's saved design is removed, and its print view goes back to the standard design, which has no footer. Changes you haven't saved are lost too."
          confirmLabel="Reset design"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await api.resetPrintDesign(menuId);
            await queryClient.invalidateQueries({ queryKey: designKey });
            setDraft(null);
            setConfirmReset(false);
            toast('Back to the standard design');
          }}
        />
      )}
    </Screen>
  );
}

type GroupProps = { id: GroupId; title: string; open: boolean; onToggle: (open: GroupId | null) => void; children: ReactNode };

// One set of controls, opened by its heading; opening one closes the others
function Group({ id, title, open, onToggle, children }: GroupProps) {
  const bodyId = useId();
  return (
    <section className="panel design-group">
      <h2 className="design-group-title">
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={() => onToggle(open ? null : id)}>
          {title}
          <span className={`design-group-chevron${open ? ' open' : ''}`}><ChevronRight /></span>
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="design-group-body stack-sm">
          {children}
        </div>
      )}
    </section>
  );
}
