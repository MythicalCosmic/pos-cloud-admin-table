---
version: 1
slug: "src-pages-ai-assistant-index-vue"
primary_target: "src/pages/ai-assistant/index.vue"
related_targets: ["src/components/ai/ProgressiveReply.vue", "src/components/ai/ThinkingLevel.vue", "src/components/ai/AssistantHistory.vue", "src/components/design/AIChartBlock.vue", "src/components/design/MarkdownMessage.vue", "src/styles/pages/ai-assistant.css"]
---

# AI conversation workspace

Mode: Operate. The September 13 finish refines the approved conversation workspace across all six light/dark palettes, preserving Hanken Grotesk, JetBrains Mono and the existing conversation APIs.

Composition: a 232px desktop history column accompanies the scrollable thread and reachable composer. Compact layouts expose history and Thinking Level through dialogs. User questions align right; assistant replies use readable body text, compact identity/actions, structured Markdown and internally scrolling tables with right-aligned tabular numbers. A more defined outer frame contains soft message and chart surfaces; prompt cards use thin semantic accents, the history control has a quiet primary treatment and the active composer gains a clear focus ring.

Reply presentation: the existing `/ai/query/` request still returns completed JSON. The store keeps the complete response unchanged while ProgressiveReply reveals the newest live reply at word and Markdown boundaries. This is not backend token streaming. Reveal runs over 650–6000ms at 40ms intervals, with a visible Show full answer action. Reduced motion, hidden documents and answers over 60,000 characters show immediately. Existing history is displayed complete. The thread follows the latest only while the reader is following; scrolling upward preserves position and offers Jump to latest. Copy/export retain full content.

Thinking Level: a native Low/Medium/High/Max slider defaults to Low and shares one page preference between desktop history and the compact dialog. Keyboard input, named step buttons, translated value text and explanatory association remain intact. Preview and “Not connected yet. This does not change replies.” identify its current scope. It sends no model or effort field. The dialog uses a component-local visually hidden repeated label, retaining the input name without duplicating the dialog heading after teleporting.

Charts: AIChartBlock uses TimeSeriesExplorer for area/column views, DistributionChart for rings and selectable ranked bars for horizontal comparisons. All returned series, exact-value tables, keyboard/touch controls and longer-list selectors remain available. Invalid data exposes its original content rather than fabricated values or an endless pending state. Fenced chart payloads are removed only from history snippets; saved messages and sanitized Markdown remain intact.

Behavior: preserve searchable history, pinning, rename/delete, chat switching, copy/export, context, Auto/Brief/Actions, starter/follow-up prompts, retry and abort. Requests remain single-flight; drafts and retries retain their conversation context. Loading shows actual elapsed time; failed and stopped responses retain explicit recovery. Long labels and the composer remain usable at 320px in Uzbek, Russian and English.

Verification: desktop/phone layouts, both themes, translations, keyboard/focus, reduced motion, gradual reveal/show-full, reading-position preservation, complete saved responses, unchanged request payload, chart series/data fallbacks and conversation actions. The final finish disposition is ship, with the repeated compact-dialog label resolved and no open material findings.
