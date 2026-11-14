import { ImageAsset } from './asset';
import { Collection } from './collection';
import { EditState } from './edit';
import { ColorScopes, HistogramData } from './scopes';
import { WorkspaceId } from '../types/workspace';

export type PythonApi = Record<string, (...args: unknown[]) => Promise<unknown>>;

declare global {
  interface Window {
    pywebview?: { api: PythonApi };
  }
}

export interface BridgeEvents {
  image_updated: [string];
  before_image_updated: [string];
  histogram_updated: [HistogramData];
  assets_updated: [ImageAsset[]];
  asset_count_updated: [number];
  trash_count_updated: [number];
  library_loading: [{ loading: boolean; message: string; cancellable: boolean }];
  collections_updated: [Collection[]];
  history_updated: [string[], number];
  asset_selected: [ImageAsset | null, EditState | null];
  filmstrip_toggled: [boolean];
  workspace_changed: [WorkspaceId];
  color_scopes_updated: [ColorScopes | null];
  notification: [{ title: string; message: string; level: string }];
  processing_progress: [number | null, string, boolean];
  ready: [boolean];
}
