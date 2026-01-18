import { ref, reactive, computed } from 'vue'
import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * Individual field error
 */
export interface FieldError {
  message: string
}

/**
 * Options for useFormValidation
 */
export interface UseFormValidationOptions {
  /**
   * Validate on initial mount
   * @default false
   */
  validateOnMount?: boolean
}

/**
 * Return type for useFormValidation
 */
export interface UseFormValidationReturn<T> {
  /**
   * Reactive object containing field errors.
   * Keys are dot-notation paths (e.g., 'user.email', 'items.0.name').
   * Use '_root' for root-level errors.
   */
  errors: Record<string, FieldError>
  /**
   * Whether the form is currently valid (no errors)
   */
  isValid: Readonly<import('vue').Ref<boolean>>
  /**
   * Whether validation has been run at least once
   */
  isDirty: Readonly<import('vue').Ref<boolean>>
  /**
   * Validate the entire form data.
   * Returns the validated data if successful, null if validation fails.
   */
  validate: (data: unknown) => Promise<T | null>
  /**
   * Validate a single field value against its path in the schema.
   * Updates only that field's error state.
   */
  validateField: (field: string, value: unknown, fullData: unknown) => Promise<boolean>
  /**
   * Clear all errors
   */
  clearErrors: () => void
  /**
   * Clear error for a specific field
   */
  clearFieldError: (field: string) => void
  /**
   * Check if a specific field has an error
   */
  hasError: (field: string) => boolean
  /**
   * Get error message for a specific field
   */
  getError: (field: string) => string | undefined
}

/**
 * Form validation composable that works with any Standard Schema-compliant library.
 *
 * Supports Zod, Valibot, ArkType, Effect Schema, TypeBox, and any other library
 * that implements the Standard Schema specification.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { z } from 'zod'
 *
 * const schema = z.object({
 *   email: z.string().email(),
 *   password: z.string().min(8),
 * })
 *
 * const { errors, isValid, validate, getError } = useFormValidation(schema)
 *
 * const form = reactive({ email: '', password: '' })
 *
 * async function handleSubmit() {
 *   const validated = await validate(form)
 *   if (validated) {
 *     // Form is valid, validated has correct types
 *     await submitToServer(validated)
 *   }
 * }
 * </script>
 *
 * <template>
 *   <form @submit.prevent="handleSubmit">
 *     <input v-model="form.email" />
 *     <span v-if="getError('email')">{{ getError('email') }}</span>
 *
 *     <input v-model="form.password" type="password" />
 *     <span v-if="getError('password')">{{ getError('password') }}</span>
 *
 *     <button :disabled="!isValid">Submit</button>
 *   </form>
 * </template>
 * ```
 *
 * @example Using with Valibot
 * ```ts
 * import * as v from 'valibot'
 *
 * const schema = v.object({
 *   email: v.pipe(v.string(), v.email()),
 *   age: v.pipe(v.number(), v.minValue(18)),
 * })
 *
 * const { validate, errors } = useFormValidation(schema)
 * ```
 *
 * @param schema - Any Standard Schema-compliant validator (Zod, Valibot, ArkType, etc.)
 * @param _options - Optional configuration (reserved for future use)
 * @returns Reactive form validation utilities
 */
export function useFormValidation<T>(
  schema: StandardSchemaV1<unknown, T>,
  _options: UseFormValidationOptions = {},
): UseFormValidationReturn<T> {
  const errors = reactive<Record<string, FieldError>>({})
  const isDirty = ref(false)

  const isValid = computed(() => Object.keys(errors).length === 0)

  /**
   * Convert Standard Schema path to dot notation string
   */
  function pathToString(path: StandardSchemaV1.Issue['path']): string {
    if (!path || path.length === 0) return '_root'
    return path.map((segment) => {
      // Handle both simple keys and object segments with 'key' property
      if (typeof segment === 'object' && segment !== null && 'key' in segment) {
        return String(segment.key)
      }
      return String(segment)
    }).join('.')
  }

  /**
   * Clear all errors
   */
  function clearErrors(): void {
    const keys = Object.keys(errors)
    for (const key of keys) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete errors[key]
    }
  }

  /**
   * Clear error for a specific field
   */
  function clearFieldError(field: string): void {
    if (field in errors) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete errors[field]
    }
  }

  /**
   * Check if a specific field has an error
   */
  function hasError(field: string): boolean {
    return field in errors
  }

  /**
   * Get error message for a specific field
   */
  function getError(field: string): string | undefined {
    return errors[field]?.message
  }

  /**
   * Validate the entire form data
   */
  async function validate(data: unknown): Promise<T | null> {
    isDirty.value = true
    clearErrors()

    const result = await schema['~standard'].validate(data)

    if (result.issues) {
      for (const issue of result.issues) {
        const path = pathToString(issue.path)
        errors[path] = {
          message: issue.message,
        }
      }
      return null
    }

    return result.value
  }

  /**
   * Validate a single field by validating the full data and extracting field error
   * This is the most reliable way since schemas may have cross-field dependencies
   */
  async function validateField(field: string, _value: unknown, fullData: unknown): Promise<boolean> {
    isDirty.value = true

    // Clear this field's error first
    clearFieldError(field)

    const result = await schema['~standard'].validate(fullData)

    if (result.issues) {
      // Only update the error for the specific field we're validating
      for (const issue of result.issues) {
        const path = pathToString(issue.path)
        if (path === field) {
          errors[path] = {
            message: issue.message,
          }
          return false
        }
      }
    }

    return true
  }

  return {
    errors,
    isValid,
    isDirty,
    validate,
    validateField,
    clearErrors,
    clearFieldError,
    hasError,
    getError,
  }
}
