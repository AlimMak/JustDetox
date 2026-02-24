/** Generate a collision-resistant unique ID using the Web Crypto API. */
export function generateId(): string {
  return crypto.randomUUID();
}
