import type { Worker } from "tesseract.js";
import { visualLines, type DocumentText } from "./documentRecognition";

// Upscale small screenshots and normalize dark backgrounds without destroying antialiasing.
export async function readImage(
  file: Blob,
  worker: Worker,
): Promise<DocumentText & { confidence: number }> {
  const bitmap = await createImageBitmap(file);
  if (bitmap.width * bitmap.height > 16000000) {
    bitmap.close();
    throw new Error("Use an image smaller than 16 megapixels.");
  }
  const scale = Math.min(
    Math.max(1, 1600 / bitmap.width),
    3,
    Math.sqrt(6000000 / (bitmap.width * bitmap.height)),
  );
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  try {
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const samples: number[] = [];
    for (let i = 0; i < pixels.data.length; i += 400)
      samples.push(
        (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3,
      );
    samples.sort((a, b) => a - b);
    const dark = samples[Math.floor(samples.length * 0.5)] < 110;
    for (let i = 0; i < pixels.data.length; i += 4) {
      let gray =
        0.299 * pixels.data[i] +
        0.587 * pixels.data[i + 1] +
        0.114 * pixels.data[i + 2];
      if (dark) gray = 255 - gray;
      gray = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = gray;
    }
    context.putImageData(pixels, 0, 0);
    const result = await worker.recognize(
      canvas,
      { rotateAuto: true },
      { blocks: true, text: true },
    );
    const boxes = result.data.blocks?.flatMap((b) =>
      b.paragraphs.flatMap((p) =>
        p.lines.flatMap((l) =>
          l.words.map((w) => ({
            text: w.text,
            x: w.bbox.x0,
            y: (w.bbox.y0 + w.bbox.y1) / 2,
            width: w.bbox.x1 - w.bbox.x0,
            height: w.bbox.y1 - w.bbox.y0,
          })),
        ),
      ),
    );
    return {
      text: boxes?.length
        ? visualLines(boxes)
            .map((l) => l.text)
            .join("\n")
        : result.data.text,
      boxes,
      confidence: result.data.confidence,
    };
  } finally {
    bitmap.close();
    canvas.width = canvas.height = 0;
  }
}
