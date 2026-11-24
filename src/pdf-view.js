import { invoke } from '@tauri-apps/api/core';

const id = new URLSearchParams(location.search).get('job');
try {
  const html = await invoke('pdf_job', { id });
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.title = parsed.title;
  for (const style of parsed.head.querySelectorAll('style')) document.head.append(document.importNode(style, true));
  document.body.replaceChildren(...[...parsed.body.childNodes].map((node) => document.importNode(node, true)));
  document.body.getBoundingClientRect();
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode()));
  // Hidden WebView2 windows can suspend animation frames. Force layout rather
  // than waiting for requestAnimationFrame before starting the native export.
  document.body.getBoundingClientRect();
  await invoke('pdf_ready', { id });
} catch (error) {
  await invoke('pdf_failed', { id, message: String(error) }).catch(() => {});
}
