<script setup lang="ts">
import { workspaceContext } from './context'

provide(workspaceContext, true)
</script>

<template>
  <div class="page operations-workspace">
    <slot />
  </div>
</template>
