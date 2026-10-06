export function idempotent<T>(store: Map<string, T>, clientOrderId: string, create: () => T): T {
  const existing = store.get(clientOrderId);
  if (existing !== undefined) return existing;
  const created = create();
  store.set(clientOrderId, created);
  return created;
}
