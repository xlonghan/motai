import { createIcon } from './icons.js';

const searchIcons = {
  '.cherry-searcher__icon--search': 'search',
  '.cherry-searcher__clear': 'close',
  '.cherry-searcher__expand-btn': 'chevron-right',
  '[data-direction="prev"]': 'arrow-up',
  '[data-direction="next"]': 'arrow-down',
  '[data-type="caseSensitive"]': 'case-sensitive',
  '[data-type="wholeWord"]': 'whole-word',
  '[data-type="useRegex"]': 'regex',
};

function replaceSearchIcons(panel) {
  for (const [selector, name] of Object.entries(searchIcons)) {
    for (const glyph of panel.querySelectorAll(`${selector} > svg`)) {
      glyph.replaceWith(createIcon(name, glyph.ownerDocument));
    }
  }
}

function replaceCopyIcon(bubble) {
  if (!bubble.matches('.cherry-previewer-codeBlock-hover-handler')) return;
  const glyph = bubble.querySelector('.cherry-copy-code-block > i.ch-icon');
  if (!glyph || glyph.hasAttribute('data-lucide-copy-icon')) return;

  // Cherry toggles ch-icon-copy and ch-icon-ok on this exact element.
  glyph.setAttribute('data-lucide-copy-icon', '');
  glyph.append(createIcon('copy', glyph.ownerDocument), createIcon('check', glyph.ownerDocument));
  const control = glyph.parentElement;
  control.setAttribute('role', 'button');
  control.setAttribute('aria-label', '复制代码');
  control.tabIndex = 0;
  control.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    control.click();
  });
}

export function installCherryIcons(cherry) {
  const searchPanel = cherry.wrapperDom.querySelector('.cherry-searcher');
  if (searchPanel) replaceSearchIcons(searchPanel);

  const preview = cherry.getPreviewer().getDom();
  const parent = preview.parentElement;
  for (const child of parent.children) replaceCopyIcon(child);

  // The copy overlay is inserted beside the preview. Watch these siblings only.
  const observer = new MutationObserver(records => {
    for (const { addedNodes } of records) {
      for (const node of addedNodes) {
        if (node.nodeType === 1) replaceCopyIcon(node);
      }
    }
  });
  observer.observe(parent, { childList: true });
  return () => observer.disconnect();
}
