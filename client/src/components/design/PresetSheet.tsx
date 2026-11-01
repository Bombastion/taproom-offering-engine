import { useQuery } from '@tanstack/react-query';
import { api } from '../../api';
import { DesignPreset } from '../../design';
import { Loading, LoadError } from '../QueryState';
import { Sheet } from '../Sheet';

type Props = {
  onClose: () => void;
  onPick: (preset: DesignPreset) => void;
};

// The designs to start from. Picking one changes the look of the draft (not what it says, or
// whether the logo, title and footer show), and can be undone.
export function PresetSheet({ onClose, onPick }: Props) {
  const presets = useQuery({ queryKey: ['designPresets'], queryFn: api.designPresets, staleTime: Infinity });

  return (
    <Sheet title="Start from a design" eyebrow="Presets" onClose={onClose} tall>
      <div className="sheet-body">
        <p className="muted-sm">
          This changes the fonts, colors, spacing and columns of the draft. Your logo, title and footer settings stay as they are, and Undo brings your own design back.
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
