import type { Worker } from "tesseract.js";

export interface ScreenshotRegion { text: string; x: number; y: number; width: number; height: number }
const imageRegions = new WeakMap<HTMLImageElement, ScreenshotRegion[]>();
export const getScreenshotRegions = (image: HTMLImageElement) => imageRegions.get(image) ?? [];

export interface Screenshot {
  id: string;
  url: string;
  image: HTMLImageElement;
}

export async function loadScreenshot(file: Blob): Promise<Screenshot> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error("Paste a PNG, JPG, or WebP screenshot.");
  if (file.size > 12 * 1024 * 1024) throw new Error("That image is too large. Crop the question and paste it again.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 32_000_000) {
      throw new Error("That image is too large. Crop the question and paste it again.");
    }
    return { id: crypto.randomUUID(), url, image };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error instanceof Error && error.message.startsWith("That image")
      ? error : new Error("Couldn’t open that image. Copy the screenshot again.");
  }
}

/** Local OCR only. Worker, WASM, and English data are served by this app. */
export async function readScreenshot(screenshot: Screenshot, signal: AbortSignal, onProgress: (progress: number) => void): Promise<string> {
  let worker: Worker | undefined;
  let finished = false;
  let abort = () => {};
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<string>((resolve, reject) => {
      abort = () => reject(new DOMException("Cancelled", "AbortError"));
      if (signal.aborted) { abort(); return; }
      signal.addEventListener("abort", abort, { once: true });
      timeout = setTimeout(() => reject(new Error("Reading took too long. Try again or enter the question below.")), 90_000);
      void (async () => {
        const { createWorker, PSM } = await import("tesseract.js");
        if (finished || signal.aborted) return;
        worker = await createWorker("eng", 1, {
          workerPath: "/ocr/worker.min.js",
          corePath: "/ocr/core",
          langPath: "/ocr/lang",
          workerBlobURL: false,
          logger: ({ status, progress }) => {
            if (!finished && !signal.aborted && status === "recognizing text") onProgress(progress);
          },
          errorHandler: () => reject(new Error("Couldn’t read that image. Try again or enter the question below.")),
        });
        if (finished || signal.aborted) { await worker.terminate(); return; }
        await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO, user_defined_dpi: "150" });
        // Bound memory use on large iPad screenshots and composite transparency.
        const image = screenshot.image;
        const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(image.naturalWidth * scale);
        canvas.height = Math.round(image.naturalHeight * scale);
        const context = canvas.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
        if (!signal.aborted && !finished) {
          imageRegions.set(image, (data.blocks ?? []).flatMap(block => block.paragraphs.flatMap(paragraph => paragraph.lines.flatMap(line => line.words.flatMap(word =>
            (word.symbols?.length ? word.symbols : [word]).map(symbol => ({ text: symbol.text, x: symbol.bbox.x0 / canvas.width, y: symbol.bbox.y0 / canvas.height, width: (symbol.bbox.x1 - symbol.bbox.x0) / canvas.width, height: (symbol.bbox.y1 - symbol.bbox.y0) / canvas.height }))
          )))).slice(0, 300));
        }
        resolve(data.text.trim());
      })().catch(reject);
    });
  } finally {
    finished = true;
    signal.removeEventListener("abort", abort);
    if (timeout) clearTimeout(timeout);
    if (worker) void worker.terminate();
  }
}
