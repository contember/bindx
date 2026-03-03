import { describe, test, expect, beforeEach, mock } from 'bun:test'
import { SnapshotStore, ActionDispatcher, EventEmitter, FieldHandle, createServerError } from '@contember/bindx'
import { createTestDispatcher } from '../shared/unitTestHelpers.js'

describe('FieldHandle', () => {
	let store: SnapshotStore
	let dispatcher: ActionDispatcher
	let eventEmitter: EventEmitter

	beforeEach(() => {
		const setup = createTestDispatcher()
		store = setup.store
		dispatcher = setup.dispatcher
		eventEmitter = setup.eventEmitter
	})

	function createFieldHandle<T>(fieldPath: string[]): FieldHandle<T> {
		return new FieldHandle<T>('Article', 'a-1', fieldPath, store, dispatcher)
	}

	// ==================== Value Access ====================

	describe('Value Access', () => {
		test('should return field value', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test Title' }, true)
			const handle = createFieldHandle<string>(['title'])

			expect(handle.value).toBe('Test Title')
		})

		test('should return null when entity not loaded', () => {
			const handle = createFieldHandle<string>(['title'])

			expect(handle.value).toBeNull()
		})

		test('should return server value', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createFieldHandle<string>(['title'])

			expect(handle.value).toBe('Modified')
			expect(handle.serverValue).toBe('Original')
		})

		test('should return null for server value when entity not loaded', () => {
			const handle = createFieldHandle<string>(['title'])

			expect(handle.serverValue).toBeNull()
		})
	})

	// ==================== Dirty State ====================

	describe('Dirty State', () => {
		test('should return false when value equals server value', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			expect(handle.isDirty).toBe(false)
		})

		test('should return true when value differs from server value', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			store.setFieldValue('Article', 'a-1', ['title'], 'Modified')

			const handle = createFieldHandle<string>(['title'])

			expect(handle.isDirty).toBe(true)
		})

		test('should detect dirty state for nested fields', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', meta: { views: 0 } }, true)
			store.setFieldValue('Article', 'a-1', ['meta', 'views'], 100)

			const handle = createFieldHandle<number>(['meta', 'views'])

			expect(handle.isDirty).toBe(true)
		})
	})

	// ==================== setValue ====================

	describe('setValue', () => {
		test('should set field value', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.setValue('Updated')

			expect(handle.value).toBe('Updated')
		})

		test('should clear non-sticky client errors on value change', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })

			const handle = createFieldHandle<string>(['title'])
			handle.setValue('New Value')

			expect(store.getFieldErrors('Article', 'a-1', 'title').length).toBe(0)
		})

		test('should preserve sticky client errors on value change', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addFieldError('Article', 'a-1', 'title', { message: 'Sticky Error', source: 'client', sticky: true })

			const handle = createFieldHandle<string>(['title'])
			handle.setValue('New Value')

			const errors = store.getFieldErrors('Article', 'a-1', 'title')
			expect(errors.length).toBe(1)
			expect(errors[0]?.message).toBe('Sticky Error')
		})
	})

	// ==================== Touched State ====================

	describe('Touched State', () => {
		test('should return false initially', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			expect(handle.isTouched).toBe(false)
		})

		test('should mark field as touched via touch()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.touch()

			expect(handle.isTouched).toBe(true)
		})
	})

	// ==================== Input Props ====================

	describe('inputProps', () => {
		test('should return value', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			expect(handle.inputProps.value).toBe('Test')
		})

		test('should provide setValue function', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.inputProps.setValue('Updated via inputProps')

			expect(handle.value).toBe('Updated via inputProps')
		})

		test('should provide onChange function', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.inputProps.onChange('Updated via onChange')

			expect(handle.value).toBe('Updated via onChange')
		})
	})

	// ==================== Nested Fields ====================

	describe('Nested Fields', () => {
		test('should access nested field value', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				meta: { views: 100, likes: 50 },
			}, true)

			const handle = createFieldHandle<{ views: number; likes: number }>(['meta'])

			expect(handle.value).toEqual({ views: 100, likes: 50 })
		})

		test('should create nested field handle via nested()', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				meta: { views: 100 },
			}, true)

			const metaHandle = createFieldHandle<{ views: number }>(['meta'])
			const viewsHandle = metaHandle.nested('views')

			expect(viewsHandle.value).toBe(100)
		})

		test('should set nested field value', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				meta: { views: 100 },
			}, true)

			const metaHandle = createFieldHandle<{ views: number }>(['meta'])
			const viewsHandle = metaHandle.nested('views')

			viewsHandle.setValue(200)

			expect(viewsHandle.value).toBe(200)
		})
	})

	// ==================== Field Metadata ====================

	describe('Field Metadata', () => {
		test('should return field name', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			expect(handle.fieldName).toBe('title')
		})

		test('should return field path', () => {
			store.setEntityData('Article', 'a-1', {
				id: 'a-1',
				meta: { views: 100 },
			}, true)

			const metaHandle = createFieldHandle<{ views: number }>(['meta'])
			const viewsHandle = metaHandle.nested('views')

			expect(viewsHandle.path).toEqual(['meta', 'views'])
		})
	})

	// ==================== Errors ====================

	describe('Errors', () => {
		test('should return field errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addFieldError('Article', 'a-1', 'title', { message: 'Error 1', source: 'client' })
			store.addFieldError('Article', 'a-1', 'title', createServerError('Error 2'))

			const handle = createFieldHandle<string>(['title'])

			expect(handle.errors.length).toBe(2)
		})

		test('should check if field has errors', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)

			const handle = createFieldHandle<string>(['title'])
			expect(handle.hasError).toBe(false)

			store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })
			expect(handle.hasError).toBe(true)
		})

		test('should add error via addError()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.addError({ message: 'Custom error' })

			const errors = store.getFieldErrors('Article', 'a-1', 'title')
			expect(errors.length).toBe(1)
			expect(errors[0]?.message).toBe('Custom error')
			expect(errors[0]?.source).toBe('client')
		})

		test('should add error with code', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.addError({ message: 'Required field', code: 'REQUIRED' })

			const errors = store.getFieldErrors('Article', 'a-1', 'title')
			expect(errors[0]?.code).toBe('REQUIRED')
		})

		test('should clear errors via clearErrors()', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Test' }, true)
			store.addFieldError('Article', 'a-1', 'title', { message: 'Error', source: 'client' })

			const handle = createFieldHandle<string>(['title'])
			handle.clearErrors()

			expect(handle.errors.length).toBe(0)
		})
	})

	// ==================== Event Subscriptions ====================

	describe('Event Subscriptions', () => {
		test('should subscribe to field changes via onChange', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			const listener = mock(() => {})
			handle.onChange(listener)

			handle.setValue('Updated')

			expect(listener).toHaveBeenCalledTimes(1)
		})

		test('should unsubscribe from field changes', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			const listener = mock(() => {})
			const unsubscribe = handle.onChange(listener)

			unsubscribe()
			handle.setValue('Updated')

			expect(listener).not.toHaveBeenCalled()
		})

		test('should intercept field changes via onChanging with dispatchAsync', async () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.onChanging(() => ({ action: 'cancel' as const }))

			await dispatcher.dispatchAsync({
				type: 'SET_FIELD',
				entityType: 'Article',
				entityId: 'a-1',
				fieldPath: ['title'],
				value: 'Updated',
			})

			expect(handle.value).toBe('Original')
		})

		test('should intercept field changes via onChanging with sync setValue', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.onChanging(() => ({ action: 'cancel' as const }))

			handle.setValue('Updated')

			expect(handle.value).toBe('Original')
		})

		test('should modify field value via onChanging with sync setValue', () => {
			store.setEntityData('Article', 'a-1', { id: 'a-1', title: 'Original' }, true)
			const handle = createFieldHandle<string>(['title'])

			handle.onChanging((event) => ({
				action: 'modify' as const,
				event: { ...event, newValue: 'Interceptor Value' },
			}))

			handle.setValue('Updated')

			expect(handle.value).toBe('Interceptor Value')
		})
	})
})
