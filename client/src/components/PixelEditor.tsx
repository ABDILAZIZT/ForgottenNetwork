import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Layers,
  Plus,
  Eye,
  EyeOff,
  Play,
  Pause,
  FlipHorizontal,
  Brush as BrushIcon,
  Eraser,
  PaintBucket,
  X,
} from 'lucide-react';

interface Layer {
  id: string;
  name: string;
  visible: boolean;
  canvas: HTMLCanvasElement;
}

interface Frame {
  id: string;
  layers: Layer[];
  duration: number;
}

interface Props {
  resolution: number;
  onSave: (dataUrl: string, frames?: string[]) => void;
  onCancel: () => void;
}

export default function PixelEditor({ resolution = 32, onSave, onCancel }: Props) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [currentLayerIndex, setCurrentLayerIndex] = useState(0);
  const [tool, setTool] = useState<'brush' | 'eraser' | 'fill'>('brush');
  const [color, setColor] = useState('#ffffff');
  const [isPlaying, setIsPlaying] = useState(false);
  const [mirrorX, setMirrorX] = useState(false);
  const [onionSkin, setOnionSkin] = useState(true);

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  // Helper to create a new layer
  const createLayer = (name: string): Layer => {
    const canvas = document.createElement('canvas');
    canvas.width = resolution;
    canvas.height = resolution;
    return {
      id: `layer_${Date.now()}_${Math.random()}`,
      name,
      visible: true,
      canvas,
    };
  };

  // Initialize first frame and layer
  useEffect(() => {
    const initialLayer = createLayer('Layer 1');
    const initialFrame: Frame = {
      id: 'frame_0',
      layers: [initialLayer],
      duration: 100,
    };
    setFrames([initialFrame]);
  }, [resolution]);

  const currentFrame = frames[currentFrameIndex];
  const currentLayer = currentFrame?.layers[currentLayerIndex];

  // Rendering
  const renderMainCanvas = useCallback(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !currentFrame) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, resolution, resolution);
    ctx.imageSmoothingEnabled = false;

    // Onion skin (previous frame)
    if (onionSkin && currentFrameIndex > 0 && !isPlaying) {
      const prevFrame = frames[currentFrameIndex - 1];
      ctx.globalAlpha = 0.2;
      prevFrame.layers.forEach((layer) => {
        if (layer.visible) ctx.drawImage(layer.canvas, 0, 0);
      });
      ctx.globalAlpha = 1.0;
    }

    // Current layers
    currentFrame.layers.forEach((layer) => {
      if (layer.visible) {
        ctx.drawImage(layer.canvas, 0, 0);
      }
    });
  }, [currentFrame, frames, currentFrameIndex, onionSkin, resolution, isPlaying]);

  useEffect(() => {
    renderMainCanvas();
  }, [renderMainCanvas, currentFrame]);

  // Animation playback
  useEffect(() => {
    let interval: any;
    if (isPlaying) {
      interval = setInterval(() => {
        setCurrentFrameIndex((prev) => (prev + 1) % frames.length);
      }, currentFrame?.duration || 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, frames.length, currentFrame?.duration]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (isPlaying) return;
    setIsDrawing(true);
    draw(e);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDrawing) draw(e);
  };

  const handlePointerUp = () => {
    setIsDrawing(false);
  };

  const draw = (e: React.PointerEvent) => {
    const mainCanvas = mainCanvasRef.current;
    if (!mainCanvas || !currentLayer) return;
    const rect = mainCanvas.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * resolution);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * resolution);

    if (x < 0 || x >= resolution || y < 0 || y >= resolution) return;

    const layerCtx = currentLayer.canvas.getContext('2d')!;
    layerCtx.imageSmoothingEnabled = false;

    const points = [[x, y]];
    if (mirrorX) {
      points.push([resolution - 1 - x, y]);
    }

    points.forEach(([px, py]) => {
      if (tool === 'brush') {
        layerCtx.fillStyle = color;
        layerCtx.fillRect(px, py, 1, 1);
      } else if (tool === 'eraser') {
        layerCtx.clearRect(px, py, 1, 1);
      } else if (tool === 'fill') {
        floodFill(currentLayer.canvas, px, py, color);
      }
    });

    renderMainCanvas();
  };

  const floodFill = (canvas: HTMLCanvasElement, x: number, y: number, fillColor: string) => {
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, resolution, resolution);
    const targetColor = getPixel(imageData, x, y);
    const replacementColor = hexToRgb(fillColor);

    if (colorsMatch(targetColor, replacementColor)) return;

    const pixelsToCheck = [[x, y]];
    while (pixelsToCheck.length > 0) {
      const [px, py] = pixelsToCheck.pop()!;
      const currentColor = getPixel(imageData, px, py);

      if (colorsMatch(currentColor, targetColor)) {
        setPixel(imageData, px, py, replacementColor);
        if (px > 0) pixelsToCheck.push([px - 1, py]);
        if (px < resolution - 1) pixelsToCheck.push([px + 1, py]);
        if (py > 0) pixelsToCheck.push([px, py - 1]);
        if (py < resolution - 1) pixelsToCheck.push([px, py + 1]);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const getPixel = (imageData: ImageData, x: number, y: number) => {
    const index = (y * imageData.width + x) * 4;
    return imageData.data.slice(index, index + 4);
  };

  const setPixel = (imageData: ImageData, x: number, y: number, color: number[]) => {
    const index = (y * imageData.width + x) * 4;
    imageData.data[index] = color[0];
    imageData.data[index + 1] = color[1];
    imageData.data[index + 2] = color[2];
    imageData.data[index + 3] = 255;
  };

  const colorsMatch = (a: any, b: any) => {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
  };

  const hexToRgb = (hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b, 255];
  };

  const addFrame = () => {
    const newFrame: Frame = {
      id: `frame_${Date.now()}`,
      layers: currentFrame.layers.map((l) => {
        const newCanvas = document.createElement('canvas');
        newCanvas.width = resolution;
        newCanvas.height = resolution;
        newCanvas.getContext('2d')?.drawImage(l.canvas, 0, 0);
        return { ...l, id: `layer_${Date.now()}_${Math.random()}`, canvas: newCanvas };
      }),
      duration: 100,
    };
    setFrames([...frames, newFrame]);
    setCurrentFrameIndex(frames.length);
  };

  const addLayer = () => {
    const layerName = `Layer ${currentFrame.layers.length + 1}`;
    const newFrames = frames.map((f) => {
      const newLayer = createLayer(layerName);
      return { ...f, layers: [...f.layers, newLayer] };
    });
    setFrames(newFrames);
    setCurrentLayerIndex(currentFrame.layers.length);
  };

  const deleteFrame = (index: number) => {
    if (frames.length <= 1) return;
    const newFrames = frames.filter((_, i) => i !== index);
    setFrames(newFrames);
    setCurrentFrameIndex(Math.max(0, index - 1));
  };

  const toggleVisibility = (layerIndex: number) => {
    const newFrames = [...frames];
    newFrames[currentFrameIndex].layers[layerIndex].visible =
      !newFrames[currentFrameIndex].layers[layerIndex].visible;
    setFrames(newFrames);
    renderMainCanvas();
  };

  const save = () => {
    const frameUrls: string[] = [];

    // Process all frames
    frames.forEach((frame) => {
      const canvas = document.createElement('canvas');
      canvas.width = resolution;
      canvas.height = resolution;
      const ctx = canvas.getContext('2d')!;

      frame.layers.forEach((layer) => {
        if (layer.visible) ctx.drawImage(layer.canvas, 0, 0);
      });

      frameUrls.push(canvas.toDataURL());
    });

    onSave(frameUrls[0], frameUrls.length > 1 ? frameUrls : undefined);
  };

  return (
    <div className="fn-pixel-editor">
      <div className="editor-layout">
        <div className="editor-toolbar">
          <button
            className={`tool-btn ${tool === 'brush' ? 'active' : ''}`}
            onClick={() => setTool('brush')}
            title="Brush"
          >
            <BrushIcon size={18} />
          </button>
          <button
            className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Eraser"
          >
            <Eraser size={18} />
          </button>
          <button
            className={`tool-btn ${tool === 'fill' ? 'active' : ''}`}
            onClick={() => setTool('fill')}
            title="Fill"
          >
            <PaintBucket size={18} />
          </button>
          <div className="separator" />
          <button
            className={`tool-btn ${mirrorX ? 'active' : ''}`}
            onClick={() => setMirrorX(!mirrorX)}
            title="Mirror X"
          >
            <FlipHorizontal size={18} />
          </button>
          <div className="separator" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="color-picker"
          />
        </div>

        <div className="editor-canvas-container">
          <div className="canvas-wrapper">
            <canvas
              ref={mainCanvasRef}
              width={resolution}
              height={resolution}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              style={{
                imageRendering: 'pixelated',
                background:
                  'repeating-conic-gradient(#1a1a1a 0% 25%, #121212 0% 50%) 50% / 32px 32px',
              }}
            />
          </div>
        </div>

        <div className="editor-sidebar">
          <div className="sidebar-section">
            <div className="section-header">
              <Layers size={14} /> <span>LAYERS</span>
              <button className="small-btn" onClick={addLayer}>
                <Plus size={12} />
              </button>
            </div>
            <div className="layers-list">
              {currentFrame?.layers
                .map((layer, index) => (
                  <div
                    key={layer.id}
                    className={`layer-item ${index === currentLayerIndex ? 'active' : ''}`}
                    onClick={() => setCurrentLayerIndex(index)}
                  >
                    <button
                      className="vis-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVisibility(index);
                      }}
                    >
                      {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                    </button>
                    <span className="layer-name">{layer.name}</span>
                  </div>
                ))
                .reverse()}
            </div>
          </div>

          <div className="sidebar-section">
            <div className="section-header">ANIMATION</div>
            <div className="settings-grid">
              <label>Onion Skin</label>
              <button
                className={`toggle ${onionSkin ? 'active' : ''}`}
                onClick={() => setOnionSkin(!onionSkin)}
              >
                {onionSkin ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="editor-timeline">
        <div className="timeline-controls">
          <button className="fn-btn-icon" onClick={() => setIsPlaying(!isPlaying)}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button className="fn-btn-sm" onClick={addFrame}>
            <Plus size={14} /> FRAME
          </button>
        </div>
        <div className="frames-list">
          {frames.map((frame, index) => (
            <div
              key={frame.id}
              className={`frame-thumb ${index === currentFrameIndex ? 'active' : ''}`}
              onClick={() => setCurrentFrameIndex(index)}
            >
              <span className="thumb-label">{index + 1}</span>
              {frames.length > 1 && (
                <button
                  className="delete-frame"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteFrame(index);
                  }}
                >
                  <X size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="editor-footer">
        <button className="fn-btn" onClick={onCancel}>
          Cancel
        </button>
        <button className="fn-btn fn-btn-primary" onClick={save}>
          Manifest & Continue
        </button>
      </div>
    </div>
  );
}
