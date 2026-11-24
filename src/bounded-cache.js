export class BoundedCache extends Map {
  constructor(maxEntries = 24, maxBytes = 8 * 1024 * 1024) {
    super();
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
    this.bytes = 0;
  }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    this.delete(key);
    super.set(key, value);
    this.bytes += String(value).length * 2;
    // Keep a single oversized item usable instead of refetching it forever.
    while (this.size > 1 && (this.size > this.maxEntries || this.bytes > this.maxBytes)) this.delete(this.keys().next().value);
    return this;
  }
  delete(key) {
    if (!super.has(key)) return false;
    this.bytes -= String(super.get(key)).length * 2;
    return super.delete(key);
  }
  clear() { super.clear(); this.bytes = 0; }
}
