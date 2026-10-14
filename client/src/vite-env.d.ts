/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORLD_MODE?: 'local' | 'remote';
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_DEV_AUTH_TOKEN?: string;
  readonly VITE_ADS_ENABLED?: string;
  readonly VITE_ADSENSE_CLIENT_ID?: string;
  readonly VITE_AD_MANAGER_REWARDED_UNIT?: string;
  readonly VITE_AD_SLOT_TOP_BANNER?: string;
  readonly VITE_AD_SLOT_SIDEBAR?: string;
  readonly VITE_AD_SLOT_MARKETPLACE_FEED?: string;
  readonly VITE_AD_SLOT_FOOTER?: string;
  readonly VITE_AD_SLOT_LOADING?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
