import './setup'
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { render, act, waitFor, cleanup } from '@testing-library/react'
import React, { useState } from 'react'
import {
	EventEmitter,
	type FieldChangedEvent,
	type FieldChangingEvent,
	defineSchema,
	scalar,
} from '@contember/bindx'
import {
	BindxProvider,
	MockAdapter,
	useOnEvent,
	useOnEntityEvent,
	useOnFieldEvent,
	createBindx,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

// ============================================================================
// EventEmitter Unit Tests
// ============================================================================

describe('EventEmitter', () => {
	let emitter: EventEmitter

	beforeEach(() => {
		emitter = new EventEmitter()
	})

	describe('global listeners', () => {
		test('should call global listener when event is emitted', () => {
			const events: FieldChangedEvent[] = []

			emitter.on('field:changed', (event) => {
				events.push(event)
			})

			const event: FieldChangedEvent = {
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old Title',
				newValue: 'New Title',
			}

			emitter.emit(event)

			expect(events).toHaveLength(1)
			expect(events[0]).toEqual(event)
		})

		test('should support multiple global listeners', () => {
			let count = 0

			emitter.on('field:changed', () => { count++ })
			emitter.on('field:changed', () => { count++ })
			emitter.on('field:changed', () => { count++ })

			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			})

			expect(count).toBe(3)
		})

		test('should unsubscribe when calling returned function', () => {
			let count = 0

			const unsub = emitter.on('field:changed', () => { count++ })

			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			})

			expect(count).toBe(1)

			unsub()

			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'New',
				newValue: 'Newer',
			})

			expect(count).toBe(1) // Still 1, not called again
		})
	})

	describe('entity-scoped listeners', () => {
		test('should only call listener for matching entity', () => {
			const events: FieldChangedEvent[] = []

			emitter.onEntity('field:changed', 'Article', 'article-1', (event) => {
				events.push(event)
			})

			// Should match
			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			})

			// Should not match - different entity ID
			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-2',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			})

			// Should not match - different entity type
			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Author',
				entityId: 'article-1',
				fieldName: 'name',
				fieldPath: ['name'],
				oldValue: 'Old',
				newValue: 'New',
			})

			expect(events).toHaveLength(1)
			expect(events[0]?.entityId).toBe('article-1')
		})
	})

	describe('field-scoped listeners', () => {
		test('should only call listener for matching field', () => {
			const events: FieldChangedEvent[] = []

			emitter.onField('field:changed', 'Article', 'article-1', 'title', (event) => {
				events.push(event)
			})

			// Should match
			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			})

			// Should not match - different field
			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'content',
				fieldPath: ['content'],
				oldValue: 'Old',
				newValue: 'New',
			})

			expect(events).toHaveLength(1)
			expect(events[0]?.fieldName).toBe('title')
		})
	})

	describe('interceptors', () => {
		test('should allow cancelling action', async () => {
			emitter.intercept('field:changing', () => {
				return { action: 'cancel' }
			})

			const event: FieldChangingEvent = {
				type: 'field:changing',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			}

			const result = await emitter.runInterceptors(event)

			expect(result).toBeNull() // Cancelled
		})

		test('should allow continuing action', async () => {
			emitter.intercept('field:changing', () => {
				return { action: 'continue' }
			})

			const event: FieldChangingEvent = {
				type: 'field:changing',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			}

			const result = await emitter.runInterceptors(event)

			expect(result).not.toBeNull()
			expect(result?.type).toBe('field:changing')
		})

		test('should allow modifying event', async () => {
			emitter.intercept('field:changing', (event) => {
				return {
					action: 'modify',
					event: { ...event, newValue: 'Modified Value' },
				}
			})

			const event: FieldChangingEvent = {
				type: 'field:changing',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			}

			const result = await emitter.runInterceptors(event)

			expect(result).not.toBeNull()
			expect((result as FieldChangingEvent).newValue).toBe('Modified Value')
		})

		test('should run interceptors in order (field -> entity -> global)', async () => {
			const order: string[] = []

			emitter.interceptField('field:changing', 'Article', 'article-1', 'title', () => {
				order.push('field')
				return { action: 'continue' }
			})

			emitter.interceptEntity('field:changing', 'Article', 'article-1', () => {
				order.push('entity')
				return { action: 'continue' }
			})

			emitter.intercept('field:changing', () => {
				order.push('global')
				return { action: 'continue' }
			})

			const event: FieldChangingEvent = {
				type: 'field:changing',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			}

			await emitter.runInterceptors(event)

			expect(order).toEqual(['field', 'entity', 'global'])
		})

		test('should stop at first cancel', async () => {
			const order: string[] = []

			emitter.interceptField('field:changing', 'Article', 'article-1', 'title', () => {
				order.push('field')
				return { action: 'cancel' }
			})

			emitter.interceptEntity('field:changing', 'Article', 'article-1', () => {
				order.push('entity')
				return { action: 'continue' }
			})

			const event: FieldChangingEvent = {
				type: 'field:changing',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			}

			const result = await emitter.runInterceptors(event)

			expect(result).toBeNull()
			expect(order).toEqual(['field']) // Entity interceptor was not called
		})
	})

	describe('clear', () => {
		test('should remove all listeners and interceptors', () => {
			let count = 0

			emitter.on('field:changed', () => { count++ })
			emitter.onEntity('field:changed', 'Article', 'article-1', () => { count++ })
			emitter.onField('field:changed', 'Article', 'article-1', 'title', () => { count++ })

			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'Old',
				newValue: 'New',
			})

			expect(count).toBe(3)

			emitter.clear()

			emitter.emit({
				type: 'field:changed',
				timestamp: Date.now(),
				entityType: 'Article',
				entityId: 'article-1',
				fieldName: 'title',
				fieldPath: ['title'],
				oldValue: 'New',
				newValue: 'Newer',
			})

			expect(count).toBe(3) // No new calls
		})
	})
})

