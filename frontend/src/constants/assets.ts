/**
 * Backend origin for static uploads. Empty in dev/prod where the app is served
 * from the same origin (Vite proxies `/uploads`); override with VITE_ASSET_BASE
 * when the API lives elsewhere.
 */
const ASSET_BASE = (import.meta.env.VITE_ASSET_BASE as string | undefined)?.replace(/\/$/, '') || '';

/** Resolves a backend-relative upload path to a URL usable in the browser. */
export function assetUrl(path?: string | null): string {
  if (!path) return '';
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:')) return path;
  return `${ASSET_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Absolute variant — required inside email HTML, which is rendered off-site. */
export function absoluteAssetUrl(path?: string | null): string {
  const url = assetUrl(path);
  if (!url || /^(https?:)?\/\//i.test(url) || url.startsWith('data:')) return url;
  return `${window.location.origin}${url}`;
}
