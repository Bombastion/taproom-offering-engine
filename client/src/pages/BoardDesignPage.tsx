import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../api';
import { applyBoardPreset, BoardDesign, BoardDesignState } from '../boardDesign';
import { useDesignHistory } from '../useDesignHistory';
import { useLeaveWarning, useUndoKeys } from '../useDesignGuards';
import { PageHeader, Screen } from '../components/Screen';
import { RedoIcon, UndoIcon } from '../components/Icons';
import { Loading, LoadError } from '../components/QueryState';
import { ConfirmSheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { BoardPreview } from '../components/design/BoardPreview';
import { BarsGroup, BoardHeaderGroup, CanvasGroup, ItemsGroup } from '../components/design/boardGroups';
import { Group } from '../components/design/Group';
import { PresetSheet } from '../components/design/PresetSheet';

const GROUP_IDS = ['canvas', 'header', 'bars', 'items'] as const;
type GroupId = typeof GROUP_IDS[number];

// Changes how a menu's board (the pictures a TV shows) looks, with a preview that follows every
// change. Nothing is kept until it is saved.
export function BoardDesignPage() {
  const menuId = useParams().menuId!;
  const queryClient = useQueryClient();
  const toast = useToast();
  const designKey = ['boardDesign', menuId];

  const menu = useQuery({ queryKey: ['menu', menuId], queryFn: () => api.menu(menuId) });
  // Always start from what is saved now
  const saved = useQuery({ queryKey: designKey, queryFn: () => api.boardDesign(menuId), staleTime: 0 });
  const fonts = useQuery({ queryKey: ['designFonts', 'board'], queryFn: api.boardDesignFonts, staleTime: Infinity });

  const [open, setOpen] = useState<GroupId | null>('bars');
  const [saving, setSaving] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [choosingPreset, setChoosingPreset] = useState(false);

  const queries = [saved, fonts];
  const failed = queries.find((q) => q.isError);
  const ready = saved.isSuccess && fonts.isSuccess;

  // The design as edited so far (the saved one until something is changed), and the steps to undo
  const { design, dirty: edited, canUndo, canRedo, change, replace, revert, undo, redo, markSaved, clear } = useDesignHistory<BoardDesign>(saved.data?.design);
  const dirty = ready && edited;

  const save = async () => {
    if (!design || !dirty) return;
    setSaving(true);
    try {
      const state = await api.saveBoardDesign(menuId, design);
      queryClient.setQueryData<BoardDesignState>(designKey, state);
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

  // Opening a group scrolls it into view, since the groups are tall
  const [scrollTo, setScrollTo] = useState<{ group: GroupId; n: number } | null>(null);
  useEffect(() => {
    if (scrollTo) document.getElementById(`design-group-${scrollTo.group}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [scrollTo]);
  const toggle = (group: GroupId | null) => {
    setOpen(group);
    if (group) setScrollTo({ group, n: Date.now() });
  };

  const menuName = menu.data?.displayName ?? 'Menu';
  const controls = ready && design ? { design, fonts: fonts.data, change } : null;

  return (
    <Screen
      wide
      barTitle="Design menu board"
      parent={`/menus/${menuId}`}
      crumbs={[
        { label: 'Menus', to: '/' },
        { label: menuName, to: `/menus/${menuId}` },
        { label: 'Board design', to: `/menus/${menuId}/design/board` },
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
        <PageHeader eyebrow={menuName} title="Menu board design" sub="Changes show in the preview straight away and are kept when you save." />
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
              <a className="chip" href={`/menus/${menuId}?format=digital`} target="_blank" rel="noopener">
                Saved board images
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
                <BoardPreview menuId={menuId} design={design} />
              </div>

              <div className="designer-controls stack-sm">
                <Group id="canvas" title="Background and margin" open={open === 'canvas'} onToggle={toggle}>
                  <CanvasGroup {...controls} />
                </Group>
                <Group id="header" title="Logo and title" open={open === 'header'} onToggle={toggle}>
                  <BoardHeaderGroup {...controls} />
                </Group>
                <Group id="bars" title="Section bars" open={open === 'bars'} onToggle={toggle}>
                  <BarsGroup {...controls} />
                </Group>
                <Group id="items" title="Items" open={open === 'items'} onToggle={toggle}>
                  <ItemsGroup {...controls} />
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
        <PresetSheet<BoardDesign>
          view="board"
          onClose={() => setChoosingPreset(false)}
          onPick={(preset) => {
            replace(applyBoardPreset(design, preset.design));
            setChoosingPreset(false);
            toast(`Started from ${preset.name}`);
          }}
        />
      )}
      {confirmReset && (
        <ConfirmSheet
          title="Reset to the standard design?"
          message="This menu's saved board design is removed, and its board goes back to the standard look. Changes you haven't saved are lost too."
          confirmLabel="Reset design"
          onClose={() => setConfirmReset(false)}
          onConfirm={async () => {
            await api.resetBoardDesign(menuId);
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
