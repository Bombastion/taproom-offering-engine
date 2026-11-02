import { BoardDesign } from '../../models/boardDesign';

/*
A board design the tests draw with when they need to know exactly what it looks like: a blue
background, grey section bars 52.5px tall, and Fira Sans. It is just an ordinary design, not the default
(that is Bold, which the preset tests and the public-board tests use).
*/
export function blueBoardDesign(): BoardDesign {
  const text = { font: 'fira-sans', sizePx: 52.5, weight: 400, italic: false, color: '#f3f3f3', align: 'left' as const, transform: 'none' as const, letterSpacingEm: 0 };
  const quiet = { color: '#9d9d9d' };
  return {
    version: 1,
    canvas: { background: '#175a6c', safeMarginPx: 40 },
    header: {
      logo: { show: true, sizePx: 150, align: 'center', fit: 'stretch' },
      title: { show: false, text: '{menu.name}', gapAbovePx: 0, style: { ...text, sizePx: 60, color: '#ffffff', align: 'center' } },
      gapBelowPx: 0,
    },
    sections: {
      gapPx: 30,
      bar: {
        heightPx: 52.5,
        marginTopPx: 10,
        insetPx: 5,
        textTopPx: 2.5,
        background: '#2b2b2b',
        radiusPx: 0,
        continuedSuffix: ', Continued',
        style: { ...text, sizePx: 42.5, color: '#ffffff' },
      },
    },
    items: {
      gapPx: 10,
      logo: { show: true, sizePx: 52.5, shape: 'circle', source: 'item-then-menu' },
      lines: [
        {
          style: text,
          parts: [
            { field: 'breweryName', before: '', format: '{value}' },
            { field: 'displayName', before: ' ', format: '{value}' },
            { field: 'style', before: '  ', format: '{value}', style: quiet },
            { field: 'abv', before: '  ', format: '{value}%', style: quiet },
          ],
        },
      ],
    },
  };
}
