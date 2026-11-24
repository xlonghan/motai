import { chromium } from 'playwright-core';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFString } from 'pdf-lib';

let busy = false;

async function normalizeOutline(pdfBytes, headingTitles) {
  const document = await PDFDocument.load(pdfBytes, { updateMetadata: false });
  const outlines = document.catalog.lookupMaybe(PDFName.of('Outlines'), PDFDict);
  if (!outlines) return pdfBytes;
  const seen = new Set();
  let changed = false;
  function walk(reference) {
    while (reference && !seen.has(reference)) {
      seen.add(reference);
      const item = document.context.lookup(reference, PDFDict);
      const title = item.lookup(PDFName.of('Title'));
      if (title instanceof PDFHexString || title instanceof PDFString) {
        const text = title.decodeText();
        const actual = headingTitles.find((heading) => text === heading + heading);
        if (actual && !headingTitles.includes(text)) {
          item.set(PDFName.of('Title'), PDFHexString.fromText(actual));
          changed = true;
        }
      }
      const child = item.get(PDFName.of('First'));
      if (child) walk(child);
      reference = item.get(PDFName.of('Next'));
    }
  }
  walk(outlines.get(PDFName.of('First')));
  return changed ? Buffer.from(await document.save({ useObjectStreams: true })) : pdfBytes;
}

export class PdfError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}

// Local document generation reuses an installed engine; no browser download.
export async function generatePdf(html) {
  if (busy) throw new PdfError('另一个 PDF 正在生成，请稍后再试', 429);
  busy = true;
  let browser;
  try {
    for (const channel of ['msedge', 'chrome']) {
      try {
        browser = await chromium.launch({ channel, headless: true, chromiumSandbox: true, timeout: 10000 });
        break;
      } catch (error) { console.warn(`[pdf] ${channel}: ${error.message.split('\n')[0]}`); }
    }
    if (!browser) throw new PdfError('无法启动本机 PDF 引擎。请确认已安装 Edge 或 Chrome，并使用「启动.cmd」运行墨台。');
    const context = await browser.newContext({ offline: true, javaScriptEnabled: false });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    await page.setContent(html, { waitUntil: 'load', timeout: 25000 });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((image) => image.decode().catch(() => {})));
      for (const image of document.images) if (!image.naturalWidth) throw new Error('图片未完成加载');
    });
    const headingTitles = await page.locator('h1,h2,h3,h4,h5,h6').allTextContents();
    const result = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false, outline: true, tagged: true, timeout: 30000 });
    return await normalizeOutline(result, headingTitles);
  } catch (error) {
    if (error instanceof PdfError) throw error;
    throw new PdfError(`PDF 生成失败：${error.message?.split('\n')[0] || '请重试'}`);
  } finally {
    await browser?.close().catch(() => {});
    busy = false;
  }
}
