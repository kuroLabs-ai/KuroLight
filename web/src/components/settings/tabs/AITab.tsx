import React from 'react';
import { ShieldCheck, KeyRound } from 'lucide-react';
import { AISettings, AIProvider, PROVIDER_MODELS } from '../types';
import { SectionHeader } from '../SectionHeader';
import { inputClass, labelClass } from '../styles';

export interface AITabProps {
  aiSettings: AISettings;
  setAiSettings: React.Dispatch<React.SetStateAction<AISettings>>;
  setAiDirty: (dirty: boolean) => void;
  models: Array<{ id: string; name: string }>;
  setModels: React.Dispatch<React.SetStateAction<Array<{ id: string; name: string }>>>;
  modelSearch: string;
  setModelSearch: (search: string) => void;
  apiKey: string;
  setApiKey: (key: string) => void;
  removeKey: boolean;
  setRemoveKey: (remove: boolean) => void;
  refreshingModels: boolean;
  refreshModels: () => Promise<void>;
  testConnection: () => Promise<void>;
}

export const AITab: React.FC<AITabProps> = ({
  aiSettings,
  setAiSettings,
  setAiDirty,
  models,
  setModels,
  modelSearch,
  setModelSearch,
  apiKey,
  setApiKey,
  removeKey,
  setRemoveKey,
  refreshingModels,
  refreshModels,
  testConnection,
}) => {
  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="rounded-lg border border-obsidian-accent/30 bg-obsidian-accent/5 p-3 text-[10.5px] text-obsidian-textMut space-y-2">
        <div className="flex items-center gap-2 font-bold text-white">
          <ShieldCheck size={13} className="text-emerald-400" />
          <span>Kuro AI Privacy & Credential Contract</span>
        </div>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong className="text-obsidian-textSec">Keychain Isolation:</strong> API credentials are stored in your OS-native secure credential vault.
          </li>
          <li>
            <strong className="text-obsidian-textSec">Review Before Apply:</strong> Suggestions are previewed non-destructively and never applied without confirmation.
          </li>
          <li>
            <strong className="text-obsidian-textSec">Stale Edit Protection:</strong> Proposals are checked against your photo's edit-state fingerprint.
          </li>
        </ul>
      </div>

      <div className="rounded-lg border border-obsidian-border bg-obsidian-deep p-3 space-y-3">
        <SectionHeader>Privacy & Consent</SectionHeader>
        <label className="flex items-start gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
          <input
            type="checkbox"
            checked={aiSettings.privacy_disclosure_accepted}
            onChange={(event) => {
              setAiSettings((current) => ({
                ...current,
                privacy_disclosure_accepted: event.target.checked,
              }));
              setAiDirty(true);
            }}
            className="mt-0.5 accent-obsidian-accent"
          />
          <span className="leading-snug">
            I accept the Kuro AI privacy disclosure (v{aiSettings.privacy_disclosure_version}) and consent to transmitting the active image preview and camera metadata to my configured provider.
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-xs text-obsidian-textSec cursor-pointer">
          <input
            type="checkbox"
            checked={aiSettings.send_image_context}
            onChange={(event) => {
              setAiSettings((current) => ({
                ...current,
                send_image_context: event.target.checked,
              }));
              setAiDirty(true);
            }}
            className="mt-0.5 accent-obsidian-accent"
          />
          <span className="leading-snug">
            Send active photo preview with AI requests (enables scene-aware analysis).
          </span>
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>LLM Provider</span>
        <select
          value={aiSettings.provider}
          onChange={(event) => {
            const provider = event.target.value as AIProvider;
            setAiSettings((current) => ({
              ...current,
              provider,
              model: '',
              has_api_key: current.saved_keys[provider],
            }));
            setModels(aiSettings.saved_keys[provider] ? [] : PROVIDER_MODELS[provider]);
            setModelSearch('');
            setApiKey('');
            setRemoveKey(false);
            setAiDirty(true);
          }}
          className={inputClass}
        >
          <option value="gemini">Google Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic Claude</option>
        </select>
      </label>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <input
          type="search"
          value={modelSearch}
          onChange={(event) => setModelSearch(event.target.value)}
          placeholder="Search available models"
          aria-label="Search models"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void refreshModels()}
          disabled={refreshingModels}
          className="rounded-lg border border-obsidian-border px-3 py-2 text-xs font-semibold text-white hover:bg-obsidian-hover disabled:opacity-50 cursor-pointer"
        >
          {refreshingModels ? 'Loading…' : 'Refresh'}
        </button>
        <button
          type="button"
          onClick={() => void testConnection()}
          disabled={refreshingModels}
          className="rounded-lg border border-obsidian-accent/50 px-3 py-2 text-xs font-semibold text-obsidian-accent hover:bg-obsidian-accent/10 disabled:opacity-50 cursor-pointer"
        >
          Test connection
        </button>
      </div>

      <label className="block">
        <span className={labelClass}>Available Model</span>
        <select
          value={aiSettings.model}
          onChange={(event) => {
            setAiSettings((current) => ({ ...current, model: event.target.value }));
            setAiDirty(true);
          }}
          className={inputClass}
        >
          <option value="">Select a model</option>
          {models
            .filter((model) =>
              `${model.name} ${model.id}`.toLowerCase().includes(modelSearch.toLowerCase())
            )
            .map((model) => (
              <option key={model.id} value={model.id}>
                {model.name} · {model.id}
              </option>
            ))}
        </select>
      </label>

      <label className="block">
        <span className={labelClass}>
          API Key{' '}
          {aiSettings.has_api_key && (
            <span className="inline-flex items-center gap-1 normal-case tracking-normal text-emerald-300 font-normal">
              <KeyRound size={10} /> saved securely in OS Keychain
            </span>
          )}
        </span>
        <input
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value);
            setRemoveKey(false);
          }}
          placeholder={
            aiSettings.has_api_key
              ? 'Enter a new key to replace the saved key'
              : 'Paste your provider API key'
          }
          className={inputClass}
        />
      </label>

      {aiSettings.has_api_key && (
        <label className="flex items-center gap-2 text-xs text-obsidian-textMut cursor-pointer">
          <input
            type="checkbox"
            checked={removeKey}
            onChange={(event) => {
              setRemoveKey(event.target.checked);
              setApiKey('');
            }}
            className="accent-obsidian-accent"
          />
          Remove the saved key for this provider from OS Keychain
        </label>
      )}
    </div>
  );
};
