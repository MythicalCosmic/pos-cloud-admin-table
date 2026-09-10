import type { ComputedRef, InjectionKey } from 'vue'

export interface FieldContext {
  labelId: string
  label: ComputedRef<string | undefined>
  descriptionId: ComputedRef<string | undefined>
  invalid: ComputedRef<boolean>
}

export const fieldContextKey: InjectionKey<FieldContext> = Symbol('alpha-field')
