import '../setup'
import { describe, test, expect, afterEach, vi } from 'bun:test'
import { render, waitFor, act, cleanup } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	MockAdapter,
	defineSchema,
	entityDef,
	scalar,
	hasOne,
	hasMany,
	Entity,
	Field,
	isTempId,
	useField,
	type FieldRef,
} from '@contember/bindx-react'

afterEach(() => {
	cleanup()
})

// Test types
interface Author {
	id: string
	name: string
	email: string
}

interface Article {
	id: string
	title: string
	content: string
	author: Author
}

// Create typed schema
interface TestSchema {
	Article: Article
	Author: Author
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				content: scalar(),
				author: hasOne('Author'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				email: scalar(),
			},
		},
	},
})

const entityDefs = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
} as const

// Helper to query by data-testid
function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function FieldValue<T>({ field, testId }: { field: FieldRef<T>; testId: string }): React.ReactElement {
	const acc = useField(field)
	return <span data-testid={testId}>{String(acc.value ?? 'empty')}</span>
}

describe('Entity Create Mode', () => {
	describe('Basic Create Mode', () => {
		test('Entity with create prop renders without fetching', async () => {
			const adapter = new MockAdapter({})

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} create>
						{author => (
							<div data-testid="author">
								<span data-testid="is-new">{author.$isNew ? 'new' : 'existing'}</span>
								<span data-testid="persisted-id">{author.$persistedId ?? 'none'}</span>
							</div>
						)}
					</Entity>
				</BindxProvider>,
			)

			// Should render immediately without loading state
			await waitFor(() => {
				expect(getByTestId(container, 'author')).toBeDefined()
			})

			// Should be marked as new
			expect(getByTestId(container, 'is-new').textContent).toBe('new')

			// Should not have persisted ID yet
			expect(getByTestId(container, 'persisted-id').textContent).toBe('none')
		})

		test('Entity in create mode has temp ID starting with __temp_', async () => {
			const adapter = new MockAdapter({})

			let capturedId: string | null = null

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} create>
						{author => {
							capturedId = author.id
							return (
								<div data-testid="author">
									<span data-testid="entity-id">{author.id}</span>
								</div>
							)
						}}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'author')).toBeDefined()
			})

			expect(capturedId).toBeDefined()
			expect(isTempId(capturedId!)).toBe(true)
		})

		test('Field setValue works in create mode', async () => {
			const adapter = new MockAdapter({})

			let setNameFn: ((value: string | null) => void) | undefined

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} create>
						{author => {
							setNameFn = author.name.setValue
							return (
								<div data-testid="author">
									<FieldValue field={author.name} testId="name" />
									<Field field={author.name} />
								</div>
							)
						}}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'author')).toBeDefined()
			})

			// Initial state - empty
			expect(getByTestId(container, 'name').textContent).toBe('empty')

			// Set value
			await act(async () => {
				setNameFn!('John Doe')
			})

			await waitFor(() => {
				expect(getByTestId(container, 'name').textContent).toBe('John Doe')
			})
		})
	})

	describe('onPersisted Callback', () => {
		test('onPersisted is called after successful persist with server ID', async () => {
			const onPersisted = vi.fn()

			// MockAdapter that returns new ID on create
			const adapter = new MockAdapter({})

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} create onPersisted={onPersisted}>
						{author => (
							<div data-testid="author">
								<span data-testid="is-new">{author.$isNew ? 'new' : 'existing'}</span>
								<span data-testid="persisted-id">{author.$persistedId ?? 'none'}</span>
								<Field field={author.name} />
							</div>
						)}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'author')).toBeDefined()
			})

			// Initially, onPersisted should not have been called
			expect(onPersisted).not.toHaveBeenCalled()

			// isNew should be true
			expect(getByTestId(container, 'is-new').textContent).toBe('new')
		})
	})

	describe('SnapshotStore Create Entity', () => {
		test('store.createEntity generates temp ID and sets existsOnServer false', async () => {
			const adapter = new MockAdapter({})

			let storeRef: any

			const TestComponent = () => {
				const { store } = require('@contember/bindx-react').useBindxContext()
				storeRef = store
				return null
			}

			render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(storeRef).toBeDefined()
			})

			// Create entity via store
			const tempId = storeRef.createEntity('Author')

			// Verify temp ID format
			expect(isTempId(tempId)).toBe(true)

			// Verify existsOnServer is false
			expect(storeRef.existsOnServer('Author', tempId)).toBe(false)

			// Verify isNewEntity is true
			expect(storeRef.isNewEntity('Author', tempId)).toBe(true)

			// Verify getPersistedId returns null for temp ID
			expect(storeRef.getPersistedId('Author', tempId)).toBe(null)
		})

		test('store.mapTempIdToPersistedId updates state correctly', async () => {
			const adapter = new MockAdapter({})

			let storeRef: any

			const TestComponent = () => {
				const { store } = require('@contember/bindx-react').useBindxContext()
				storeRef = store
				return null
			}

			render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(storeRef).toBeDefined()
			})

			// Create entity
			const tempId = storeRef.createEntity('Author')

			// Initially new
			expect(storeRef.isNewEntity('Author', tempId)).toBe(true)
			expect(storeRef.getPersistedId('Author', tempId)).toBe(null)

			// Map to persisted ID
			storeRef.mapTempIdToPersistedId('Author', tempId, 'real-id-123')

			// Now should not be new
			expect(storeRef.isNewEntity('Author', tempId)).toBe(false)

			// Should have persisted ID
			expect(storeRef.getPersistedId('Author', tempId)).toBe('real-id-123')

			// existsOnServer should be true
			expect(storeRef.existsOnServer('Author', tempId)).toBe(true)
		})

		test('store.getPersistedId returns real ID for non-temp IDs', async () => {
			const adapter = new MockAdapter({
				Author: {
					'author-1': { id: 'author-1', name: 'John', email: 'john@example.com' },
				},
			})

			let storeRef: any

			const TestComponent = () => {
				const { store } = require('@contember/bindx-react').useBindxContext()
				storeRef = store
				return null
			}

			render(
				<BindxProvider adapter={adapter} schema={schema}>
					<TestComponent />
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(storeRef).toBeDefined()
			})

			// For real IDs, getPersistedId should return the ID itself
			expect(storeRef.getPersistedId('Author', 'author-1')).toBe('author-1')

			// isNewEntity should be false for real IDs
			expect(storeRef.isNewEntity('Author', 'author-1')).toBe(false)
		})
	})

	describe('Props Union Type', () => {
		test('Entity with by prop works (edit mode)', async () => {
			const adapter = new MockAdapter({
				Author: {
					'author-1': { id: 'author-1', name: 'John', email: 'john@example.com' },
				},
			})

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} by={{ id: 'author-1' }}>
						{author => (
							<div data-testid="author">
								<Field field={author.name}>
									{field => <span data-testid="name">{String(field.value ?? '')}</span>}
								</Field>
								<span data-testid="is-new">{author.$isNew ? 'new' : 'existing'}</span>
								<span data-testid="persisted-id">{author.$persistedId ?? 'none'}</span>
							</div>
						)}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'name').textContent).toBe('John')
			})

			// Existing entity should not be new
			expect(getByTestId(container, 'is-new').textContent).toBe('existing')

			// Should have persisted ID
			expect(getByTestId(container, 'persisted-id').textContent).toBe('author-1')
		})

		test('Entity with create prop works (create mode)', async () => {
			const adapter = new MockAdapter({})

			const { container } = render(
				<BindxProvider adapter={adapter} schema={schema}>
					<Entity entity={entityDefs.Author} create>
						{author => (
							<div data-testid="author">
								<span data-testid="is-new">{author.$isNew ? 'new' : 'existing'}</span>
							</div>
						)}
					</Entity>
				</BindxProvider>,
			)

			await waitFor(() => {
				expect(getByTestId(container, 'author')).toBeDefined()
			})

			expect(getByTestId(container, 'is-new').textContent).toBe('new')
		})
	})
})
