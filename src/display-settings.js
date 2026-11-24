export const interfaceScales = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
export const defaultInterfaceScale = 1.25;

export function normalizeInterfaceScale(value) {
  const scale = Number(value);
  return interfaceScales.includes(scale) ? scale : defaultInterfaceScale;
}

export function adjacentInterfaceScale(value, direction) {
  const index = interfaceScales.indexOf(normalizeInterfaceScale(value));
  return interfaceScales[Math.max(0, Math.min(interfaceScales.length - 1, index + Math.sign(direction)))];
}

export function normalizePaneFontZoom(value) {
  const zoom = Number(value);
  return Number.isFinite(zoom) ? Math.max(-4, Math.min(10, zoom)) : 0;
}

export function sidebarDragWidth(width, delta, scale, viewportWidth) {
  return Math.max(190, Math.min(420, width + delta / scale, (viewportWidth - 480) / scale));
}
