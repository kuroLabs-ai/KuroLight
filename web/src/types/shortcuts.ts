export type ShortcutId =
  | 'workspace_library'
  | 'workspace_develop'
  | 'workspace_color_studio'
  | 'workspace_visual_flow'
  | 'workspace_deliver'
  | 'import_images'
  | 'save_edits'
  | 'open_settings'
  | 'toggle_kuro_ai'
  | 'close_active_panel'
  | 'undo'
  | 'redo'
  | 'toggle_filmstrip'
  | 'toggle_right_panel'
  | 'toggle_crop'
  | 'gallery_rate_1'
  | 'gallery_rate_2'
  | 'gallery_rate_3'
  | 'gallery_rate_4'
  | 'gallery_rate_5'
  | 'gallery_flag_pick'
  | 'gallery_flag_unflag'
  | 'gallery_flag_reject'
  | 'gallery_open_develop'
  | 'gallery_select_all'
  | 'gallery_delete';

export type ShortcutBindings = Record<ShortcutId, string>;

export interface ShortcutDefinition {
  id: ShortcutId;
  label: string;
  defaultValue: string;
  group: 'Workspace' | 'Application' | 'Editing' | 'Gallery';
}
