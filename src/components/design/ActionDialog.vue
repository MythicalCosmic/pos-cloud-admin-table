<script setup lang="ts">
import Modal from './Modal.vue'
import Input from './Input.vue'
import Field from './Field.vue'
import Button from './Button.vue'
import { useActionDialogHost } from '@/composables/useActionDialog'

const { current, close } = useActionDialogHost()
const answer = ref('')

watch(() => current.value?.id, () => { answer.value = '' })
onBeforeUnmount(() => close())
</script>

<template>
  <Modal
    :open="!!current"
    :title="current?.title || ''"
    :width="480"
    @close="close"
  >
    <form
      v-if="current"
      id="workspace-action-form"
      @submit.prevent="close(answer)"
    >
      <p
        v-if="current.message"
        class="action-dialog__message"
      >
        {{ current.message }}
      </p>
      <Field
        v-if="current.inputLabel"
        :label="current.inputLabel"
      >
        <Input
          v-model="answer"
          autofocus
        />
      </Field>
    </form>
    <template #footer>
      <Button
        type="submit"
        form="workspace-action-form"
        :variant="current?.danger ? 'danger' : 'primary'"
      >
        {{ current?.confirmLabel }}
      </Button>
    </template>
  </Modal>
</template>

<style scoped>
.action-dialog__message { margin: 0; font-size: 14px; line-height: 1.65; color: var(--text-secondary); }
.action-dialog__message + .field { margin-top: 24px; }
</style>
