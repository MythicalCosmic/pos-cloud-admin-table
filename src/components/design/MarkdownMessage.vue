<script setup lang="ts">
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github-dark.css'
import AIChartBlock, { type AIChartConfig } from './AIChartBlock.vue'

interface Props {
  content: string
  streaming?: boolean
}

const props = withDefaults(defineProps<Props>(), { streaming: false })

const { t } = useI18n({ useScope: 'global' })

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false,
  highlight: (code, lang) => {
    if (props.streaming)
      return escapeHtml(code)
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang, ignoreIllegals: true }).value
      }
      catch { /* fall through */ }
    }
    try { return hljs.highlightAuto(code).value }
    catch { return escapeHtml(code) }
  },
})

md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>\n'
md.renderer.rules.table_close = () => '</table></div>\n'
for (const type of ['th_open', 'td_open']) {
  md.renderer.rules[type] = (tokens, index, options, _env, self) => {
    const token = tokens[index]
    const alignment = token.attrGet('style')
    const text = tokens[index + 1]?.content.replace(/\*/g, '').trim() ?? ''
    if (alignment === 'text-align:right' || (type === 'td_open' && /^[+−-]?\d[\d\s,.]*(?:\s*[\p{L}%]+)?$/u.test(text)))
      token.attrJoin('class', 'md-number')
    else if (alignment === 'text-align:center')
      token.attrJoin('class', 'md-center')
    return self.renderToken(tokens, index, options)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function spaceifyNumbers(s: string): string {
  return s.replace(/(\d{1,3}(?:,\d{3})+)(?:\.(\d+))?/g, (_m, intPart: string, dec?: string) => {
    const spaced = intPart.replace(/,/g, ' ')
    return dec ? `${spaced}.${dec}` : spaced
  })
}

// ---------- Segment splitter ----------
// Splits the assistant content into ordered text/chart segments. A "chart"
// fence is recognised when the language tag is exactly `chart` (case-insensitive)
// and the body parses as JSON. If JSON.parse fails (mid-stream) we tag it
// pending so a placeholder renders until the stream completes.
type Segment =
  | { type: 'text'; content: string }
  | { type: 'chart'; config: AIChartConfig; pending?: boolean }
  | { type: 'invalid-chart'; content: string }

const CHART_FENCE = /```chart\s*\n([\s\S]*?)(?:```|$)/gi

function chartSegment(body: string, closed: boolean): Segment {
  let config: AIChartConfig | null = null
  try { config = JSON.parse(body) as AIChartConfig }
  catch { /* Preserve invalid or incomplete data for the fallback below. */ }
  if (config && closed)
    return { type: 'chart', config }
  if (!props.streaming)
    return { type: 'invalid-chart', content: body }
  return { type: 'chart', config: config ?? { type: 'bar' }, pending: true }
}

const segments = computed<Segment[]>(() => {
  const raw = props.content || ''
  const out: Segment[] = []
  let last = 0
  CHART_FENCE.lastIndex = 0
  for (const match of raw.matchAll(CHART_FENCE)) {
    const offset = match.index ?? 0
    if (offset > last)
      out.push({ type: 'text', content: raw.slice(last, offset) })
    const body = (match[1] || '').trim()
    const closed = match[0].endsWith('```')

    out.push(chartSegment(body, closed))
    last = offset + match[0].length
  }
  if (last < raw.length)
    out.push({ type: 'text', content: raw.slice(last) })
  if (!out.length)
    out.push({ type: 'text', content: raw })
  return out
})

function renderText(s: string): string {
  const html = md.render(spaceifyNumbers(s))
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'title'],
    ADD_ATTR: ['target', 'rel'],
  })
}

// Attach code-block "Copy" + lang chip to <pre> elements after each text segment
// has been v-html'd. Runs once per content change after nextTick.
const root = ref<HTMLElement | null>(null)

