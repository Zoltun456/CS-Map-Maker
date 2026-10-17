import { validatePlaytestSession, type PlaytestSessionV1 } from '../../core/playtest';

const DATABASE = 'cs-map-lab';
const STORE = 'playtests';

const database = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

export async function listPlaytests(): Promise<PlaytestSessionV1[]> {
  if (!('indexedDB' in globalThis)) return [];
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.map(validatePlaytestSession));
    request.onerror = () => reject(request.error);
  });
}

export async function savePlaytest(session: PlaytestSessionV1): Promise<void> {
  const value = validatePlaytestSession(session);
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(value);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
