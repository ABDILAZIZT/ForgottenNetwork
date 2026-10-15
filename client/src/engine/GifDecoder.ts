import { parseGIF, decompressFrame, type ParsedFrame } from 'gifuct-js';

export interface GifFrame {
  canvas: HTMLCanvasElement;
  delay: number;
}

export class GifDecoder {
  static async decode(url: string): Promise<GifFrame[]> {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Failed to fetch GIF: ${response.status}`);
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength < 10 || buffer.byteLength > 8 * 1024 * 1024)
      throw new Error('GIF must be under 8 MB.');
    const gif = parseGIF(buffer);
    const width = gif.lsd.width,
      height = gif.lsd.height;
    const encoded = gif.frames.filter((frame) => 'image' in frame);
    if (
      !width ||
      !height ||
      width > 2048 ||
      height > 2048 ||
      !encoded.length ||
      encoded.length > 120 ||
      width * height * encoded.length > 16777216
    )
      throw new Error('GIF exceeds the supported dimensions or frame count.');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const patch = document.createElement('canvas');
    const saved = document.createElement('canvas');
    saved.width = width;
    saved.height = height;
    const savedCtx = saved.getContext('2d')!;
    const result: GifFrame[] = [];
    let previous: ParsedFrame | undefined;
    for (const source of encoded) {
      // Dispose the PREVIOUS frame only after it has been displayed.
      if (previous?.disposalType === 2) {
        const d = previous.dims;
        ctx.clearRect(d.left, d.top, d.width, d.height);
        const background = gif.gct?.[gif.lsd.backgroundColorIndex];
        if (previous.transparentIndex === undefined && background) {
          ctx.fillStyle = `rgb(${background.join(',')})`;
          ctx.fillRect(d.left, d.top, d.width, d.height);
        }
      } else if (previous?.disposalType === 3) {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(saved, 0, 0);
      }
      const frame = decompressFrame(source, gif.gct, true);
      if (frame.disposalType === 3) {
        savedCtx.clearRect(0, 0, width, height);
        savedCtx.drawImage(canvas, 0, 0);
      }
      patch.width = frame.dims.width;
      patch.height = frame.dims.height;
      patch
        .getContext('2d')!
        .putImageData(
          new ImageData(new Uint8ClampedArray(frame.patch), patch.width, patch.height),
          0,
          0,
        );
      // Source-over keeps prior pixels behind transparent parts of a delta frame.
      ctx.drawImage(patch, frame.dims.left, frame.dims.top);
      const snapshot = document.createElement('canvas');
      snapshot.width = width;
      snapshot.height = height;
      snapshot.getContext('2d')!.drawImage(canvas, 0, 0);
      result.push({ canvas: snapshot, delay: Math.max(20, frame.delay || 100) });
      previous = frame;
      // Decode one frame at a time; never decompress the whole animation on the UI thread at once.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return result;
  }
}
