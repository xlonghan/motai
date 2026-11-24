// Cherry's getMarkdown() can be the last rendered value during its debounce.
// Use the public CodeMirror document for saving/switching the live source.
export function editorMarkdown(editor) {
  return editor?.getCodeMirror?.()?.state?.doc?.toString() ?? editor?.getMarkdown?.() ?? '';
}

// Commands still use Cherry's toolbar handlers, while the application owns the
// visible toolbar. Its default switchModel flag would reserve a hidden 48px row.
export function switchEditorMode(editor,mode) { editor.switchModel(mode,false); }
