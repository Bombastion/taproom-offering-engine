// The extra script in the designer's preview of the print menu (never in the print view itself).
//
// The print menu is one long page on screen: the browser only starts new pages when it prints. The
// designer wants to show what will print, so once the fit script has decided where pages start, this
// script (fitScript.ts calls toePreviewAfterFit) does the three things the printer would:
//   - moves each page start down to the top of its page, so the preview has the same page breaks,
//   - draws the footer at the bottom of every page, as a printed fixed footer repeats, and
//   - draws guides for the edges and margins of each page, which are not part of the menu.
// It then tells the designer (the page around the preview frame) how many pages there are and how far
// the text was shrunk, and which part of the menu is clicked on.
//
// What it needs to know comes from data- attributes on #menuRoot, in addition to those the fit script
// reads: data-page-width-px, data-left-px, data-body-px, data-footer-bottom-px.
export const PREVIEW_SCRIPT = `
(function () {
  var root = document.getElementById('menuRoot');
  var settings = root.dataset;
  var PAGE = Number(settings.pageHeightPx);
  var PAGE_WIDTH = Number(settings.pageWidthPx);
  var LEFT = Number(settings.leftPx);
  var BODY = Number(settings.bodyPx);
  var TOP = Number(settings.topPx);
  var BOTTOM = Number(settings.bottomPx);
  var FOOTER_BOTTOM = Number(settings.footerBottomPx);
  var MAX_PAGES = Number(settings.maxPages) || 0;
  var NORMAL_SIZE = 16;

  function top(el) { return el.getBoundingClientRect().top + window.pageYOffset; }

  function box(className, css) {
    var el = document.createElement('div');
    el.className = className;
    el.style.cssText = 'position:absolute;pointer-events:none;' + css;
    return el;
  }

  window.toePreviewAfterFit = function () {
    var html = document.documentElement;
    document.querySelectorAll('.toeGuides,.toeFooter').forEach(function (el) { el.remove(); });

    // Move each page start to the top of the next page. They are done in order, because moving one
    // moves everything after it.
    var starts = Array.prototype.slice.call(root.querySelectorAll('.pageStart'));
    starts.forEach(function (el) { el.style.setProperty('--toe-gap', '0px'); });
    starts.forEach(function (el) {
      var at = top(el);
      el.style.setProperty('--toe-gap', ((Math.floor(at / PAGE) + 1) * PAGE - at) + 'px');
    });

    var end = root.getBoundingClientRect().bottom + window.pageYOffset;
    var pages = Math.max(1, Math.ceil((end - 1) / PAGE));

    // The footer, once on each page
    var footer = document.querySelector('.pageFooter');
    if (footer) {
      footer.style.display = 'none';
      for (var page = 1; page <= pages; page++) {
        var copy = footer.cloneNode(true);
        copy.className += ' toeFooter';
        copy.style.cssText = 'display:block;position:absolute;margin:0;bottom:auto;top:0;left:' + LEFT + 'px;width:' + BODY + 'px';
        document.body.appendChild(copy);
        copy.style.top = (page * PAGE - FOOTER_BOTTOM - copy.offsetHeight) + 'px';
      }
    }

    // The edges and margins of each page
    var guides = box('toeGuides', 'left:0;top:0;width:' + PAGE_WIDTH + 'px;height:' + pages * PAGE + 'px;z-index:2147483000');
    for (var n = 0; n < pages; n++) {
      var y = n * PAGE;
      if (n > 0) guides.appendChild(box('', 'left:0;width:100%;top:' + (y - 1) + 'px;height:2px;background:#8b93a1'));
      guides.appendChild(box('', 'left:' + LEFT + 'px;width:' + BODY + 'px;top:' + (y + TOP) + 'px;height:' + Math.max(0, PAGE - TOP - BOTTOM) + 'px;box-sizing:border-box;border:1px dotted rgba(0,0,0,0.18)'));
      var label = box('', 'right:4px;top:' + (y + 4) + 'px;padding:1px 6px;border-radius:3px;background:#8b93a1;color:#fff;font:600 10px/14px sans-serif');
      label.textContent = 'Page ' + (n + 1);
      guides.appendChild(label);
    }
    document.body.appendChild(guides);

    parent.postMessage({
      type: 'toe-preview-info',
      pages: pages,
      maxPages: MAX_PAGES || null,
      fontPx: parseFloat(html.style.fontSize) || NORMAL_SIZE,
      normalPx: NORMAL_SIZE,
      fit: settings.fit,
      fits: !(MAX_PAGES > 0 && pages > MAX_PAGES),
      heightPx: pages * PAGE
    }, '*');
  };

  // Which part of the menu was clicked: the nearest thing marked data-pick, or the page itself
  document.addEventListener('click', function (event) {
    var target = event.target;
    var marked = target && target.closest ? target.closest('[data-pick]') : null;
    parent.postMessage({ type: 'toe-preview-pick', pick: marked ? marked.getAttribute('data-pick') : 'page' }, '*');
  });
})();
`;
