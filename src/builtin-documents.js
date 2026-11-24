import demo from '../builtin/demo.md?raw';
import architecture from '../builtin/2026-Architecture-Blueprint.md?raw';
import illustration from '../builtin/assets/demo-illustration.svg?raw';
import {welcomeMarkdown,diagramMarkdown} from './default-documents.js';
import commonDiagrams from '../builtin/Mermaid 常用图表示例.md?raw';
import {createBuiltinLibrary,svgDataUrl} from './builtin-library.js';
import {builtinDocumentRecords} from './preset-catalog.js';

const content={demo,architecture,welcome:welcomeMarkdown,diagrams:diagramMarkdown,'common-diagrams':commonDiagrams};
export const builtinLibrary=createBuiltinLibrary(builtinDocumentRecords.map(entry=>({...entry,markdown:content[entry.id]})),{'assets/demo-illustration.svg':svgDataUrl(illustration)});
