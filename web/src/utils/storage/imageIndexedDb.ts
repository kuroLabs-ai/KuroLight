import { get, set, del, clear } from 'idb-keyval';
import type { EditState } from '@/interfaces/edit';

const THUMB_PREFIX = 'kuro_thumb:';
const EDIT_PREFIX = 'kuro_edit:';

export async function cacheThumbnail(assetId: string, dataUrl: string): Promise<void> {
  try {
    await set(`${THUMB_PREFIX}${assetId}`, dataUrl);
  } catch (err) {
    console.warn('IndexedDB thumbnail cache error:', err);
  }
}

export async function getCachedThumbnail(assetId: string): Promise<string | undefined> {
  try {
    return await get<string>(`${THUMB_PREFIX}${assetId}`);
  } catch {
    return undefined;
  }
}

export async function cacheLocalEditState(assetId: string, editState: EditState): Promise<void> {
  await set(`${EDIT_PREFIX}${assetId}`, editState);
}

export async function getCachedLocalEditState(assetId: string): Promise<EditState | undefined> {
  return get<EditState>(`${EDIT_PREFIX}${assetId}`);
}

export async function clearAssetCache(assetId: string): Promise<void> {
  await Promise.allSettled([
    del(`${THUMB_PREFIX}${assetId}`),
    del(`${EDIT_PREFIX}${assetId}`),
  ]);
}

export async function clearAllLocalCaches(): Promise<void> {
  await clear();
}
