import { useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { BOARD_HEIGHT, BOARD_WIDTH, BoardDesign } from '../../boardDesign';
import { problemText } from './DesignPreview';

// How long the design has to stop changing before the preview is asked for again
const PAUSE_MS = 300;

type Props = { menuId: string; design: BoardDesign };

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

// The menu board as the design draws it: the pictures the TV would be given, one for each page,
// drawn by the same code as the board itself. It follows the design as it is edited, and keeps
// showing the last drawing that worked if a newer one can't be made.
export function BoardPreview({ menuId, design }: Props) {
  const [pages, setPages] = useState<string[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [guide, setGuide] = useState(true);
  const drawn = useRef(false);

  const designKey = JSON.stringify(design);

  // Ask for a new drawing once the design has settled; drop the request if it changes again first
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setUpdating(true);
      try {
        const result = await api.previewBoardDesign(menuId, JSON.parse(designKey) as BoardDesign, controller.signal);
        drawn.current = true;
        setPages(result.pages);
        setProblem(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        setProblem(problemText(e));
      }
      setUpdating(false);
    }, drawn.current ? PAUSE_MS : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [menuId, designKey]);

  const { safeMarginPx } = design.canvas;
  const guideStyle = {
    left: `${(safeMarginPx / BOARD_WIDTH) * 100}%`,
    right: `${(safeMarginPx / BOARD_WIDTH) * 100}%`,
    top: `${(safeMarginPx / BOARD_HEIGHT) * 100}%`,
    bottom: `${(safeMarginPx / BOARD_HEIGHT) * 100}%`,
  };

  return (
    <div className="design-preview">
      <div className="design-preview-status">
        {problem ? (
          <div className="preview-problem" role="alert">
            <strong>The preview couldn't update.</strong> {problem}
            {pages !== null && ' Showing the last version that worked.'}
          </div>
        ) : (
          <span className="muted-sm" role="status">{updating || pages === null ? 'Updating preview…' : 'Preview is up to date'}</span>
        )}
        {pages && <span className="muted-sm design-preview-readout">{plural(pages.length, 'page')}</span>}
      </div>
      <label className="check-row">
        <input type="checkbox" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
        Show the safe margin
      </label>
      {pages && (
        <div className="board-pages">
          {pages.map((page, index) => (
            <figure key={index} className="board-page">
              <div className="board-page-picture">
                <img src={page} alt={`Menu board, page ${index + 1} of ${pages.length}`} width={BOARD_WIDTH / 2} height={BOARD_HEIGHT / 2} />
                {guide && <div className="board-page-guide" data-testid="safe-margin" style={guideStyle} aria-hidden="true" />}
              </div>
              <figcaption className="muted-sm">Page {index + 1}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
