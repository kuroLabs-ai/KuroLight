import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowUp,
  Bot,
  Check,
  ImagePlus,
  LoaderCircle,
  Palette,
  Send,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { bridge } from '../../bridge';
import { encodeLUTCube, isBuiltinLUT, loadLUT } from '../../utils/webgl/lut';
import type { EditState, ImageAsset } from '../../types';

interface KuroAIPopupProps {
  isOpen: boolean;
  onClose: () => void;
  activeAssetId?: string;
  activeFileName?: string;
  editState: EditState;
  onSelectAsset?: (id: string) => void;
  availableAssets?: ImageAsset[];
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  assetId?: string;
  timestamp?: string;
}

interface PendingProposal {
  assetId: string;
  baseState: EditState;
  candidate: EditState;
  currentPreview: string;
  proposedPreview: string;
  edits: Record<string, unknown>;
  baseStateFingerprint: string;
}

async function getCustomLuts(state: EditState) {
  const name = state.color_grading.lut_name;
  if (!name || isBuiltinLUT(name)) return {};

  const cube = await loadLUT(name);
  if (!cube) {
    throw new Error(`The selected custom LUT "${name}" is not available in browser storage.`);
  }
  return {
    [name]: { size: cube.size, data_base64: encodeLUTCube(cube) },
  };
}

const CATEGORIZED_SUGGESTIONS = [
  {
    icon: Wand2,
    label: 'Auto-Tone & Analysis',
    prompt: 'Analyze this photo and suggest professional exposure and color adjustments.',
  },
  {
    icon: Sun,
    label: 'Warm Golden Hour',
    prompt: 'Give this photo a warm, golden hour cinematic mood with soft highlights.',
  },
  {
    icon: Palette,
    label: 'Clean Moody Look',
    prompt: 'Create a rich, moody aesthetic with deep blacks and subtle color grading.',
  },
  {
    icon: Sparkles,
    label: 'Detail & Dynamic Range',
    prompt: 'Enhance fine details, recover clipped highlights, and open the shadows naturally.',
  },
];

