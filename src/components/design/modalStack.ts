import { ref } from 'vue'

// Shared across instances, including confirmations opened above an editing form.
export const modalStack = ref<string[]>([])