function attachCodeActions() {
  const el = root.value
  if (!el || props.streaming)
    return
  el.querySelectorAll('pre').forEach(pre => {
    if ((pre as HTMLElement).dataset.mdAttached)
      return
    ;(pre as HTMLElement).dataset.mdAttached = '1'

    const wrap = document.createElement('div')

    wrap.className = 'md-code-wrap'

    const head = document.createElement('div')

    head.className = 'md-code-head'

    const langEl = pre.querySelector('code')
    const langClass = (langEl?.className || '').match(/language-(\S+)/)?.[1]
    const lbl = document.createElement('span')

    lbl.className = 'md-code-lang'
    lbl.textContent = langClass || 'text'

    const btn = document.createElement('button')

    btn.type = 'button'
    btn.className = 'md-code-copy'
    btn.textContent = t('Copy')
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(langEl?.textContent ?? pre.textContent ?? '')
        btn.textContent = t('Copied')
        setTimeout(() => { btn.textContent = t('Copy') }, 1200)
      }
      catch { /* noop */ }
    })
    head.appendChild(lbl)
    head.appendChild(btn)
    pre.parentNode?.insertBefore(wrap, pre)
    wrap.appendChild(head)
    wrap.appendChild(pre)
  })
  el.querySelectorAll('a[href]').forEach(a => {
    const h = a.getAttribute('href') || ''
    if (/^https?:\/\//.test(h)) {
      a.setAttribute('target', '_blank')
      a.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

watch(() => [props.content, props.streaming], async () => {
  await nextTick()
  attachCodeActions()
})
onMounted(() => {
  nextTick(attachCodeActions)
})
</script>

<template>
  <div
    ref="root"
    class="md"
  >
    <template
      v-for="(seg, i) in segments"
      :key="i"
    >
      <div
        v-if="seg.type === 'text'"
        v-html="renderText(seg.content)"
      />
      <AIChartBlock
        v-else-if="seg.type === 'chart'"
        :config="seg.config"
        :streaming="!!seg.pending || streaming"
      />
      <details
        v-else
        class="md-chart-fallback"
      >
        <summary>{{ t('ai_workspace_chart_error') }}</summary>
        <pre>{{ seg.content }}</pre>
      </details>
    </template>
  </div>
</template>

<style>
/* Global styles — markdown-it output is injected via v-html and scoped wouldn't apply */
.md { line-height: var(--lh-body); color: var(--text); }
.md-chart-fallback { margin: 12px 0; padding: 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface-2); color: var(--text-secondary); font-size: 13px; }
.md-chart-fallback summary { cursor: pointer; }
.md-chart-fallback pre { margin-block-start: 12px; color: var(--text); }
.md > *:first-child { margin-top: 0; }
.md > *:last-child { margin-bottom: 0; }

.md h1, .md h2, .md h3, .md h4 {
  font-weight: var(--fw-bold);
  letter-spacing: -0.01em;
  color: var(--text);
  margin: 1.2em 0 0.5em;
  line-height: 1.25;
}
.md h1 { font-size: 1.4em; }
.md h2 { font-size: 1.22em; }
.md h3 { font-size: 1.08em; }
.md h4 { font-size: 1em; color: var(--text-secondary); }
.md p { margin: 0 0 0.75em; }
.md strong { font-weight: var(--fw-semibold); color: var(--text); }
.md em { font-style: italic; }
.md a {
  color: var(--primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
}
.md a:hover { color: var(--primary-hover); }
.md ul, .md ol { margin: 0.4em 0 0.9em; padding-left: 1.5em; }
.md ul:last-child, .md ol:last-child { margin-bottom: 0; }
.md li { margin: 0.2em 0; }
.md li::marker { color: var(--text-tertiary); }
.md blockquote {
  margin: 0.6em 0;
  padding: 0.4em 1em;
  border-left: 1px solid var(--primary);
  background: var(--primary-weak);
  color: var(--text-secondary);
  border-radius: 4px;
}
.md hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1em 0;
}

/* Tables */
.md-table-wrap {
  max-width: 100%;
  overflow-x: auto;
  overscroll-behavior-inline: contain;
  border: 1px solid var(--border);
  border-radius: 12px;
  margin: 16px 0;
}
.md table {
  width: 100%;
  border-collapse: collapse;
  margin: 0;
  font-size: var(--fs-sm);
  display: table;
}
.md table thead { background: color-mix(in srgb, var(--primary) 5%, var(--surface)); }
.md table th, .md table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
.md table th {
  font-weight: var(--fw-semibold);
  color: var(--text);
  font-size: 12px;
  letter-spacing: 0;
  text-transform: none;
}
.md table tbody tr:last-child td { border-bottom: 0; }
.md table tbody tr:nth-child(even) { background: color-mix(in srgb, var(--surface-2) 48%, transparent); }
.md table tbody tr:hover { background: var(--primary-weak); }
.md table :is(th, td).md-number { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.md table :is(th, td).md-center { text-align: center; }
@media (max-width: 600px) { .md table th, .md table td { padding: 10px; font-size: 12px; } }

/* Inline code */
.md :not(pre) > code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--surface-inset);
  color: var(--text);
  padding: 1px 6px;
  border-radius: 4px;
  border: 1px solid var(--border);
}

/* Code blocks */
.md-code-wrap {
  margin: 0.7em 0;
  background: var(--code-bg, #0d1117);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.md-code-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: color-mix(in srgb, var(--code-bg, #0d1117) 88%, white 12%);
  font-size: var(--fs-label);
  color: rgba(255,255,255,.75);
}
.md-code-lang {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.md-code-copy {
  background: transparent;
  border: 1px solid rgba(255,255,255,.18);
  color: rgba(255,255,255,.85);
  padding: 2px 9px;
  border-radius: 4px;
  font-family: inherit;
  font-size: var(--fs-label);
  cursor: pointer;
  transition: background .12s;
}
.md-code-copy:hover { background: rgba(255,255,255,.1); }
.md pre {
  margin: 0;
  padding: 12px 14px;
  overflow-x: auto;
  background: transparent;
  border: none;
  border-radius: 0;
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1.55;
}
.md pre code {
  background: transparent;
  border: none;
  padding: 0;
  color: rgba(255,255,255,.92);
}

[data-theme="light"] .md-code-wrap { background: #f6f8fa; border-color: var(--border); }
[data-theme="light"] .md-code-head { background: #ebeef2; color: var(--text-secondary); }
[data-theme="light"] .md-code-copy { border-color: var(--border-strong); color: var(--text-secondary); }
[data-theme="light"] .md-code-copy:hover { background: var(--surface); color: var(--text); }
[data-theme="light"] .md pre code { color: var(--text); }
</style>
