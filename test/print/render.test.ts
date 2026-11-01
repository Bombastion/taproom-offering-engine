import { describe, expect, it } from 'vitest';
import { defaultPrintDesign, parsePrintDesign, PrintDesign, printDesignPresets, ITEM_FIELDS } from '../../models/menuDesign';
import { escapeHtml, imageDataUrl, renderPrintMenu } from '../../print/render';
import { PrintItem, PrintModel } from '../../print/model';
import { GIF_HEADER, JPEG_HEADER, TINY_PNG } from '../helpers';

// The print renderer on its own: a plain model and a design in, a page of HTML out. How the data is
// gathered is covered with the routes (test/routes/menus.test.ts); how a design is checked, in
// test/models/menuDesign.test.ts.

const NOW = new Date('2026-03-05T12:00:00Z');

function item(overrides: Partial<PrintItem> = {}): PrintItem {
  return {
    breweryName: 'Zymos Brewing',
    breweryLocation: 'Littleton, CO',
    displayName: 'Hazy Sequence',
    style: 'NEIPA',
    abv: 6.5,
    description: 'Juicy',
    category: 'beer',
    itemLogo: null,
    breweryLogo: null,
    prices: new Map([['Full Pour', '8.00'], ['Taster', '3.00']]),
    ...overrides,
  };
}

function model(overrides: Partial<PrintModel> = {}, items: PrintItem[] = [item()]): PrintModel {
  return {
    menuName: 'Currently On Tap',
    menuLogo: TINY_PNG,
    sections: [
      {
        id: 's1',
        name: 'Drafts',
        sizes: [
          { displayName: 'Taster', order: 1, containerIds: ['c1'] },
          { displayName: 'Full Pour', order: 2, containerIds: ['c2'] },
        ],
        items,
      },
    ],
    ...overrides,
  };
}

function changed(change: (design: any) => void): PrintDesign {
  const design: any = structuredClone(defaultPrintDesign());
  change(design);
  return design;
}

const render = (m: PrintModel = model(), design: PrintDesign = defaultPrintDesign()) => renderPrintMenu(m, design, { now: NOW });
const styleOf = (html: string) => html.match(/<style>([\s\S]*?)<\/style>/)![1];
// The page body, without the script that fits it to its pages
const bodyOf = (html: string) => html.slice(html.indexOf('<body>')).replace(/<script>[\s\S]*?<\/script>/g, '');
// The text of the page body, tags removed
const textOf = (html: string) => bodyOf(html).replace(/<[^>]+>/g, '|').replace(/\|+/g, '|');

