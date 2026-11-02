import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { applyPreset, PrintDesignState } from '../design';
import { useDesignHistory } from '../useDesignHistory';
import { useLeaveWarning, useUndoKeys } from '../useDesignGuards';
import { PageHeader, Screen } from '../components/Screen';
import { RedoIcon, UndoIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { ConfirmSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { DesignPreview } from '../components/design/DesignPreview';
import { Group } from '../components/design/Group';
import { PresetSheet } from '../components/design/PresetSheet';
import { ColumnsGroup } from '../components/design/columns';
import { FooterGroup, HeaderGroup, HeadingsGroup, PageGroup, RowsGroup } from '../components/design/groups';

const GROUP_IDS = ['page', 'header', 'headings', 'columns', 'rows', 'footer'] as const;
type GroupId = typeof GROUP_IDS[number];

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
  // Only the price columns need these, so the designer doesn't wait for them
  const containers = useQuery({ queryKey: ['containers'], queryFn: api.containers });
  const fonts = useQuery({ queryKey: ['designFonts'], queryFn: api.designFonts, staleTime: Infinity });

  const [open, setOpen] = useState<GroupId | null>('headings');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [choosingPreset, setChoosingPreset] = useState(false);
  // A column asked for by clicking it in the preview (the number tells one click from the next)
  const [focusColumn, setFocusColumn] = useState<{ id: string; n: number } | null>(null);
  const [scrollTo, setScrollTo] = useState<{ group: GroupId; n: number } | null>(null);

  const queries = [saved, fonts];
  const failed = queries.find((q) => q.isError);
  const ready = saved.isSuccess && fonts.isSuccess;

  // The design as edited so far (the saved one until something is changed), and the steps to undo
  const { design, dirty: edited, canUndo, canRedo, change, replace, revert, undo, redo, markSaved, clear } = useDesignHistory(saved.data?.design);
  const dirty = ready && edited;

  // Clicking a part of the menu in the preview opens the controls that change it
  const pick = (target: string) => {
    const group: GroupId | null = target.startsWith('column:') ? 'columns' : GROUP_IDS.find((id) => id === target) ?? null;
    if (!group) return;
    setOpen(group);
    if (group === 'columns') setFocusColumn({ id: target.slice('column:'.length), n: Date.now() });
    setScrollTo({ group, n: Date.now() });
  };
  useEffect(() => {
    if (scrollTo) document.getElementById(`design-group-${scrollTo.group}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [scrollTo]);

  const save = async () => {
    if (!design || !dirty) return;
    setSaving(true);
    try {
      const state = await api.savePrintDesign(menuId, design);
      queryClient.setQueryData<PrintDesignState>(designKey, state);
      markSaved();
      toast('Design saved');
    } catch (e) {
      toast(`Couldn't save the design: ${errorMessage(e)}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const leaving = useLeaveWarning(dirty, saving);
  useUndoKeys(undo, redo);

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
            <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={revert}>
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
              <button type="button" className="chip" disabled={!canUndo} onClick={undo}>
                <UndoIcon /> Undo
              </button>
              <button type="button" className="chip" disabled={!canRedo} onClick={redo}>
                <RedoIcon /> Redo
              </button>
              <button type="button" className="chip" onClick={() => setChoosingPreset(true)}>
                Presets
              </button>
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
                <DesignPreview menuId={menuId} design={design} onPick={pick} />
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
                <Group id="columns" title="Columns" open={open === 'columns'} onToggle={setOpen}>
                  <ColumnsGroup {...controls} containers={{ data: containers.data, failed: containers.isError }} focus={focusColumn} onFocused={() => setFocusColumn(null)} />
                </Group>
                <Group id="rows" title="Rows" open={open === 'rows'} onToggle={setOpen}>
                  <RowsGroup {...controls} />
                </Group>
                <Group id="footer" title="Footer" open={open === 'footer'} onToggle={setOpen}>
                  <FooterGroup {...controls} />
                </Group>
              </div>
            </div>
          </>
        )}
      </div>

      {leaving.state === 'blocked' && (
        <ConfirmSheet
          title="Leave without saving?"
          message="The changes you made to this design haven't been saved, and are lost if you leave."
          confirmLabel="Leave without saving"
          onClose={() => leaving.reset()}
          onConfirm={async () => leaving.proceed()}
        />
      )}
      {choosingPreset && design && (
        <PresetSheet
          onClose={() => setChoosingPreset(false)}
          onPick={(preset) => {
            replace(applyPreset(design, preset.design));
            setChoosingPreset(false);
            toast(`Started from ${preset.name}`);
          }}
        />
      )}
      {confirmReset && (
        <ConfirmSheet
          title="Reset to the standard design?"
          message="This menu's saved design is removed, and its print view goes back to the standard design, which has no footer. Changes you haven't saved are lost too."
          confirmLabel="Reset design"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await api.resetPrintDesign(menuId);
            await queryClient.invalidateQueries({ queryKey: designKey });
            clear();
            setConfirmReset(false);
            toast('Back to the standard design');
          }}
        />
      )}
    </Screen>
  );
}
