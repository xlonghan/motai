const fence = '```';
// Match the optional size and alignment markers accepted by Cherry's Mermaid fence.
const mermaidFenceOptions = /#(?:[0-9]+(?:px|em|pt|pc|in|mm|cm|ex|%)|auto|center|right|left|float-right|float-left)/gi;

export const snippets = {
  flowchart: `${fence}mermaid\nflowchart LR\n  A[开始] --> B{判断条件}\n  B -->|是| C[执行操作]\n  B -->|否| D[结束]\n${fence}\n`,
  sequence: `${fence}mermaid\nsequenceDiagram\n  participant U as 用户\n  participant S as 服务\n  U->>S: 发送请求\n  S-->>U: 返回结果\n${fence}\n`,
  class: `${fence}mermaid\nclassDiagram\n  class Document {\n    +String title\n    +save()\n  }\n${fence}\n`,
  table: '| 标题 | 内容 |\n| --- | --- |\n| 第一项 | 在这里填写 |\n',
};

export function createDocument(name = '未命名文档.md', markdown = '') {
  return {
    id: crypto.randomUUID(),
    name: safeFileName(name),
    markdown,
    updatedAt: Date.now(),
  };
}

export function safeFileName(name) {
  const cleaned = String(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim();
  let base = cleaned.replace(/\.(md|markdown)$/i, '').replace(/[. ]+$/, '').trim() || '未命名文档';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(base)) base = `_${base}`;
  return `${base.slice(0, 100)}.md`;
}

// One shared metadata pass avoids multiple full-document arrays on each edit.
export function analyzeMarkdown(markdown) {
  let fenceCharacter = '';
  let fenceLength = 0;
  let diagrams = 0;
  let lines = 0;
  const headings = [];
  let start = 0;
  while (start <= markdown.length) {
    const newline = markdown.indexOf('\n', start);
    const end = newline < 0 ? markdown.length : newline;
    const line = markdown.slice(start, end).replace(/\r$/, '');
    lines++;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fenceCharacter) {
        fenceCharacter = marker[1][0];
        fenceLength = marker[1].length;
        const language = marker[2].replace(mermaidFenceOptions, '').trim().split(/\s+/, 1)[0].toLowerCase();
        if (language === 'mermaid') diagrams++;
      } else if (marker[1][0] === fenceCharacter && marker[1].length >= fenceLength && !marker[2].trim()) {
        fenceCharacter = '';
      }
    } else if (!fenceCharacter) {
      const match = line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (match) headings.push({ level: match[1].length, title: match[2].replace(/[*_`]/g, ''), line: lines });
    }
    if (newline < 0) break;
    start = newline + 1;
  }
  // UTF-16 length minus surrogate pairs is the code-point count, with no
  // Array.from(markdown) allocation for ordinary Chinese/English documents.
  const pairs = markdown.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g);
  return { headings, diagrams, lines, characters: markdown.length - (pairs?.length || 0) };
}

export function getOutline(markdown) { return analyzeMarkdown(markdown).headings; }
export function diagramCount(markdown) { return analyzeMarkdown(markdown).diagrams; }