describe('the default design', () => {
  it('prints the item on one line, the description under it and a price under each size', () => {
    const html = render();
    expect(html).toContain('Zymos Brewing');
    expect(bodyOf(html)).toMatch(/Zymos Brewing[^]*? &#x2022; <span class="ts\d+">Hazy Sequence<\/span> &#x2022; NEIPA &#x2022; 6.5% ABV/);
    expect(bodyOf(html)).toContain('Juicy');
    expect(bodyOf(html)).toMatch(/<th class="containerName ts\d+">Taster<\/th><th class="containerName ts\d+">Full Pour<\/th>/);
    expect(bodyOf(html)).toMatch(/containerPriceCell ts\d+">\$3.00<\/td><td class="containerPriceCell ts\d+">\$8.00<\/td>/);
  });

  it('has no doctype, which keeps the page in the quirks mode its look was made in', () => {
    expect(render().startsWith('<html>')).toBe(true);
  });

  it('is one self-contained page: a stylesheet, the menu and the script that fits it to its pages', () => {
    const html = render();
    expect(html.match(/<style>/g)).toHaveLength(1);
    expect(html.match(/<script/g)).toHaveLength(1);
    expect(html).not.toMatch(/<link|src="http|url\(http/);
  });

  it('describes the page to the fit script', () => {
    const html = render();
    expect(html).toContain('id="menuRoot"');
    expect(html).toContain('data-page-height-px="1056"');
    expect(html).toContain('data-top-px="48"');
    expect(html).toContain('data-bottom-px="72"');
    expect(html).toContain('data-max-pages="2"');
    expect(html).toContain('data-fit="shrink-to-pages"');
  });

  it('has no footer', () => {
    expect(render()).not.toContain('pageFooter"');
  });
});

describe('what the page settings change', () => {
  it('sizes the page and its margins', () => {
    const css = styleOf(render(model(), changed((d) => { d.page.size = 'a4'; d.page.marginsIn.left = 1; })));
    expect(css).toContain('size:A4');
    expect(css).toMatch(/margin/);
  });

  it('turns shrinking off and removes the page limit', () => {
    const html = render(model(), changed((d) => { d.page.fit = 'none'; d.page.maxPages = null; }));
    expect(html).toContain('data-fit="none"');
    expect(html).toContain('data-max-pages=""');
  });

  it('gives the legal page its height', () => {
    expect(render(model(), changed((d) => { d.page.size = 'legal'; }))).toContain('data-page-height-px="1344"');
  });

  it('sets the background color', () => {
    expect(styleOf(render(model(), changed((d) => { d.page.background = '#FFEEDD'; })))).toContain('#ffeedd');
  });
});

describe('the header', () => {
  it('shows the menu logo, unless the design hides it', () => {
    expect(bodyOf(render())).toContain('class="menuLogo"');
    expect(bodyOf(render(model(), changed((d) => { d.header.logo.show = false; })))).not.toContain('menuLogo');
  });

  it('has no logo when the menu has none, and not a broken image in its place', () => {
    expect(bodyOf(render(model({ menuLogo: null })))).not.toContain('<img');
  });

  it('does not print a logo that is not an image', () => {
    expect(bodyOf(render(model({ menuLogo: '"><script>alert(1)</script>' })))).not.toContain('<img');
  });

  it('can have a title with the menu name and the date in it', () => {
    const html = render(model(), changed((d) => { d.header.title.show = true; d.header.title.text = '{menu.name} — {date}'; }));
    expect(bodyOf(html)).toMatch(/class="menuTitle ts\d+">Currently On Tap &#x2014; March 5, 2026</);
  });

  it('has no title by default, or when the title is blank', () => {
    expect(bodyOf(render())).not.toContain('menuTitle');
    expect(bodyOf(render(model(), changed((d) => { d.header.title.show = true; d.header.title.text = '   '; })))).not.toContain('menuTitle');
  });
});

describe('the footer', () => {
  const footer = (text: string, more: (d: any) => void = () => {}) =>
    render(model(), changed((d) => { d.footer.show = true; d.footer.text = text; more(d); }));

  it('prints each line of its text', () => {
    const html = footer('WiFi: Zymos\nPassword: hops');
    expect(html.match(/class="pageFooterText/g)).toHaveLength(2);
    expect(html).toContain('WiFi: Zymos');
    expect(html).toContain('Password: hops');
  });

  it('can leave the rule out', () => {
    expect(bodyOf(footer('Hi'))).toContain('pageFooterRule');
    expect(bodyOf(footer('Hi', (d) => { d.footer.rule.show = false; }))).not.toContain('pageFooterRule');
  });

  it('expands {menu.name} and {date}', () => {
    expect(bodyOf(footer('{menu.name} on {date}'))).toContain('Currently On Tap on March 5, 2026');
  });

  it('does not expand what the menu name contains', () => {
    const html = render(model({ menuName: '{date}' }), changed((d) => { d.footer.show = true; d.footer.text = '{menu.name}'; }));
    expect(bodyOf(html)).toContain('>{date}<');
  });

  it('skips blank lines', () => {
    expect(footer('One\n\n\nTwo').match(/class="pageFooterText/g)).toHaveLength(2);
  });
});

describe('sections', () => {
  it('names each one in its heading, escaped', () => {
    const m = model();
    m.sections[0].name = 'Ales & <Lagers>';
    expect(bodyOf(render(m))).toContain('>Ales &amp; &lt;Lagers&gt;</h3>');
  });

  it('draws every section, including one with nothing in it', () => {
    const m = model();
    m.sections.push({ id: 's2', name: 'Empty', sizes: [], items: [] });
    expect(bodyOf(render(m)).match(/class="subMenuDiv"/g)).toHaveLength(2);
  });

  it('styles the heading from the design', () => {
    const css = styleOf(render(model(), changed((d) => {
      d.sections.heading.style.font = 'oswald';
      d.sections.heading.style.sizePt = 30;
      d.sections.heading.style.transform = 'uppercase';
      d.sections.heading.box.border.color = '#FF0000';
      d.sections.heading.box.background = '#00ff00';
    })));
    expect(css).toContain('Oswald');
    expect(css).toContain('2.5rem');
    expect(css).toContain('uppercase');
    expect(css).toContain('#ff0000');
    expect(css).toContain('#00ff00');
  });
});

describe('lines of item text', () => {
  const lineOf = (design: PrintDesign, m = model()) => render(m, design);

  it('leaves out a field the item does not have, along with the separator before it', () => {
    const html = render(model({}, [item({ breweryName: null, style: null })]));
    expect(bodyOf(html)).toContain('><span class="ts');
    expect(textOf(html)).toContain('|Hazy Sequence| &#x2022; 6.5% ABV|');
    expect(textOf(html)).not.toMatch(/&#x2022;\s*\|?\s*&#x2022;/);
  });

  it('starts the line with no separator when the first fields are missing', () => {
    const html = render(model({}, [item({ breweryName: null })]));
    expect(bodyOf(html)).not.toMatch(/<div class="ts\d+"> &#x2022;/);
  });

  it('prints an ABV of 0 and leaves out a missing one', () => {
    expect(render(model({}, [item({ abv: 0 })]))).toContain('0% ABV');
    expect(render(model({}, [item({ abv: null })]))).not.toContain('ABV');
  });

  it('treats blank text as missing', () => {
    expect(render(model({}, [item({ style: '   ' })]))).not.toMatch(/&#x2022; &#x2022;/);
  });

  it('leaves out a whole line when every part of it is empty', () => {
    const html = render(model({}, [item({ breweryName: null, displayName: '', style: null, abv: null, description: null })]));
    expect(bodyOf(html)).not.toMatch(/<td class="c0"><div/);
  });

  it('keeps the second row even with no description, so every item has the same height', () => {
    const html = render(model({}, [item({ description: null })]));
    expect(bodyOf(html).match(/<tbody class="itemGroup"><tr>[\s\S]*?<\/tr><tr>[\s\S]*?<\/tr><\/tbody>/g)).toHaveLength(1);
  });

  it('has no second row when no column has lines for it', () => {
    const d = changed((design) => { design.columns[0].belowLines = []; });
    expect(bodyOf(lineOf(d)).match(/<tr>/g)!.length).toBeLessThan(bodyOf(lineOf(defaultPrintDesign())).match(/<tr>/g)!.length);
  });

  it('prints fixed text and any field in any order', () => {
    const d = changed((design) => {
      design.columns[0].lines = [{
        style: design.columns[0].lines[0].style,
        parts: [
          { field: 'style', before: '', format: '[{value}]' },
          { field: 'text', text: 'Draft', before: ' / ', format: '{value}!' },
          { field: 'breweryLocation', before: ' / ', format: '{value}' },
          { field: 'category', before: ' / ', format: '{value}' },
        ],
      }];
    });
    expect(textOf(render(model(), d))).toContain('[NEIPA] / Draft! / Littleton, CO / beer');
  });

  it('puts a value in whole, even if it looks like a replacement pattern', () => {
    const d = changed((design) => { design.columns[0].lines[0].parts = [{ field: 'displayName', before: '', format: '<{value}>' }]; });
    expect(bodyOf(render(model({}, [item({ displayName: "$& $1 $' $`" })]), d))).toContain("&lt;$&amp; $1 $&#39; $`&gt;");
  });

  it('styles a part differently from its line', () => {
    const html = render();
    const css = styleOf(html);
    const bold = bodyOf(html).match(/<span class="(ts\d+)">Hazy Sequence/)![1];
    expect(css).toMatch(new RegExp(`\\.${bold}\\{[^}]*font-weight:700`));
  });

  it('gives the same style one class, however many lines use it', () => {
    const m = model({}, [item(), item({ displayName: 'Pils' }), item({ displayName: 'Stout' })]);
    const classes = [...bodyOf(render(m)).matchAll(/<span class="(ts\d+)">/g)].map((match) => match[1]);
    expect(classes).toHaveLength(3);
    expect(new Set(classes).size).toBe(1);
  });
});

describe('prices', () => {
  it('leaves the cell empty for a size an item does not come in, with no stray $', () => {
    const html = render(model({}, [item({ prices: new Map([['Full Pour', '8.00']]) })]));
    expect(bodyOf(html)).toMatch(/containerPriceCell ts\d+"><\/td><td class="containerPriceCell ts\d+">\$8.00<\/td>/);
  });

  it('formats the price as the design says', () => {
    const d = changed((design) => { design.columns[1].cell.format = '{value} USD'; });
    expect(bodyOf(render(model(), d))).toContain('>3.00 USD</td>');
  });

  it('can leave the size headings off', () => {
    const d = changed((design) => { design.columns[1].heading.show = false; });
    const html = render(model(), d);
    expect(bodyOf(html)).not.toContain('itemHeader');
    expect(bodyOf(html)).not.toContain('containerName');
  });

  it('can show only some of the pour sizes', () => {
    const d = changed((design) => { design.columns[1].sizes = ['c2']; });
    const html = bodyOf(render(model(), d));
    expect(html).toContain('>Full Pour</th>');
    expect(html).not.toContain('>Taster</th>');
    expect(html).not.toContain('$3.00');
  });
});

describe('thumbnails', () => {
  const withThumb = (source: 'item-then-menu' | 'item-then-brewery-then-menu' = 'item-then-menu') =>
    changed((d) => {
      d.columns.unshift({ id: 'pic', type: 'thumbnail', sizePx: 40, shape: 'circle', source });
      d.columns[1].widthPct = 60;
    });

  it("shows the item's own picture, as a style rule rather than an attribute", () => {
    const html = render(model(), withThumb());
    const own = item({ itemLogo: JPEG_HEADER });
    const withOwn = render(model({}, [own]), withThumb());
    expect(bodyOf(withOwn)).toMatch(/<span class="thumb img0"><\/span>/);
    expect(styleOf(withOwn)).toContain('.img0{background-image:url("data:image/jpeg;base64,');
    // Falls back to the menu's logo (a PNG)
    expect(styleOf(html)).toContain('data:image/png;base64,');
  });

  it('only uses the brewery picture when the design says to', () => {
    const m = model({ menuLogo: null }, [item({ breweryLogo: GIF_HEADER })]);
    expect(bodyOf(render(m, withThumb()))).not.toContain('class="thumb');
    expect(styleOf(render(m, withThumb('item-then-brewery-then-menu')))).toContain('data:image/gif;base64,');
  });

  it('shares one rule between items with the same picture', () => {
    const m = model({}, [item(), item({ displayName: 'Pils' })]);
    const html = render(m, withThumb());
    expect(bodyOf(html).match(/class="thumb img0"/g)).toHaveLength(2);
    expect(styleOf(html).match(/\.img0\{/g)).toHaveLength(1);
  });

  it('leaves an empty cell for an item with no picture to show', () => {
    const html = render(model({ menuLogo: null }), withThumb());
    expect(bodyOf(html)).toMatch(/<td class="c0"><\/td>/);
  });
});

describe('item rows', () => {
  it('can have a divider under each item', () => {
    expect(bodyOf(render())).not.toContain('itemDivider');
    const html = render(model(), changed((d) => { d.rows.divider.show = true; d.rows.divider.color = '#ABCDEF'; }));
    expect(bodyOf(html)).toContain('<tr class="itemDivider"><td colspan="2"></td></tr>');
    expect(styleOf(html)).toContain('#abcdef');
  });

  it('can space items apart', () => {
    expect(styleOf(render(model(), changed((d) => { d.rows.gapRem = 1.5; })))).toContain('1.5rem');
  });
});

describe('fonts', () => {
  it('declares only the fonts the design uses', () => {
    const css = styleOf(render());
    expect(css).toContain('@font-face');
    expect(css).toContain('/fonts/');
    expect(css).not.toContain('Oswald');
    const more = styleOf(render(model(), changed((d) => { d.sections.heading.style.font = 'oswald'; })));
    expect(more).toContain('Oswald');
  });

  it('uses system fonts without declaring anything for them', () => {
    const css = styleOf(render(model(), changed((d) => {
      d.sections.heading.style.font = 'system-sans';
      d.footer.style.font = 'system-sans';
    })));
    expect(css).not.toContain('Roboto');
  });
});

describe('a design that is not valid', () => {
  it('is not drawn', () => {
    const bad = changed((d) => { d.page.maxPages = 0; });
    expect(() => render(model(), bad)).toThrow(/Invalid print design/);
  });

  it('is not drawn even when it carries something the stylesheet could be injected through', () => {
    const bad = changed((d) => { d.sections.heading.style.color = 'red;}</style><script>alert(1)</script>'; });
    expect(() => render(model(), bad)).toThrow(/Invalid print design/);
  });
});

describe('escaping', () => {
  const HOSTILE = [
    '</style><script>alert(1)</script>',
    '</script><script>alert(2)</script>',
    '"><img src=x onerror=alert(3)>',
    "'; alert(4); //",
    '<!--',
    '  ',
    '&lt;&amp;',
    'x'.repeat(10) + '</sTyLe>',
    '{value}{value}',
    '{menu.name}{date}',
    '😀 café ½',
  ];

  // What a hostile string would do if it got through: a second style or script element, or a tag of its own
  function expectNothingGotThrough(html: string) {
    expect(html.match(/<\/style>/gi)).toHaveLength(1);
    expect(html.match(/<style/gi)).toHaveLength(1);
    expect(html.match(/<script/gi)).toHaveLength(1);
    expect(html.match(/<\/script>/gi)).toHaveLength(1);
    // The only picture is the menu logo; text that looks like a tag is there as text
    expect(html.match(/<img/gi)).toHaveLength(1);
    expect(bodyOf(html).replace(/<script>[\s\S]*<\/script>/, '')).not.toMatch(/<[a-z!/][^>]*(onerror|onload)=/i);
  }

  it.each(HOSTILE)('keeps %j inside the text it was in, in every place the data can show up', (hostile) => {
    const html = render(
      model(
        { menuName: hostile },
        [item({ breweryName: hostile, breweryLocation: hostile, displayName: hostile, style: hostile, description: hostile, category: hostile, prices: new Map([['Full Pour', hostile]]) })],
      ),
      changed((d) => {
        d.header.title.show = true;
        d.footer.show = true;
        d.footer.text = '{menu.name}';
        d.columns[0].lines.push({
          style: d.columns[0].lines[0].style,
          parts: ITEM_FIELDS.filter((field) => field !== 'text').map((field) => ({ field, before: ' ', format: '{value}' })),
        });
      }),
    );
    expectNothingGotThrough(html);
    expectNothingGotThrough(render(model({}, [item({ displayName: hostile })])));
  });

  it.each(HOSTILE)('keeps %j, written into the design, inside the text it was in', (hostile) => {
    const text = hostile.slice(0, 100);
    const design = changed((d) => {
      d.header.title.show = true;
      d.header.title.text = text;
      d.footer.show = true;
      d.footer.text = text;
      d.columns[0].lines[0].parts = [
        { field: 'text', text, before: text.slice(0, 20), format: `${text.slice(0, 40)}{value}` },
        { field: 'displayName', before: text.slice(0, 20), format: `{value}${text.slice(0, 40)}` },
      ];
      d.columns[1].cell.format = `${text.slice(0, 20)}{value}`;
    });
    const parsed = parsePrintDesign(design);
    if (!parsed.ok) return; // refused outright, which is just as safe
    expectNothingGotThrough(render(model(), parsed.design));
  });

  it('writes anything outside plain ASCII as a character reference', () => {
    expect(escapeHtml('café 😀')).toBe('caf&#xe9; &#x1f600;');
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });

  it('puts nothing but the design\'s validated values in the stylesheet', () => {
    const html = render(model({ menuName: '</style>' }, [item({ displayName: 'ZZZ_UNIQUE_NAME' })]));
    expect(styleOf(html)).not.toContain('ZZZ_UNIQUE_NAME');
    expect(styleOf(html)).not.toContain('Currently');
  });
});

describe('images', () => {
  it('only turns well-formed base64 of a known type into a data URL', () => {
    expect(imageDataUrl(TINY_PNG)).toMatch(/^data:image\/png;base64,/);
    expect(imageDataUrl(JPEG_HEADER)).toMatch(/^data:image\/jpeg;base64,/);
    expect(imageDataUrl(GIF_HEADER)).toMatch(/^data:image\/gif;base64,/);
    expect(imageDataUrl(null)).toBeNull();
    expect(imageDataUrl('')).toBeNull();
    expect(imageDataUrl('not base64!')).toBeNull();
    expect(imageDataUrl('abc");background:url(x')).toBeNull();
  });

  it('ignores whitespace in stored pictures', () => {
    expect(imageDataUrl(`${TINY_PNG.slice(0, 10)}\n${TINY_PNG.slice(10)}`)).toBe(imageDataUrl(TINY_PNG));
  });
});

describe('the presets', () => {
  it('each render the same menu with their own look', () => {
    const pages = printDesignPresets().map((preset) => renderPrintMenu(model(), preset.design, { now: NOW }));
    for (const html of pages) {
      expect(html).toContain('Hazy Sequence');
      expect(html).toContain('Drafts');
      expect(html).toContain('$8.00');
    }
    expect(new Set(pages).size).toBe(pages.length);
    expect(pages[1]).toContain('Montserrat');
    expect(pages[2]).toContain('Playfair Display');
  });
});

describe('the preview version', () => {
  const preview = (design: PrintDesign = defaultPrintDesign()) => renderPrintMenu(model(), design, { now: NOW, preview: true });
  const withFooter = changed((d) => { d.footer.show = true; d.footer.text = 'Open daily'; });

  it('is the same menu with what the designer needs added', () => {
    const plain = render(model(), withFooter);
    const html = preview(withFooter);
    expect(html).toContain('data-preview="1"');
    expect(html).toMatch(/data-page-width-px="816"/);
    expect(html).toMatch(/data-left-px="28\.8"/);
    expect(html).toMatch(/data-footer-bottom-px="28\.8"/);
    expect(html.match(/<script/g)).toHaveLength(2);
    // Taking the additions away leaves the page the print view is
    const stripped = html
      .replace(/ data-preview="1" data-page-width-px="[^"]*" data-left-px="[^"]*" data-body-px="[^"]*" data-footer-bottom-px="[^"]*"/, '')
      .replace(/ data-pick="[^"]*"/g, '')
      .replace(/<script>\s*\(function \(\) \{\s*var root = [\s\S]*?<\/script>/, '');
    expect(bodyOf(stripped)).toBe(bodyOf(plain));
  });

  it('marks what each part of the menu is changed by', () => {
    const html = preview(changed((d) => { d.header.title.show = true; d.rows.divider.show = true; d.footer.show = true; d.footer.text = 'x'; }));
    expect(html).toContain('class="menuLogoUnit" data-pick="header"');
    expect(html).toMatch(/class="menuTitle [^"]*" data-pick="header"/);
    expect(html).toMatch(/<h3 class="header subMenuHeader [^"]*" data-pick="headings">/);
    expect(html).toContain('<tr class="itemDivider" data-pick="rows">');
    expect(html).toContain('<div class="pageFooter" data-pick="footer">');
    expect(html).toContain('<td class="c0" data-pick="column:item">');
    expect(html).toContain('<td class="c1" data-pick="column:prices">');
  });

  it('is not available to anything but the designer\'s preview: the print view has no marks or preview script', () => {
    const html = render();
    expect(html).not.toContain('data-pick');
    expect(html).not.toContain('data-preview');
    expect(html).not.toContain('toe-preview-info');
    expect(html).not.toContain('--toe-gap');
  });

  it('only marks columns by their (validated) IDs', () => {
    const odd = changed((d) => { d.columns[0].id = 'item-1_a'; });
    expect(preview(odd)).toContain('data-pick="column:item-1_a"');
  });
});
