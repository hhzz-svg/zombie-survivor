/**
 * Minimal archetype-free ECS.
 *
 * Storage is AoS: one `Map<Entity, data>` per component (simple, good enough until
 * profiling says otherwise — do NOT prematurely switch hot components to SoA/TypedArray).
 * Rendering is deliberately NOT a part of `step()`, so the headless sim can advance the
 * exact same logic without a canvas.
 */

export type Entity = number;

/** A typed handle for a component store. The phantom `_t` carries the data type only at compile time. */
export interface ComponentType<T> {
  readonly name: string;
  readonly _t?: T;
}

export function defineComponent<T>(name: string): ComponentType<T> {
  return { name };
}

export type System = (world: World, dt: number) => void;

export class World {
  private nextId: Entity = 1;
  private freeIds: Entity[] = [];
  private stores = new Map<string, Map<Entity, unknown>>();
  readonly systems: System[] = [];

  /** Seeded, deterministic RNG in [0,1). Injected so the sim is reproducible — never use Math.random() in systems. */
  readonly rng: () => number;

  constructor(rng: () => number) {
    this.rng = rng;
  }

  create(): Entity {
    return this.freeIds.pop() ?? this.nextId++;
  }

  destroy(e: Entity): void {
    for (const store of this.stores.values()) store.delete(e);
    this.freeIds.push(e);
  }

  private store(name: string): Map<Entity, unknown> {
    let s = this.stores.get(name);
    if (!s) {
      s = new Map();
      this.stores.set(name, s);
    }
    return s;
  }

  add<T>(e: Entity, ct: ComponentType<T>, data: T): Entity {
    this.store(ct.name).set(e, data);
    return e;
  }

  remove<T>(e: Entity, ct: ComponentType<T>): void {
    this.stores.get(ct.name)?.delete(e);
  }

  get<T>(e: Entity, ct: ComponentType<T>): T | undefined {
    return this.stores.get(ct.name)?.get(e) as T | undefined;
  }

  has<T>(e: Entity, ct: ComponentType<T>): boolean {
    return this.stores.get(ct.name)?.has(e) ?? false;
  }

  /** Entities that have ALL the given components. Iterates the smallest store for speed. */
  query(...cts: ComponentType<unknown>[]): Entity[] {
    if (cts.length === 0) return [];
    let smallest = this.store(cts[0]!.name);
    for (let i = 1; i < cts.length; i++) {
      const s = this.store(cts[i]!.name);
      if (s.size < smallest.size) smallest = s;
    }
    const out: Entity[] = [];
    outer: for (const e of smallest.keys()) {
      for (const ct of cts) {
        if (!this.stores.get(ct.name)!.has(e)) continue outer;
      }
      out.push(e);
    }
    return out;
  }

  /** Advance one fixed logic step. Render is intentionally excluded (sim runs this without a canvas). */
  step(dt: number): void {
    for (const sys of this.systems) sys(this, dt);
  }
}
