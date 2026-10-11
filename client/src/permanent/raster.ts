export function floodFill(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  color: number[],
  tolerance: number,
  mask?: Uint8ClampedArray,
) {
  x = Math.floor(x);
  y = Math.floor(y);
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const seed = (y * width + x) * 4,
    target = Array.from(data.slice(seed, seed + 4));
  const seen = new Uint8Array(width * height),
    stack = [y * width + x];
  tolerance = Math.max(0, Math.min(255, tolerance));
  let count = 0;
  while (stack.length) {
    const index = stack.pop()!;
    if (seen[index]) continue;
    seen[index] = 1;
    const offset = index * 4;
    if (mask && !mask[offset + 3]) continue;
    if (target.some((c, channel) => Math.abs(c - data[offset + channel]) > tolerance)) continue;
    data.set(color, offset);
    count++;
    if (index % width) stack.push(index - 1);
    if (index % width < width - 1) stack.push(index + 1);
    if (index >= width) stack.push(index - width);
    if (index < width * (height - 1)) stack.push(index + width);
  }
  return count;
}
export function fitImage(width: number, height: number, size: number) {
  const scale = Math.min(size / width, size / height);
  return {
    x: (size - width * scale) / 2,
    y: (size - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
}
export function transformPoint(
  point: [number, number],
  center: [number, number],
  transform: { x: number; y: number; sx: number; sy: number; angle: number },
): [number, number] {
  const a = (transform.angle * Math.PI) / 180;
  const x = (point[0] - center[0]) * transform.sx,
    y = (point[1] - center[1]) * transform.sy;
  return [
    center[0] + transform.x + x * Math.cos(a) - y * Math.sin(a),
    center[1] + transform.y + x * Math.sin(a) + y * Math.cos(a),
  ];
}
