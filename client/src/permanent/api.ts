export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  token: string | null = null,
  body?: unknown,
): Promise<T> {
  const response = await fetch('/api/canvas' + path, {
    signal: AbortSignal.timeout(20000),
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw new ApiError(
      value.error?.message || 'Could not connect to the world.',
      response.status,
      value.error || {},
    );
  return value as T;
}
export function readSaved<T>(key: string, fallback: T): T {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null') ?? fallback;
    return Array.isArray(fallback) && !Array.isArray(value) ? fallback : value;
  } catch {
    return fallback;
  }
}
export function fileData(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read this image.'));
    reader.readAsDataURL(file);
  });
}
