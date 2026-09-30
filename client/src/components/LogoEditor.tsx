import { ChangeEvent, useRef, useState } from 'react';
import { errorMessage } from '../api';
import { ImageIcon, TrashIcon, UploadIcon } from './Icons';
import { ConfirmSheet } from './Sheet';

// Logos are stored as PNG no larger than this on their longest side. That's plenty for the
// menu board PDF, the print view and the widget, and keeps uploads small on a phone connection.
const MAX_LOGO_SIZE = 600;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read that file."));
    reader.readAsDataURL(file);
  });
}

// Converts any image the browser can open (PNG, JPEG, WebP, SVG, HEIC on iPhones…) into a
// downscaled PNG, returned as bare base64. The server only accepts PNG/JPEG because that's
// what the PDF menu board can draw.
export async function imageFileToPngBase64(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file, like a PNG or JPEG.');
  if (file.size > MAX_FILE_BYTES) throw new Error('That image is over 20 MB. Choose a smaller one.');

  const image = new Image();
  image.src = await readAsDataUrl(file);
  try {
    await image.decode();
  } catch {
    throw new Error("That image couldn't be opened. Try a PNG or JPEG.");
  }

  // SVGs without an explicit size report 0×0; give them a sensible canvas
  const width = image.naturalWidth || MAX_LOGO_SIZE;
  const height = image.naturalHeight || MAX_LOGO_SIZE;
  const scale = Math.min(1, MAX_LOGO_SIZE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error("This browser couldn't process the image.");
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png').split(',')[1];
}

type LogoEditorProps = {
  label: string;
  logo: string | null;
  hint?: string;
  removeWarning?: string;
  onUpload: (base64Png: string) => Promise<unknown>;
  onRemove: () => Promise<unknown>;
};

// Shows the current logo with Upload/Replace and Remove actions. Changes save immediately.
export function LogoEditor({ label, logo, hint, removeWarning, onUpload, onRemove }: LogoEditorProps) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onUpload(await imageFileToPngBase64(file));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel logo-panel" aria-label={label}>
      <div className="logo-frame">
        {logo ? (
          <img src={logo} alt={`${label}`} className="logo-img" />
        ) : (
          <div className="logo-empty" aria-hidden="true"><ImageIcon /></div>
        )}
      </div>
      <div className="logo-side">
        <div className="logo-title">{label}</div>
        <div className="muted-sm">{busy ? 'Uploading…' : logo ? hint : 'No logo yet'}</div>
        <div className="logo-actions">
          <button type="button" className="chip chip-accent" onClick={() => input.current?.click()} disabled={busy}>
            <UploadIcon />{logo ? 'Replace' : 'Upload'}
          </button>
          {logo && (
            <button type="button" className="chip chip-danger" onClick={() => setConfirmRemove(true)} disabled={busy}>
              <TrashIcon />Remove
            </button>
          )}
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" onChange={choose} />

      {confirmRemove && (
        <ConfirmSheet
          title="Remove logo?"
          message={removeWarning ?? 'The logo will be removed.'}
          confirmLabel="Remove logo"
          onClose={() => setConfirmRemove(false)}
          onConfirm={async () => {
            await onRemove();
            setConfirmRemove(false);
          }}
        />
      )}
    </section>
  );
}
