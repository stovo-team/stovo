class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(String(key), String(value));
  }
}

// Node 25 exposes an opt-in localStorage implementation. Its unavailable
// placeholder is selected ahead of JSDOM in workers and makes persistence
// tests silently fall back to an empty store. Install a deterministic browser
// storage implementation before application modules are loaded.
const storage = new MemoryStorage();
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
}
