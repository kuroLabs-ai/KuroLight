import { createStore, get, set } from 'idb-keyval';
import builtinPresetData from '@/constants/editingPresets.json';
import { DEFAULT_EDIT_STATE } from '@/constants/editState';
import type { EditState } from '@/interfaces/edit';
import type { Preset } from '@/interfaces/preset';

const USER_PRESETS_KEY = 'editing-presets';
const presetStore = createStore('kurolight-browser-presets', 'user-presets');
const preservedMetadataKeys = new Set(['vignette', 'background_removal', 'flow_nodes']);

export const BUILTIN_EDIT_PRESETS = builtinPresetData as Preset[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUserPreset(value: unknown): value is Preset {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.category === 'string' &&
    value.is_builtin === false &&
    (value.parameters === undefined || isRecord(value.parameters))
  );
}

async function readUserPresets(): Promise<Preset[]> {
  const stored: unknown = await get(USER_PRESETS_KEY, presetStore);
  if (stored === undefined) return [];
  if (!Array.isArray(stored) || !stored.every(isUserPreset)) {
    throw new TypeError('Stored editing presets have an invalid format');
  }
  return stored;
}

function capturePresetParameters(editState: EditState): NonNullable<Preset['parameters']> {
  const metadata = Object.fromEntries(
    Object.entries(editState.custom_metadata ?? {}).filter(([key]) =>
      preservedMetadataKeys.has(key)
    )
  );

  return structuredClone({
    exposure: editState.exposure,
    white_balance: editState.white_balance,
    detail: editState.detail,
    geometry: editState.geometry,
    lens_correction: editState.lens_correction,
    hsl: editState.hsl ?? DEFAULT_EDIT_STATE.hsl,
    color_grading: editState.color_grading ?? DEFAULT_EDIT_STATE.color_grading,
    tone_curves: editState.tone_curves ?? DEFAULT_EDIT_STATE.tone_curves,
    custom_metadata: metadata,
  });
}

export async function loadEditingPresets(): Promise<Preset[]> {
  const users = await readUserPresets();
  return [...BUILTIN_EDIT_PRESETS, ...users];
}

export async function saveEditingPreset(
  name: string,
  category: string,
  editState: EditState
): Promise<Preset[]> {
  const trimmedName = name.trim();
  const trimmedCategory = category.trim() || 'User';
  if (!trimmedName) throw new TypeError('Preset name cannot be empty');

  const users = await readUserPresets();
  users.push({
    id: crypto.randomUUID(),
    name: trimmedName,
    category: trimmedCategory,
    is_builtin: false,
    parameters: capturePresetParameters(editState),
  });
  await set(USER_PRESETS_KEY, users, presetStore);
  return [...BUILTIN_EDIT_PRESETS, ...users];
}

export async function deleteEditingPreset(presetId: string): Promise<Preset[]> {
  const users = await readUserPresets();
  const nextUsers = users.filter((preset) => preset.id !== presetId);
  if (nextUsers.length === users.length) {
    throw new Error('The selected user preset no longer exists');
  }
  await set(USER_PRESETS_KEY, nextUsers, presetStore);
  return [...BUILTIN_EDIT_PRESETS, ...nextUsers];
}

export function applyEditingPreset(editState: EditState, preset: Preset): EditState {
  const parameters = preset.parameters;
  if (!parameters) return editState;

  const nextState: EditState = { ...editState };
  if (parameters.exposure) {
    nextState.exposure = { ...editState.exposure, ...parameters.exposure };
  }
  if (parameters.white_balance) {
    nextState.white_balance = { ...editState.white_balance, ...parameters.white_balance };
  }
  if (parameters.detail) {
    nextState.detail = { ...editState.detail, ...parameters.detail };
  }
  if (parameters.geometry) {
    nextState.geometry = { ...editState.geometry, ...parameters.geometry };
  }
  if (parameters.lens_correction) {
    nextState.lens_correction = {
      ...editState.lens_correction,
      ...parameters.lens_correction,
    };
  }
  if (parameters.hsl) {
    const hsl = {
      ...DEFAULT_EDIT_STATE.hsl,
      ...editState.hsl,
    };
    for (const [band, values] of Object.entries(parameters.hsl)) {
      if (values) {
        hsl[band] = {
          hue: 0,
          saturation: 0,
          luminance: 0,
          ...editState.hsl?.[band],
          ...values,
        };
      }
    }
    nextState.hsl = hsl;
  }
  if (parameters.color_grading) {
    const grading = {
      ...DEFAULT_EDIT_STATE.color_grading,
      ...editState.color_grading,
      ...parameters.color_grading,
    };
    for (const wheel of ['lift', 'gamma', 'gain', 'offset'] as const) {
      const values = parameters.color_grading[wheel];
      if (values) {
        grading[wheel] = {
          ...DEFAULT_EDIT_STATE.color_grading[wheel],
          ...editState.color_grading?.[wheel],
          ...values,
        };
      }
    }
    nextState.color_grading = grading;
  }
  if (parameters.tone_curves) {
    nextState.tone_curves = {
      ...DEFAULT_EDIT_STATE.tone_curves,
      ...editState.tone_curves,
      ...parameters.tone_curves,
    };
  }
  if (parameters.custom_metadata) {
    const metadata = { ...editState.custom_metadata };
    for (const [key, value] of Object.entries(parameters.custom_metadata)) {
      if (
        key === 'flow_nodes' &&
        isRecord(value) &&
        isRecord(metadata.flow_nodes)
      ) {
        metadata[key] = { ...metadata.flow_nodes, ...value };
      } else {
        metadata[key] = value;
      }
    }
    nextState.custom_metadata = metadata;
  }
  return nextState;
}
