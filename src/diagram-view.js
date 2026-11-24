// Preview zoom is UI state. Exports always start from the SVG's own viewBox.
import { createIcon } from './icons.js';

const states = new WeakMap();

export function diagramSize(svg) {
  const box = svg.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  const width = box?.[2] || Number.parseFloat(svg.getAttribute('width')) || 600;
  const height = box?.[3] || Number.parseFloat(svg.getAttribute('height')) || 400;
  return { width, height };
}

export function mermaidFigures(root) {
  return [...root.querySelectorAll('figure[data-type="mermaid"]')];
}

export function diagramSvg(figure) {
  return figure?.querySelector(':scope > .mermaid-viewport > svg, :scope > svg') ?? null;
}

export function prepareDiagrams(root, figures = mermaidFigures(root), fit = false, background = 'transparent') {
  for (const figure of figures) {
    const svg = diagramSvg(figure);
    if (!svg || svg.getAttribute('aria-roledescription') === 'error') continue;
    const document = figure.ownerDocument;
    svg.style.backgroundColor=background;
    if (states.has(svg)) continue;
    const size = diagramSize(svg);
    const state = { ...size, zoom: 1 };
    states.set(svg, state);
    let viewport = figure.querySelector('.mermaid-viewport');
    if (!viewport) {
      viewport = document.createElement('div');
      viewport.className = 'mermaid-viewport';
      svg.before(viewport);
      viewport.append(svg);
    }
    figure.querySelector('.mermaid-tools')?.remove();
    const tools = document.createElement('div');
    tools.className = 'mermaid-tools';
    tools.setAttribute('role', 'group');
    tools.setAttribute('aria-label', '图表缩放');
    const label = document.createElement('span');
    label.className = 'mermaid-zoom-value';
    const apply = (zoom) => {
      state.zoom = Math.max(.1, Math.min(4, zoom));
      svg.style.width = `${size.width * state.zoom}px`;
      svg.style.height = `${size.height * state.zoom}px`;
      svg.style.maxWidth = 'none';
      svg.style.display = 'block';
      svg.dataset.diagramZoom = String(state.zoom);
      label.textContent = `${Math.round(state.zoom * 100)}%`;
    };
    const button = (icon, title, action, caption = '') => {
      const element = document.createElement('button');
      element.type = 'button';
      element.append(createIcon(icon, figure.ownerDocument));
      if (caption) element.append(caption);
      element.title = title;
      element.setAttribute('aria-label', title);
      element.dataset.diagramAction = action;
      tools.append(element);
    };
    button('zoom-out', '缩小图表', 'out');
    tools.append(label);
    button('zoom-in', '放大图表', 'in');
    button('rotate-ccw', '图表原始大小', 'reset');
    button('move-horizontal', '图表适应宽度', 'fit', '适应宽度');
    button('maximize', '图表放大查看', 'expand', '放大查看');
    figure.prepend(tools);
    apply(fit && viewport.clientWidth ? Math.min(1, viewport.clientWidth / size.width) : 1);
  }
}

export function prepareExportDiagrams(root) {
  root.querySelectorAll('.mermaid-tools').forEach((element) => element.remove());
  for (const figure of mermaidFigures(root)) {
    const svg = diagramSvg(figure);
    if (!svg) continue;
    const { width } = diagramSize(svg);
    delete svg.dataset.diagramZoom;
    svg.style.width = `${width}px`;
    svg.style.height = 'auto';
    svg.style.maxWidth = 'none';
    svg.setAttribute('width', String(width));
    let viewport = figure.querySelector('.mermaid-viewport');
    if (!viewport) {
      viewport = figure.ownerDocument.createElement('div');
      viewport.className = 'mermaid-viewport';
      svg.before(viewport);
      viewport.append(svg);
    }
  }
}

// Delegate from the Vue host: Cherry can replace cached figure DOM during a
// partial render, so listeners and closures on individual buttons go stale.
export function diagramAction(event, onExpand) {
  const button = event.target.closest('[data-diagram-action]');
  if (!button) return;
  const figure = button.closest('figure[data-type="mermaid"]');
  if (!diagramSvg(figure)) return;
  event.preventDefault();
  event.stopPropagation();
  applyDiagramAction(figure, button.dataset.diagramAction, onExpand);
}

export function applyDiagramAction(figure, action, onExpand) {
  const svg = diagramSvg(figure);
  if (!svg) return;
  if (action === 'expand') { onExpand(svg); return; }
  const size = diagramSize(svg);
  const current = Number(svg.dataset.diagramZoom) || 1;
  const viewport = figure.querySelector('.mermaid-viewport');
  const zoom = Math.max(.1, Math.min(4, action === 'in' ? current * 1.25 : action === 'out' ? current / 1.25 : action === 'fit' ? viewport.clientWidth / size.width : 1));
  svg.dataset.diagramZoom = String(zoom);
  svg.style.width = `${size.width * zoom}px`;
  svg.style.height = `${size.height * zoom}px`;
  svg.style.maxWidth = 'none';
  figure.querySelector('.mermaid-zoom-value').textContent = `${Math.round(zoom * 100)}%`;
  if (action === 'reset' || action === 'fit') viewport.scrollLeft = 0;
}

export function standaloneDiagram(svg, extraStyles = '') {
  const clone = svg.cloneNode(true);
  const {width,height} = diagramSize(svg);
  if (extraStyles) {
    const style = document.createElementNS('http://www.w3.org/2000/svg','style');
    style.textContent = extraStyles;
    clone.prepend(style);
  }
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  clone.setAttribute('width',String(width));
  clone.setAttribute('height',String(height));
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.maxWidth = 'none';
  delete clone.dataset.diagramZoom;
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}
