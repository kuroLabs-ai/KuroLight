# Kuro AI Assistant & Tool Registry

Kuro AI is an intelligent in-app editing co-pilot designed to evaluate photos, interpret natural language creative requests, and propose non-destructive parameter adjustments.

---

## 1. Dual-Engine Architecture

Kuro AI operates in two complementary modes:

```
                  User Natural Language Prompt
                               │
                               ▼
                ┌──────────────────────────────┐
                │ Has User Configured API Key? │
                └──────────────┬───────────────┘
                               │
                ┌──────────────┴──────────────┐
             No │                             │ Yes
                ▼                             ▼
   ┌─────────────────────────┐   ┌─────────────────────────┐
   │    Local Kuro Engine    │   │      Cloud LLM API      │
   │  - 100% Offline         │   │  - Google Gemini        │
   │  - Zero Network Calls   │   │  - OpenAI GPT-4o        │
   │  - Deterministic Intent │   │  - Anthropic Claude     │
   │  - Instant (<10ms)      │   │  - Full Multi-modal     │
   └────────────┬────────────┘   └────────────┬────────────┘
                │                             │
                └──────────────┬──────────────┘
                               ▼
                   Standardized AIResponse
                               │
                               ▼
               AIToolRegistry Parameter Emission
                               │
                               ▼
         UI "Review & Apply" Proposal (User in the Loop)
```

---

## 2. Local Kuro Engine (Offline Mode)

Defined in: [`src/kurolight/ai/providers.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/ai/providers.py) (`MockAIProvider`)

When no cloud API key is configured, the local engine activates automatically. It parses user intent using semantic rule matching:

* **Exposure & Contrast**: e.g., *"brighten by 0.5 EV"*, *"darker"*, *"boost contrast"*.
* **Color Temperature & Vibrance**: e.g., *"make it warmer"*, *"cool blue tone"*, *"more vibrant"*.
* **Automatic Dynamic Range**: e.g., *"auto enhance"*, *"balance tones"*, *"auto fix"*.
* **Style & Preset Application**: e.g., *"apply cinematic Teal & Orange"*, *"give it a matte film look"*, *"black and white"*.
* **3D LUT Matching**: e.g., *"apply bleach bypass LUT"*, *"vintage warmth look"*.

---

## 3. Registered Tool Definitions

Defined in: [`src/kurolight/ai/registry.py`](file:///d:/vscode/Kuro.worktrees/kurolight/src/kurolight/ai/registry.py)

Kuro AI interacts with the photo editing engine exclusively through structured function tools:

| Tool Name | Parameters | Description |
|:---|:---|:---|
| `adjust_exposure` | `exposure`, `contrast`, `highlights`, `shadows`, `whites`, `blacks` | Controls exposure compensation in EV stops and dynamic range compression. |
| `adjust_white_balance` | `temperature`, `tint`, `saturation`, `vibrance` | Controls Kelvin color temperature, green-magenta tint, and skin-safe vibrance. |
| `auto_enhance` | `intensity` (0.0 to 1.0) | Calculates balanced dynamic range, shadow recovery, and micro-contrast clarity. |
| `color_grade` | `shadows_hue`, `shadows_sat`, `highlights_hue`, `highlights_sat` | Applies 3-way Lift/Gamma/Gain split toning for cinematic looks. |
| `apply_preset` | `preset_name` | Applies a recipe from the 54 built-in style presets. |
| `apply_lut` | `lut_name`, `intensity` | Evaluates a 3D LUT (Teal & Orange, Bleach Bypass, Vintage Warmth). |
| `auto_tone` | `strength` (0.0 to 1.0) | Automatically balances histogram distribution and avoids clipping. |

---

## 4. Human-in-the-Loop Safety Workflow

To prevent unwanted changes to your edits:
1. **Zero Silent Modification**: Kuro AI **never** alters the active photo parameters directly.
2. **Proposed Edits Payload**: Every tool call returns a `proposed_edits` dictionary.
3. **Interactive UI Review**: The AI Assistant popup presents:
   * Explanation of the changes made.
   * Parameter comparison diff.
   * **"Approve & Apply"** button.
   * **"Dismiss"** button.
4. **Undo / Redo Support**: Even after approval, every AI edit creates a discrete snapshot in the undo history stack (`Ctrl+Z` to undo).
