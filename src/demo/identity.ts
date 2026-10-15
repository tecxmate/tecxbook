// A random id per phone, kept across reloads, so the class server counts each
// phone once and a reload brings a player back to where they were.

const STORAGE_KEY = 'dental-ai.demo-phone.v1';

export function phoneId(): string {
  try {
    const known = localStorage.getItem(STORAGE_KEY);
    if (known) return known;
    // Not crypto.randomUUID: it is missing on plain http (a laptop on Wi-Fi).
    const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
}
