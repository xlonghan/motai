import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramCount, getOutline, safeFileName } from '../src/documents.js';
import {readFileSync} from 'node:fs';
const diagramMarkdown=readFileSync(new URL('../builtin/Mermaid 示例集.md',import.meta.url),'utf8');
import { createHtmlDocument } from '../src/export-document.js';
import mermaid from 'mermaid';
import { mermaidCatalog, mermaidSnippet } from '../src/mermaid-catalog.js';

test('Every built-in Mermaid diagram detector has an insertable template', () => {
  mermaid.initialize({ startOnLoad: false });
  const expected = mermaid.getRegisteredDiagramsMetadata().map(({ id }) => id).filter((id) => !['error', '---'].includes(id));
  const covered = mermaidCatalog.flatMap((item) => item.detectors);
  assert.deepEqual([...covered].sort(), expected.sort());
  assert.equal(new Set(mermaidCatalog.map((item) => item.id)).size, mermaidCatalog.length);
  for (const item of mermaidCatalog) assert.equal(diagramCount(mermaidSnippet(item.id)), 1, item.id);
});

test('Markdown examples inside a longer fence must not be mistaken for live Mermaid diagrams or headings', () => {
  const source = '# 文档\n\n````markdown\n# 示例标题\n```mermaid#center\nflowchart LR\n A-->B\n```\n````\n\n## 正文\n\n~~~mermaid\nsequenceDiagram\n A->>B: 中文\n~~~\n';
  assert.deepEqual(getOutline(source).map((heading) => heading.title), ['文档', '正文']);
  assert.equal(diagramCount(source), 1);
});

test('Mermaid fences with Cherry alignment and size options count as diagrams', () => {
  const fence = '```';
  const diagram = options => `${fence}${options}\nflowchart LR\n A-->B\n${fence}`;
  for (const options of ['mermaid#center', 'MERMAID#300px#45%#RIGHT', 'mermaid#left', 'mermaid #auto #float-left', 'mermaid#float-right', ...['em','pt','pc','in','mm','cm','ex'].map(unit => `mermaid#2${unit}`)]) {
    assert.equal(diagramCount(diagram(options)), 1, options);
  }
  for (const options of ['mermaid#centered', 'mermaid#30vw', 'javascript#center']) {
    assert.equal(diagramCount(diagram(options)), 0, options);
  }
});

test('The multiple-diagram acceptance document includes four actual Mermaid blocks', () => {
  assert.equal(diagramCount(diagramMarkdown), 4);
});

test('Local export names remain valid on Windows and preserve Chinese', () => {
  assert.equal(safeFileName('中文流程图.markdown'), '中文流程图.md');
  assert.equal(safeFileName('CON.md'), '_CON.md');
  assert.equal(safeFileName('需求:分析/结果?.md'), '需求-分析-结果-.md');
  assert.equal(safeFileName('  '), '未命名文档.md');
});

test('Standalone HTML retains rendered SVG, selectable Chinese and inline styles without requiring a Mermaid script', () => {
  const svg = '<svg viewBox="0 0 120 60"><text>中文节点</text></svg>';
  const html = createHtmlDocument('分析 & </title><script>bad()</script>', `<h1>可选择的文字</h1>${svg}`, 'svg{fill:green}');
  assert.ok(html.includes(svg));
  assert.ok(html.includes('可选择的文字'));
  assert.ok(html.includes('svg{fill:green}'));
  assert.ok(html.includes('&lt;/title&gt;&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('@page{size:A4'));
});
