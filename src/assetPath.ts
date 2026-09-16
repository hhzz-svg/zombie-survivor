/**
 * Where the bundled art and audio live, relative to wherever the app is deployed.
 *
 * This used to be a hardcoded `/assets`, which quietly restricted the game to the root of a
 * domain: served from any sub-path (GitHub Pages under `/<repo>/`, a preview host, an
 * embedded page) every fetch 404s and the game silently degrades to coloured shapes with no
 * sound — the loaders swallow failures on purpose, so nothing tells you. Vite fills
 * `BASE_URL` in from the build's `--base`, so this follows the deployment instead.
 */
export const ASSET_BASE = `${import.meta.env.BASE_URL}assets`;
