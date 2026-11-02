import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { DesignPreset, PrintDesign } from '../../design';
import { Loading, LoadError } from '../QueryState';
import { Sheet } from '../Sheet';

type Props<D> = {
  // Which view's designs to offer (the print menu's, or the menu board's)
  view?: 'print' | 'board';
  onClose: () => void;
  onPick: (preset: DesignPreset<D>) => void;
};

// What choosing a preset leaves alone, for each view
const KEPT: Record<'print' | 'board', string> = {
  print: 'Your logo, title and footer settings stay as they are, and Undo brings your own design back.',
  board: 'Your logo and title settings and the safe margin stay as they are, and Undo brings your own design back.',
};

// The designs to start from. Picking one changes the look of the draft (not what it says, or
// whether the logo, title and footer show), and can be undone.
export function PresetSheet<D = PrintDesign>({ view = 'print', onClose, onPick }: Props<D>) {
  const presets = useQuery({
    queryKey: view === 'print' ? ['designPresets'] : ['designPresets', view],
    queryFn: (view === 'print' ? api.designPresets : api.boardDesignPresets) as () => Promise<DesignPreset<D>[]>,
    staleTime: Infinity,
  });

  return (
    <Sheet title="Start from a design" eyebrow="Presets" onClose={onClose} tall>
      <div className="sheet-body">
        <p className="muted-sm">
          {view === 'print' ? 'This changes the fonts, colors, spacing and columns of the draft.' : 'This changes the colors, fonts, section bars and item rows of the draft.'} {KEPT[view]}
        </p>
      </div>
      <div className="sheet-scroll">
        {presets.isPending && <Loading />}
        {presets.isError && <LoadError error={presets.error} onRetry={() => presets.refetch()} />}
        {presets.data?.map((preset) => (
          <div key={preset.id} className="lib-row">
            <div className="lib-main">
              <div className="lib-name">{preset.name}</div>
              <div className="card-meta">{preset.description}</div>
            </div>
            <button type="button" className="chip chip-accent" aria-label={`Use ${preset.name}`} onClick={() => onPick(preset)}>
              Use
            </button>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
