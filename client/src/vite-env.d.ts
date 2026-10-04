/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORLD_MODE?: 'local' | 'remote';
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_AUTH_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