export const KuroAIPopup: React.FC<KuroAIPopupProps> = ({
  isOpen,
  onClose,
  activeAssetId,
  activeFileName,
  editState,
  onSelectAsset,
  availableAssets = [],
}) => {
  const [width, setWidth] = useState(380);
  const [isResizing, setIsResizing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [proposal, setProposal] = useState<PendingProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [preparingContext, setPreparingContext] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const editStateRef = useRef(editState);

  useEffect(() => {
    editStateRef.current = editState;
  }, [editState]);

  useEffect(() => {
    if (!isOpen || !activeAssetId) return;

    let cancelled = false;
    const currentState = structuredClone(editStateRef.current);
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setPreparingContext(true);
      setContextReady(false);
      setError('');
      try {
        const customLuts = await getCustomLuts(currentState);
        await bridge.prepareAIContext(activeAssetId, currentState, customLuts);
        if (!cancelled) setContextReady(true);
      } catch (cause: unknown) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        if (!cancelled) setPreparingContext(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, activeAssetId]);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const startResizing = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Handle smooth drag resizing
  useEffect(() => {
    if (!isResizing) return;

    const onMouseMove = (e: MouseEvent) => {
      // Sidebar is anchored to the left of the screen, so width = clientX
      const nextWidth = Math.max(300, Math.min(640, e.clientX));
      setWidth(nextWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing]);

  // Auto-scroll chat to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, busy, proposal, error]);

  // Informative context notice when active photo changes
  const prevAssetRef = useRef<string | undefined>(activeAssetId);
  useEffect(() => {
    if (prevAssetRef.current !== activeAssetId) {
      if (prevAssetRef.current && activeAssetId && activeFileName) {
        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: `Switched context to "${activeFileName}". Ready for your instructions on this photo.`,
          },
        ]);
      }
      prevAssetRef.current = activeAssetId;
    }
  }, [activeAssetId, activeFileName]);

  if (!isOpen) return null;

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }
  };

  const submit = async (value: string) => {
    const text = value.trim();
    if (!text || busy) return;

    if (!activeAssetId) {
      setError('Please select a photo in your library first so Kuro AI can analyze and edit it.');
      return;
    }

    setBusy(true);
    setError('');
    setProposal(null);
    setPrompt('');

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    setMessages((current) => [...current, { role: 'user', content: text, assetId: activeAssetId }]);

    try {
      const baseState = structuredClone(editState);
      const customLuts = await getCustomLuts(baseState);
      const history = messages.map(({ role, content }) => ({ role, content }));
      const result = await bridge.proposeAIEdits(
        text,
        history,
        activeAssetId,
        baseState,
        customLuts,
      );
      setMessages((current) => [...current, { role: 'assistant', content: result.message }]);

      if (result.candidate_state && result.proposed_preview) {
        setProposal({
          assetId: activeAssetId,
          baseState,
          candidate: result.candidate_state,
          currentPreview: result.current_preview,
          proposedPreview: result.proposed_preview,
          edits: result.edits,
          baseStateFingerprint: result.base_state_fingerprint,
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter without Shift sends prompt
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit(prompt);
    }
  };

  const approve = async () => {
    if (!proposal || !activeAssetId) return;
    if (proposal.assetId !== activeAssetId) {
      setError('The active photo changed. Ask Kuro for a new proposal for this image.');
      return;
    }
    if (JSON.stringify(editState) !== JSON.stringify(proposal.baseState)) {
      setError('Photo settings changed after this preview. Ask Kuro for a fresh proposal.');
      return;
    }
    setApplying(true);
    setError('');
    try {
      await bridge.applyAIProposal(
        proposal.candidate,
        activeAssetId,
        proposal.baseStateFingerprint,
        proposal.baseState,
      );
      setProposal(null);
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: 'Applied. The AI adjustments have been saved to your photo. You can refine them in Develop or Undo anytime.',
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setApplying(false);
    }
  };

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative z-20 flex h-full shrink-0 flex-col overflow-hidden border-r border-obsidian-border bg-obsidian-card shadow-2xl select-none text-xs transition-[width] duration-75"
    >
      {/* ── Header ── */}
      <header className="flex items-center justify-between border-b border-obsidian-border bg-obsidian-deep px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 p-2 text-white shadow-md shadow-blue-950/40">
            <Bot size={16} />
            <Sparkles className="absolute -right-1 -top-1 text-amber-300" size={8} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-bold tracking-wide text-white">Kuro AI</h2>
              <span
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8.5px] font-semibold uppercase tracking-wider ${
                  activeAssetId
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    activeAssetId ? 'bg-emerald-400 animate-pulse' : 'bg-amber-300'
                  }`}
                />
                {activeAssetId ? 'Photo Linked' : 'No Photo'}
              </span>
            </div>
            <p className="mt-0.5 truncate text-[10.5px] text-obsidian-textMut" title={activeFileName || ''}>
              {activeFileName || (activeAssetId ? 'Photo ready' : 'Select an image to start')}
            </p>
            {activeAssetId && (
              <p className="mt-0.5 text-[9px] text-obsidian-textMut" role="status">
                {preparingContext
                  ? 'Preparing current edits locally…'
                  : contextReady
                    ? 'Photo ready · shared only after your prompt'
                    : 'Photo context will be prepared locally'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setMessages([]);
              setProposal(null);
              setError('');
              setPrompt('');
            }}
            disabled={busy || applying || messages.length === 0}
            aria-label="Clear conversation"
            title="Start fresh conversation"
            className="rounded p-1.5 text-obsidian-textMut transition-colors hover:bg-obsidian-hover hover:text-white disabled:opacity-30"
          >
            <Trash2 size={13} />
          </button>
          <button
            onClick={onClose}
            aria-label="Close Kuro AI sidebar"
            title="Close Kuro AI"
            className="rounded p-1.5 text-obsidian-textMut transition-colors hover:bg-obsidian-hover hover:text-white"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {/* ── Main Chat / Content Area ── */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-obsidian-deep/80 p-3">
        {/* Empty state & Welcome */}
        {messages.length === 0 && (
          <div className="overflow-hidden rounded-xl border border-obsidian-border bg-obsidian-panel shadow-md">
            <div className="border-b border-obsidian-border bg-gradient-to-br from-blue-950/60 to-indigo-950/20 p-3.5">
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles size={13} className="text-amber-300" />
                Intelligent Visual Editing
              </h3>
              <p className="mt-1 text-[10.5px] leading-relaxed text-obsidian-textSec">
                Ask Kuro AI to analyze lighting, fix color casts, or craft cinematic looks. Every edit is previewed for your review.
              </p>
            </div>

            {/* No photo notification with 1-click select */}
            {!activeAssetId && availableAssets.length > 0 && onSelectAsset && (
              <div className="m-3 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-[10.5px] text-amber-200">
                <p className="font-semibold flex items-center gap-1.5">
                  <ImagePlus size={13} />
                  Choose a photo to enable AI analysis
                </p>
                <button
                  onClick={() => onSelectAsset(availableAssets[0].id)}
                  className="mt-2 w-full py-1 px-2 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-100 font-medium text-[10px] transition-colors border border-amber-400/40"
                >
                  Select &quot;{availableAssets[0].file_name}&quot;
                </button>
              </div>
            )}

            {/* Quick prompt suggestions */}
            <div className="flex flex-col gap-1.5 p-3">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-obsidian-textMut mb-0.5">
                Suggested Directives
              </p>
              {CATEGORIZED_SUGGESTIONS.map((sug) => {
                const Icon = sug.icon;
                return (
                  <button
                    key={sug.label}
                    onClick={() => void submit(sug.prompt)}
                    disabled={!activeAssetId || busy}
                    className="flex items-center justify-between gap-2 rounded-lg border border-obsidian-border bg-obsidian-card p-2 text-left transition-all hover:border-obsidian-accent/60 hover:bg-obsidian-hover hover:text-white disabled:cursor-not-allowed disabled:opacity-40 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon size={13} className="text-obsidian-accent shrink-0 group-hover:scale-110 transition-transform" />
                      <div className="truncate">
                        <span className="font-medium text-white block truncate">{sug.label}</span>
                        <span className="text-[9.5px] text-obsidian-textMut truncate block">{sug.prompt}</span>
                      </div>
                    </div>
                    <Send size={11} className="shrink-0 text-obsidian-textMut group-hover:text-obsidian-accent transition-colors" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Message feed */}
        {messages.map((message, index) => (
          <div
            key={`${index}-${message.role}`}
            className={`max-w-[92%] rounded-xl px-3.5 py-2 text-[11px] leading-relaxed select-text ${
              message.role === 'user'
                ? 'self-end rounded-br-sm border border-blue-500/30 bg-blue-600 text-white shadow-md'
                : 'self-start rounded-bl-sm border border-obsidian-border bg-obsidian-panel text-obsidian-textPri shadow-sm'
            }`}
          >
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
        ))}

        {/* Busy loading indicator */}
        {busy && (
          <div className="flex items-center gap-2 self-start rounded-xl border border-obsidian-border bg-obsidian-panel px-3 py-2 text-[11px] text-obsidian-textMut shadow-sm">
            <LoaderCircle size={13} className="animate-spin text-obsidian-accent" />
            <span>Kuro is analyzing the photo and computing edits…</span>
          </div>
        )}

        {/* Before / After Proposal Review */}
        {proposal && (
          <section className="space-y-2.5 rounded-xl border border-blue-500/40 bg-obsidian-panel p-3 shadow-lg shadow-black/30">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-bold text-white text-[11px]">
                <Sparkles size={12} className="text-amber-300" />
                Proposed Adjustments
              </span>
              <span className="text-[9px] font-mono text-obsidian-textMut">Non-destructive</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <figure className="overflow-hidden rounded-lg border border-obsidian-border bg-black/60">
                <img
                  src={proposal.currentPreview}
                  alt="Current state"
                  className="aspect-[4/3] w-full object-contain"
                />
                <figcaption className="py-1 text-center text-[9.5px] font-medium text-obsidian-textMut bg-obsidian-deep/80">
                  Current
                </figcaption>
              </figure>
              <figure className="overflow-hidden rounded-lg border border-blue-500/40 bg-black/60">
                <img
                  src={proposal.proposedPreview}
                  alt="Proposed edit"
                  className="aspect-[4/3] w-full object-contain"
                />
                <figcaption className="py-1 text-center text-[9.5px] font-bold text-blue-300 bg-blue-950/40">
                  AI Proposal
                </figcaption>
              </figure>
            </div>

            <details className="text-[10px] text-obsidian-textMut">
              <summary className="cursor-pointer hover:text-white transition-colors">
                View numerical parameters
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 font-mono text-[9px] text-obsidian-textSec border border-obsidian-border/50">
                {JSON.stringify(proposal.edits, null, 2)}
              </pre>
            </details>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => void approve()}
                disabled={applying}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 font-bold text-white transition-colors shadow-md disabled:opacity-50"
              >
                {applying ? <LoaderCircle size={12} className="animate-spin" /> : <Check size={12} />}
                Apply Edits
              </button>
              <button
                onClick={() => setProposal(null)}
                disabled={applying}
                className="rounded-lg border border-obsidian-border bg-obsidian-elevated hover:bg-obsidian-hover hover:text-white px-3 py-1.5 font-medium text-obsidian-textMut transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </section>
        )}

        {/* Error message banner */}
        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/15 p-2.5 text-[10.5px] text-red-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
            <div className="flex-1">{error}</div>
            <button onClick={() => setError('')} className="text-red-300 hover:text-white">
              <X size={12} />
            </button>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Box Form ── */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(prompt);
        }}
        className="p-3 border-t border-obsidian-border bg-obsidian-card"
      >
        <div className="relative flex items-end gap-2 rounded-2xl border border-obsidian-border bg-obsidian-deep px-3 py-1.5 focus-within:border-blue-500/80 focus-within:ring-1 focus-within:ring-blue-500/30 transition-all shadow-inner">
          <textarea
            ref={textareaRef}
            rows={1}
            value={prompt}
            onChange={handlePromptChange}
            onKeyDown={handleKeyDown}
            disabled={busy}
            placeholder={
              activeAssetId
                ? 'Ask Kuro to edit or analyze this photo…'
                : 'Select a photo from library first…'
            }
            className="flex-1 max-h-32 min-h-[26px] resize-none bg-transparent py-1 text-xs text-white outline-none placeholder:text-obsidian-textMut/60 leading-5"
          />

          <div className="flex items-center gap-1 shrink-0 pb-0.5">
            {prompt.trim().length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setPrompt('');
                  if (textareaRef.current) textareaRef.current.style.height = 'auto';
                }}
                className="h-6 w-6 rounded-full flex items-center justify-center text-obsidian-textMut hover:text-white hover:bg-obsidian-hover transition-colors"
                title="Clear text"
              >
                <X size={12} />
              </button>
            )}

            <button
              type="submit"
              disabled={!prompt.trim() || busy}
              aria-label="Send directive to Kuro AI"
              title="Send (Enter)"
              className={`h-7 w-7 rounded-xl flex items-center justify-center transition-all ${
                prompt.trim() && !busy
                  ? 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-600/30 active:scale-95'
                  : 'bg-obsidian-elevated text-obsidian-textMut/40 cursor-not-allowed'
              }`}
            >
              {busy ? (
                <LoaderCircle size={13} className="animate-spin text-white/60" />
              ) : (
                <ArrowUp size={14} strokeWidth={2.5} />
              )}
            </button>
          </div>
        </div>
      </form>

      {/* ── Resizer handle strip on the right edge ── */}
      <div
        onMouseDown={startResizing}
        onDoubleClick={() => setWidth(380)}
        title="Drag to resize Kuro AI sidebar • Double-click to reset"
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-500 transition-colors z-30"
      />
    </aside>
  );
};
