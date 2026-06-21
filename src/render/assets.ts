/**
 * Loads sprite images listed in /assets/manifest.json. Everything is optional: if the manifest
 * is missing/empty or an image fails to load, `get()` returns null and the renderer falls back to
 * procedural shapes. This is what makes art a drop-in: add the PNG + a manifest entry, done.
 *
 * manifest.json shape: { "player": "player.png", "walker": "walker.png", ... }
 * Keys match: 'player' for the hero, and each enemy id ('walker','runner','spitter',
 * 'exploder','brute','boss').
 */
export class AssetStore {
  private readonly images = new Map<string, HTMLImageElement>();

  async load(base = '/assets'): Promise<void> {
    try {
      const res = await fetch(`${base}/manifest.json`);
      if (!res.ok) return;
      const manifest = (await res.json()) as Record<string, string>;
      for (const [key, file] of Object.entries(manifest)) {
        const img = new Image();
        img.onload = () => this.images.set(key, img);
        img.src = `${base}/${file}`;
      }
    } catch {
      // No assets yet → pure procedural fallback. Not an error.
    }
  }

  get(key: string): HTMLImageElement | null {
    return this.images.get(key) ?? null;
  }
}