// ============================================================================
// React Hooks Tests
// ============================================================================

describe('Event React Hooks', () => {
	interface Article {
		id: string
		title: string
		content: string
	}

	interface TestSchema {
		Article: Article
	}

	const schema = defineSchema<TestSchema>({
		entities: {
			Article: {
				fields: {
					id: scalar(),
					title: scalar(),
					content: scalar(),
				},
			},
		},
	})

	const { useEntity } = createBindx(schema)

	function createMockData() {
		return {
			Article: {
				'article-1': {
					id: 'article-1',
					title: 'Test Article',
					content: 'Content here',
				},
				'article-2': {
					id: 'article-2',
					title: 'Second Article',
					content: 'More content',
				},
			},
		}
	}

	function getByTestId(container: Element, testId: string): Element {
		const el = container.querySelector(`[data-testid="${testId}"]`)
		if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
		return el
	}

	describe('useOnEvent', () => {
		test('should subscribe and receive events', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const events: FieldChangedEvent[] = []

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().title())

				useOnEvent('field:changed', (event) => {
					events.push(event as FieldChangedEvent)
				})

				if (article.isLoading) return <div>Loading...</div>
				if (article.isError || article.isNotFound) return <div>Error</div>

				return (
					<div>
						<span data-testid="title">{article.title.value}</span>
						<button
							data-testid="update"
							onClick={() => article.title.setValue('Updated Title')}
						>
							Update
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'title').textContent).toBe('Test Article')
			})

			act(() => {
				;(getByTestId(container, 'update') as HTMLButtonElement).click()
			})

			await waitFor(() => {
				expect(events.length).toBeGreaterThan(0)
			})

			expect(events.some(e => e.fieldName === 'title')).toBe(true)
		})

		test('should always use latest callback (no stale closure)', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const capturedValues: number[] = []

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().title())
				const [counter, setCounter] = useState(0)

				useOnEvent('field:changed', () => {
					capturedValues.push(counter)
				})

				if (article.isLoading) return <div>Loading...</div>
				if (article.isError || article.isNotFound) return <div>Error</div>

				return (
					<div>
						<span data-testid="counter">{counter}</span>
						<button data-testid="increment" onClick={() => setCounter(c => c + 1)}>
							Increment
						</button>
						<button
							data-testid="update"
							onClick={() => article.title.setValue(`Title ${Date.now()}`)}
						>
							Update
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'counter').textContent).toBe('0')
			})

			// Increment counter
			act(() => {
				;(getByTestId(container, 'increment') as HTMLButtonElement).click()
			})

			expect(getByTestId(container, 'counter').textContent).toBe('1')

			// Trigger event
			act(() => {
				;(getByTestId(container, 'update') as HTMLButtonElement).click()
			})

			await waitFor(() => {
				expect(capturedValues.length).toBeGreaterThan(0)
			})

			// Should have captured the latest counter value (1), not stale (0)
			expect(capturedValues[capturedValues.length - 1]).toBe(1)
		})
	})

	describe('useOnEntityEvent', () => {
		test('should only receive events for specific entity', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const article1Events: FieldChangedEvent[] = []

			function TestComponent() {
				const article1 = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().title())
				const article2 = useEntity('Article', { by: { id: 'article-2' } }, e => e.id().title())

				useOnEntityEvent('field:changed', 'Article', 'article-1', (event) => {
					article1Events.push(event as FieldChangedEvent)
				})

				if (article1.isLoading || article2.isLoading) return <div>Loading...</div>
				if (article1.isError || article1.isNotFound || article2.isError || article2.isNotFound) return <div>Error</div>

				return (
					<div>
						<button
							data-testid="update-1"
							onClick={() => article1.title.setValue('Updated 1')}
						>
							Update 1
						</button>
						<button
							data-testid="update-2"
							onClick={() => article2.title.setValue('Updated 2')}
						>
							Update 2
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'update-1')).toBeTruthy()
			})

			// Update article 2 - should NOT trigger our listener
			act(() => {
				;(getByTestId(container, 'update-2') as HTMLButtonElement).click()
			})

			// Small delay to ensure event would have been processed
			await new Promise(resolve => setTimeout(resolve, 50))

			const countAfterArticle2Update = article1Events.length

			// Update article 1 - SHOULD trigger our listener
			act(() => {
				;(getByTestId(container, 'update-1') as HTMLButtonElement).click()
			})

			await waitFor(() => {
				expect(article1Events.length).toBeGreaterThan(countAfterArticle2Update)
			})

			// All captured events should be for article-1
			expect(article1Events.every(e => e.entityId === 'article-1')).toBe(true)
		})
	})

	describe('useOnFieldEvent', () => {
		test('should only receive events for specific field', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			const titleEvents: FieldChangedEvent[] = []

			function TestComponent() {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().title().content())

				useOnFieldEvent('field:changed', 'Article', 'article-1', 'title', (event) => {
					titleEvents.push(event as FieldChangedEvent)
				})

				if (article.isLoading) return <div>Loading...</div>
				if (article.isError || article.isNotFound) return <div>Error</div>

				return (
					<div>
						<button
							data-testid="update-title"
							onClick={() => article.title.setValue('New Title')}
						>
							Update Title
						</button>
						<button
							data-testid="update-content"
							onClick={() => article.content.setValue('New Content')}
						>
							Update Content
						</button>
					</div>
				)
			}

			const { container } = render(
				<BindxProvider adapter={adapter}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'update-title')).toBeTruthy()
			})

			// Update content - should NOT trigger our listener
			act(() => {
				;(getByTestId(container, 'update-content') as HTMLButtonElement).click()
			})

			await new Promise(resolve => setTimeout(resolve, 50))
			const countAfterContentUpdate = titleEvents.length

			// Update title - SHOULD trigger our listener
			act(() => {
				;(getByTestId(container, 'update-title') as HTMLButtonElement).click()
			})

			await waitFor(() => {
				expect(titleEvents.length).toBeGreaterThan(countAfterContentUpdate)
			})

			// All captured events should be for title field
			expect(titleEvents.every(e => e.fieldName === 'title')).toBe(true)
		})
	})

	// Note: Field interceptor hooks (useInterceptField, useIntercept) work with
	// async dispatch only. The FieldHandle.setValue() uses synchronous dispatch
	// which emits after events but doesn't run interceptors. Interceptors work
	// with entity lifecycle events (like entity:persisting in BatchPersister)
	// which use dispatchAsync(). See EventEmitter unit tests for interceptor testing.

	describe('cleanup on unmount', () => {
		test('should unsubscribe when component unmounts', async () => {
			const adapter = new MockAdapter(createMockData(), { delay: 0 })
			let eventCount = 0

			function EventListener() {
				useOnEvent('field:changed', () => {
					eventCount++
				})
				return <div data-testid="listener">Listening</div>
			}

			function TestComponent({ showListener }: { showListener: boolean }) {
				const article = useEntity('Article', { by: { id: 'article-1' } }, e => e.id().title())

				if (article.isLoading) return <div>Loading...</div>
				if (article.isError || article.isNotFound) return <div>Error</div>

				return (
					<div>
						{showListener && <EventListener />}
						<button
							data-testid="update"
							onClick={() => article.title.setValue(`Title ${Date.now()}`)}
						>
							Update
						</button>
					</div>
				)
			}

			function Parent() {
				const [showListener, setShowListener] = useState(true)

				return (
					<BindxProvider adapter={adapter}>
						<TestComponent showListener={showListener} />
						<button data-testid="toggle" onClick={() => setShowListener(s => !s)}>
							Toggle
						</button>
					</BindxProvider>
				)
			}

			const { container } = render(<Parent />)

			await waitFor(() => {
				expect(getByTestId(container, 'update')).toBeTruthy()
			})

			// Update while listener is mounted
			act(() => {
				;(getByTestId(container, 'update') as HTMLButtonElement).click()
			})

			await waitFor(() => {
				expect(eventCount).toBeGreaterThan(0)
			})

			const countWithListener = eventCount

			// Unmount listener
			act(() => {
				;(getByTestId(container, 'toggle') as HTMLButtonElement).click()
			})

			// Update after listener is unmounted
			act(() => {
				;(getByTestId(container, 'update') as HTMLButtonElement).click()
			})

			await new Promise(resolve => setTimeout(resolve, 50))

			// Event count should NOT have increased (listener was unsubscribed)
			expect(eventCount).toBe(countWithListener)
		})
	})
})
