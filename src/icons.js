import {
  Activity, Apple, ArrowDown, ArrowDownUp, ArrowRight, ArrowUp, Bold, Boxes, Car,
  CaseSensitive, ChartPie, Check, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown,
  CircleHelp, ClipboardPaste, Clock, CodeXml, Columns2, Copy, Database, Download,
  ExternalLink, Eye, FileCode, FilePlus, FileText, Flag, Folder, FolderOpen, GitBranch, Hand,
  Heading, Heading1, Heading2, Heading3, Heading4, Heading5, Heading6, Heart, Image, Italic, Kanban,
  Keyboard, Layers, Lightbulb, Link2, List, ListOrdered, ListTree, Maximize, Minus, Moon, MoveHorizontal,
  Network, PanelLeft, PawPrint, Plus, Printer, Puzzle, Quote, Redo2, RefreshCw, Regex,
  RotateCcw, Save, Scan, Scissors, Search, Settings, SlidersHorizontal, Smile, Strikethrough, Sun, Table,
  Trash2, Undo2, Upload, Waypoints, WholeWord, Workflow, WrapText, X, ZoomIn, ZoomOut,
} from 'lucide';

const icons = {
  activity: Activity, advanced: SlidersHorizontal, apple: Apple, arrow: ArrowRight,
  'arrow-down': ArrowDown, 'arrow-down-up': ArrowDownUp, 'arrow-up': ArrowUp,
  bold: Bold, boxes: Boxes, car: Car, 'case-sensitive': CaseSensitive, 'chart-pie': ChartPie,
  check: Check, chevron: ChevronDown, 'chevron-right': ChevronRight,
  'chevrons-down-up': ChevronsDownUp, 'chevrons-up-down': ChevronsUpDown,
  clock: Clock, close: X, code: CodeXml, copy: Copy, cut: Scissors,
  database: Database, download: Download, 'external-link': ExternalLink, eye: Eye,
  file: FileText, 'file-plus': FilePlus, flag: Flag, folder: Folder, 'folder-open': FolderOpen,
  'git-branch': GitBranch, graph: Network, hand: Hand, heading: Heading,
  'heading-1': Heading1, 'heading-2': Heading2, 'heading-3': Heading3,
  'heading-4': Heading4, 'heading-5': Heading5, 'heading-6': Heading6,
  heart: Heart, help: CircleHelp, image: Image, italic: Italic, kanban: Kanban,
  keyboard: Keyboard, layers: Layers, lightbulb: Lightbulb, link: Link2, list: List,
  markdown: FileCode, maximize: Maximize, minus: Minus, moon: Moon,
  'move-horizontal': MoveHorizontal, ordered: ListOrdered, outline: ListTree, panel: PanelLeft,
  paste: ClipboardPaste, 'paw-print': PawPrint, plus: Plus, printer: Printer, puzzle: Puzzle,
  quote: Quote, redo: Redo2, refresh: RefreshCw, regex: Regex,
  'rotate-ccw': RotateCcw, save: Save, search: Search, select: Scan, settings: Settings,
  smile: Smile, split: Columns2, strikethrough: Strikethrough, sun: Sun, table: Table,
  trash: Trash2, undo: Undo2, upload: Upload,
  waypoints: Waypoints, 'whole-word': WholeWord, workflow: Workflow, wrap: WrapText,
  'zoom-in': ZoomIn, 'zoom-out': ZoomOut,
};

const svgNamespace = 'http://www.w3.org/2000/svg';

export function iconNodes(name) {
  return Object.hasOwn(icons, name) ? icons[name] : icons.file;
}

export function iconAttributes(name, size) {
  return {
    xmlns: svgNamespace,
    class: 'lucide-icon',
    'data-icon': Object.hasOwn(icons, name) ? name : 'file',
    'aria-hidden': 'true',
    focusable: 'false',
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.75,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  };
}

export function createIcon(name, ownerDocument = document, size = 16) {
  const svg = ownerDocument.createElementNS(svgNamespace, 'svg');
  for (const [key, value] of Object.entries(iconAttributes(name, size))) svg.setAttribute(key, value);
  for (const [tag, attributes] of iconNodes(name)) {
    const element = ownerDocument.createElementNS(svgNamespace, tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    svg.append(element);
  }
  return svg;
}

function attributeMarkup(attributes) {
  return Object.entries(attributes).map(([key, value]) => {
    const escaped = String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    return ` ${key}="${escaped}"`;
  }).join('');
}

export function iconMarkup(name, size = 16) {
  const content = iconNodes(name).map(([tag, attributes]) => `<${tag}${attributeMarkup(attributes)}></${tag}>`).join('');
  return `<svg${attributeMarkup(iconAttributes(name, size))}>${content}</svg>`;
}
