import { ImageAsset } from './asset';
import { Collection } from './collection';
import { EditState } from './edit';
import { WorkspaceId } from '../types/workspace';

export type PythonApi = Record<string, (...args: unknown[]) => Promise<unknown>>;

export interface ExportRequest extends Record<string, unknown> {
  asset_ids: string[];
  edit_states: Record<string, EditState>;
  custom_luts: Record<string, { size: number; data_base64: string }>;
}

declare global {
  interface Window {
    pywebview?: { api: PythonApi };
  }
}

export interface BridgeEvents {
  image_updated: [string];
  before_image_updated: [string];
  assets_updated: [ImageAsset[]];
  asset_count_updated: [number];
  trash_count_updated: [number];
  library_loading: [{ loading: boolean; message: string; cancellable: boolean }];
  collections_updated: [Collection[]];
  history_updated: [string[], number];
  asset_selected: [ImageAsset | null, EditState | null];
  filmstrip_toggled: [boolean];
  workspace_changed: [WorkspaceId];
  notification: [{ title: string; message: string; level: string }];
  processing_progress: [number | null, string, boolean];
  ready: [boolean];
}
