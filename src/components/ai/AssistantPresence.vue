<script setup lang="ts">
defineProps<{ busy?: boolean; large?: boolean }>()
</script>

<template>
  <span
    class="assistant-presence"
    :class="{ 'is-busy': busy, 'is-large': large }"
    aria-hidden="true"
  >
    <svg
      viewBox="0 0 80 80"
      fill="none"
    >
      <g
        class="assistant-presence__orbits"
        stroke="currentColor"
        stroke-width="2.4"
      >
        <ellipse
          cx="40"
          cy="40"
          rx="29"
          ry="13"
        />
        <ellipse
          cx="40"
          cy="40"
          rx="29"
          ry="13"
          transform="rotate(60 40 40)"
        />
        <ellipse
          cx="40"
          cy="40"
          rx="29"
          ry="13"
          transform="rotate(120 40 40)"
        />
      </g>
      <circle
        class="assistant-presence__core"
        cx="40"
        cy="40"
        r="4"
        fill="currentColor"
      />
    </svg>
  </span>
</template>

<style scoped>
.assistant-presence {
  position: relative;
  display: grid;
  flex: 0 0 auto;
  border: 1px solid var(--primary-border);
  border-radius: 14px;
  background: var(--primary-weak);
  block-size: 40px;
  color: var(--primary);
  inline-size: 40px;
  place-items: center;
}

.assistant-presence svg { inline-size: 88%; }
.assistant-presence.is-large { border-radius: 24px; block-size: 82px; inline-size: 82px; }
.assistant-presence__orbits { transform-origin: center; }

@media (prefers-reduced-motion: no-preference) {
  .is-busy .assistant-presence__orbits { animation: assistant-orbit 8s linear infinite; }
  .is-busy .assistant-presence__core { animation: assistant-breathe 2.4s ease-in-out infinite; }
}

@keyframes assistant-breathe { 50% { opacity: .3; } }

@keyframes assistant-orbit { to { transform: rotate(360deg); } }
</style>
