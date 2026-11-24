export const flagFontFamily = 'Markdown Desk Flags';
export const containsFlags = text => /[\u{1F1E6}-\u{1F1FF}\u{1F3C1}\u{1F3F3}\u{1F3F4}\u{1F38C}\u{1F6A9}]/u.test(text || '');
export async function waitForFlagFont(text) {
  if (containsFlags(text)) await document.fonts.load(`18px "${flagFontFamily}"`, text);
}
