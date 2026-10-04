import { parseGIF, decompressFrames } from 'gifuct-js';

export interface GifFrame {
  canvas: HTMLCanvasElement;
  delay: number;
}

export class GifDecoder {
  static async decode(url: string): Promise<GifFrame[]> {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to fetch GIF: ${resp.statusText}`);

      const buff = await resp.arrayBuffer();
      if (buff.byteLength < 10) throw new Error('Invalid GIF buffer');

      const gif = parseGIF(buff);
      if (!gif.frames || gif.frames.length === 0) return [];

      const width = gif.lsd.width;
      const height = gif.lsd.height;
      if (width === 0 || height === 0) return [];

      // We'll use decompressFrames but we'll try to be smart.
      // Since decompressFrames is sync and heavy, we'll at least
      // ensure we've yielded before it starts and after it ends.
      await new Promise((resolve) => setTimeout(resolve, 50));

      // If the GIF is massive, warn the user via console at least
      if (gif.frames.length > 100) {
        console.warn('Large GIF detected, processing may cause temporary stutter');
      }

      // We still use decompressFrames as it's the most reliable way with this lib,
      // but we wrap the subsequent canvas drawing in a yielding loop.
      const allFramesData = decompressFrames(gif, true);

      const gifFrames: GifFrame[] = [];
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCanvas.width = width;
      tempCanvas.height = height;

      for (let i = 0; i < allFramesData.length; i++) {
        const frame = allFramesData[i];

        if (frame.disposalType === 2) {
          tempCtx.clearRect(0, 0, width, height);
        }

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = width;
        frameCanvas.height = height;
        const frameCtx = frameCanvas.getContext('2d')!;

        try {
          const patchData = new Uint8ClampedArray(frame.patch);
          const imageData = new ImageData(patchData, frame.dims.width, frame.dims.height);
          tempCtx.putImageData(imageData, frame.dims.left, frame.dims.top);
          frameCtx.drawImage(tempCanvas, 0, 0);

          gifFrames.push({
            canvas: frameCanvas,
            delay: frame.delay || 100,
          });
        } catch (err) {
          console.warn('Frame processing failed:', i, err);
        }

        // Yield to UI every 2 frames to keep it somewhat alive
        if (i % 2 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }

      return gifFrames;
    } catch (e) {
      console.error('GifDecoder Error:', e);
      return [];
    }
  }
}
