import { afterEach, expect, it, vi } from 'vitest';
import { HttpWorldGateway } from './HttpWorldGateway';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('exports public entities and their media without requesting the private asset list', async () => {
  const urls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      if (url.endsWith('/chunks?all=true')) return new Response(JSON.stringify({ chunks: [] }));
      if (url.endsWith('/entities'))
        return new Response(
          JSON.stringify({
            entities: [
              {
                id: 'public',
                spriteUrl: 'asset:picture',
                frames: ['asset:picture'],
                layers: [{ url: 'asset:picture' }],
              },
            ],
          }),
        );
      if (url.endsWith('/assets/picture'))
        return new Response(
          JSON.stringify({
            id: 'picture',
            type: 'image/png',
            data: 'data:image/png;base64,AQ==',
            savedAt: 1,
          }),
        );
      return new Response('{}', { status: 401 });
    }),
  );
  const result = JSON.parse(await new HttpWorldGateway().exportWorld());
  expect(result.assets).toHaveLength(1);
  expect(result.assets[0].id).toBe('picture');
  expect(urls.some((url) => url.endsWith('/assets'))).toBe(false);
  expect(urls.filter((url) => url.endsWith('/assets/picture'))).toHaveLength(1);
});
