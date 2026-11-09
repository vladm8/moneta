import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { pdfTextLines } from "./pdfText";
import type { DocumentText, TextBox } from "./documentRecognition";

GlobalWorkerOptions.workerSrc = workerUrl;
export type PDFPage = {
  text: string;
  boxes?: TextBox[];
  preview: string;
  ocr: boolean;
};

export async function readPDF(
  file: File,
  options: {
    signal: AbortSignal;
    recognize: (image: Blob) => Promise<DocumentText>;
    progress: (value: number) => void;
  },
): Promise<PDFPage[]> {
  const base = new URL(`${import.meta.env.BASE_URL}pdf/`, location.href).href;
  const task = getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: base + "cmaps/",
    cMapPacked: true,
    standardFontDataUrl: base + "standard_fonts/",
    wasmUrl: base + "wasm/",
  });
  const abort = () => {
    void task.destroy();
  };
  options.signal.addEventListener("abort", abort, { once: true });
  try {
    options.signal.throwIfAborted();
    const doc = await task.promise;
    if (doc.numPages > 20) throw new Error("Use a PDF with at most 20 pages.");
    const pages: PDFPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      options.signal.throwIfAborted();
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = pdfTextLines(content.items.filter((i) => "str" in i));
      let boxes: TextBox[] | undefined = content.items
        .filter((i) => "str" in i)
        .map((i) => ({
          text: i.str,
          x: i.transform[4],
          y: -i.transform[5] - i.height / 2,
          width: i.width,
          height: i.height,
        }));
      const viewport = page.getViewport({ scale: 1 });
      const scale = Math.min(
        2,
        Math.sqrt(4000000 / (viewport.width * viewport.height)),
        4096 / Math.max(viewport.width, viewport.height),
      );
      const rendered = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(rendered.width);
      canvas.height = Math.ceil(rendered.height);
      try {
        await page.render({ canvas, viewport: rendered }).promise;
        options.signal.throwIfAborted();
        // A text-only summary is still a valid page. OCR is for missing text layers,
        // not a second attempt to turn balances and headers into transactions.
        const ocr = text.replace(/\s/g, "").length < 30;
        if (ocr) {
          const blob = await new Promise<Blob>((resolve, reject) =>
            canvas.toBlob(
              (b) =>
                b ? resolve(b) : reject(new Error("Cannot read PDF page.")),
              "image/png",
            ),
          );
          const result = await options.recognize(blob);
          text = result.text;
          boxes = result.boxes;
        }
        options.signal.throwIfAborted();
        pages.push({
          text,
          boxes,
          preview: canvas.toDataURL("image/jpeg", 0.75),
          ocr,
        });
        options.progress((n / doc.numPages) * 100);
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return pages;
  } catch (error) {
    if ((error as Error).name === "PasswordException")
      throw new Error(
        "This PDF is password protected. Remove its password locally and try again.",
      );
    if ((error as Error).name === "InvalidPDFException")
      throw new Error("This PDF is damaged or invalid.");
    throw error;
  } finally {
    options.signal.removeEventListener("abort", abort);
    await task.destroy();
  }
}
