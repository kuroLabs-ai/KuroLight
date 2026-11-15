export type SettingsTab =
  | 'performance'
  | 'storage'
  | 'import'
  | 'color'
  | 'local_ai'
  | 'appearance'
  | 'ai'
  | 'shortcuts'
  | 'about';

export type AIProvider = 'gemini' | 'openai' | 'anthropic';

export const PROVIDER_MODELS: Record<AIProvider, Array<{ id: string; name: string }>> = {
  gemini: [{ id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' }],
  openai: [{ id: 'gpt-4o', name: 'GPT-4o' }],
  anthropic: [{ id: 'claude-3-7-sonnet-latest', name: 'Claude 3.7 Sonnet' }],
};

export interface AISettings {
  provider: AIProvider;
  model: string;
  has_api_key: boolean;
  saved_keys: Record<AIProvider, boolean>;
  privacy_disclosure_accepted: boolean;
  privacy_disclosure_version: string;
  send_image_context: boolean;
}

export interface SettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTab;
}
