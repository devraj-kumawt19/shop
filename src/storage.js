// Move existing sessions and saved bags to the current brand without losing data.
export function migrateStoreStorage(storage) {
  const previousPrefix = "shopsphere_";
  for (const suffix of ["cart", "wishlist", "user", "token", "delivery_pin"]) {
    const previousKey = previousPrefix + suffix;
    const currentKey = "luxecarts_" + suffix;
    try {
      const previous = storage.getItem(previousKey);
      if (previous === null) continue;
      if (storage.getItem(currentKey) === null) storage.setItem(currentKey, previous);
      storage.removeItem(previousKey);
    } catch { /* Keep the previous data when storage is unavailable or full. */ }
  }
}
