import { open, unlink } from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const LOCK_FILE = path.join(ROOT, 'covers', '.manifest.lock');

export async function withManifestLock(task) {
  let handle;
  try {
    handle = await open(LOCK_FILE, 'wx');
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error('Une autre étape de couverture écrit déjà le manifeste ; réessayez une fois terminée.');
    throw error;
  }
  try {
    return await task();
  } finally {
    await handle.close().catch(() => {});
    await unlink(LOCK_FILE).catch(() => {});
  }
}
