// The script inside the printed menu page. It fits the menu to its pages and decides where pages
// start, in the browser, because only the browser knows how tall the text really is in the font it
// ends up using.
//
// With fit "shrink-to-pages" it scales every font (all sizes in the stylesheet are rem-based) to the
// largest root size that still fits maxPages, never above the normal size. With fit "none" it leaves the
// sizes alone. Either way it starts each later page itself: the page margin is 0 (so browsers have no
// room to print their URL/date headers and footers), so the top margin is built here, with a hard page
// break on an element that carries its own top padding. That way a page's top margin never depends on
// the browser's exact page height. An item (and a section heading with its first item) is never split
// across pages, and the bottom keeps room for the footer.
//
// What it needs to know comes from data- attributes on #menuRoot (set by render.ts):
//   data-page-height-px, data-top-px, data-bottom-px, data-max-pages (empty = no limit), data-fit.
export const FIT_SCRIPT = `
(function () {
  var rootElement = document.getElementById('menuRoot');
  var settings = rootElement.dataset;
  var PAGE = Number(settings.pageHeightPx);   // page height in CSS px, used only to simulate breaks
  var TOP = Number(settings.topPx);           // margin kept above the content on each page
  var BOTTOM = Number(settings.bottomPx);     // margin kept below it: room for the footer
  var MAX_PAGES = Number(settings.maxPages) || 0;
  var SHRINK = settings.fit === 'shrink-to-pages' && MAX_PAGES > 0;
  var SLACK = 6;                 // px of rounding slack at the bottom of each page
  var MIN_SIZE = 3;              // px, last-resort floor so the page limit always holds
  var MAX_SIZE = 16;             // px, the normal size used for short menus

  // Undo the page starts from an earlier run so the menu can be measured and fitted afresh
  function clearBreaks(root) {
    root.querySelectorAll('.pageStart').forEach(function (el) { el.classList.remove('pageStart'); });
    root.querySelectorAll('.continuation').forEach(function (cont) {
      var previous = cont.previousElementSibling;
      var table = previous.querySelector('.itemTable');
      Array.prototype.slice.call(cont.querySelectorAll('.itemGroup')).forEach(function (group) {
        table.appendChild(group);
      });
      cont.remove();
    });
  }

  // The pieces that must not be split: the logo, a section heading together with its
  // first item, and each remaining item. Positions are measured from the page's top edge.
  function units(root) {
    var found = [];
    var origin = root.getBoundingClientRect().top - TOP;
    function add(kind, el, first, last) {
      var a = first.getBoundingClientRect();
      var b = last.getBoundingClientRect();
      found.push({ kind: kind, el: el, top: a.top - origin, bottom: b.bottom - origin });
    }
    var logo = root.querySelector('.menuLogoUnit');
    if (logo) add('logo', logo, logo, logo);
    var title = root.querySelector('.menuTitle');
    if (title) add('title', title, title, title);
    root.querySelectorAll('.subMenuDiv').forEach(function (section) {
      var heading = section.querySelector('.subMenuHeader');
      var groups = section.querySelectorAll('.itemGroup');
      if (groups.length === 0) { add('lead', section, heading, heading); return; }
      add('lead', section, heading, groups[0]);
      for (var i = 1; i < groups.length; i++) add('item', groups[i], groups[i], groups[i]);
    });
    return found;
  }

  // Which units start a new page, and where the menu ends once they have
  function paginate(root) {
    var shift = 0;
    var end = 0;
    var starts = [];
    units(root).forEach(function (u) {
      var top = u.top + shift;
      var bottom = u.bottom + shift;
      var page = Math.floor(top / PAGE);
      var limit = page * PAGE + PAGE - BOTTOM - SLACK;
      if (bottom - top < PAGE - TOP - BOTTOM && bottom > limit) {
        var push = (page + 1) * PAGE + TOP - top;
        starts.push(u);
        shift += push;
        bottom += push;
      }
      end = bottom;
    });
    return { end: end, starts: starts };
  }

  function fits(root) {
    return paginate(root).end <= MAX_PAGES * PAGE - BOTTOM - SLACK;
  }

  // Start a new page at each unit that would not fit on the current one
  function applyBreaks(root) {
    paginate(root).starts.forEach(function (u) {
      if (u.kind !== 'item') {
        u.el.classList.add('pageStart');
        return;
      }
      // An item in the middle of a section: carry it and the items after it over into
      // a continuation of the section, which begins the new page
      var section = u.el.closest('.subMenuDiv');
      var continuation = document.createElement('div');
      continuation.className = 'subMenuDiv continuation pageStart';
      var table = continuation.appendChild(document.createElement('div')).appendChild(document.createElement('table'));
      table.className = 'itemTable';
      var group = u.el;
      while (group) {
        var next = group.nextElementSibling;
        table.appendChild(group);
        group = next;
      }
      section.parentNode.insertBefore(continuation, section.nextSibling);
    });
  }

  function fit() {
    var root = rootElement;
    var html = document.documentElement;
    clearBreaks(root);
    function fitsAt(size) {
      html.style.fontSize = size + 'px';
      return fits(root);
    }
    if (SHRINK) {
      if (!fitsAt(MAX_SIZE)) {
        var lo = MIN_SIZE;
        var hi = MAX_SIZE;
        for (var i = 0; i < 14; i++) {
          var mid = (lo + hi) / 2;
          if (fitsAt(mid)) { lo = mid; } else { hi = mid; }
        }
        if (!fitsAt(lo)) {
          console.warn('Menu does not fit on ' + MAX_PAGES + ' pages even at ' + MIN_SIZE + 'px');
        }
      }
    } else {
      html.style.fontSize = MAX_SIZE + 'px';
    }
    applyBreaks(root);
    // The designer's preview adds the page edges and footers (previewScript.ts); the print view has none
    if (window.toePreviewAfterFit) window.toePreviewAfterFit();
  }

  function run() { fit(); }
  window.addEventListener('beforeprint', run);
  window.addEventListener('load', run);
  // Text widths change when the web font arrives, so fit again once it has loaded
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  run();
})();
`;
