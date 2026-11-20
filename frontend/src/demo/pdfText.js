/** Reads the text of a PDF in the browser (demo site only; the real app does this on the server with PDFBox). */
export async function readPdfPages(file) {
  const [pdfjs, { default: PdfWorker }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker'), // bundled as a normal .js worker file
  ]);
  if (!pdfjs.GlobalWorkerOptions.workerPort) pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => (item.str ?? '') + (item.hasEOL ? '\n' : ' ')).join(''));
  }
  return pages;
}
