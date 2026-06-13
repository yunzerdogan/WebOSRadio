/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MEDIA_PROXY_URL?: string
  readonly VITE_METADATA_PROXY_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
