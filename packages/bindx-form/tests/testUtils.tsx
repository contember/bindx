import '../../../tests/setup'
import {
	createBindx,
	MockAdapter,
	defineSchema,
	scalar,
	hasOne,
	hasMany,
} from '@contember/bindx-react'

// Test types
export interface Author {
	id: string
	name: string
	bio: string
}

export interface Tag {
	id: string
	name: string
}

export interface Article {
	id: string
	title: string
	published: boolean | null
	status: string
	views: number | null
	rating: number | null
	publishedAt: string | null
	createdAt: string | null
	author: Author | null
	tags: Tag[]
}

// Create typed hooks using createBindx with schema
export interface TestSchema {
	Article: Article
	Author: Author
	Tag: Tag
}

export const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				published: scalar(),
				status: scalar(),
				views: scalar(),
				rating: scalar(),
				publishedAt: scalar(),
				createdAt: scalar(),
				author: hasOne('Author'),
				tags: hasMany('Tag'),
			},
		},
		Author: {
			fields: {
				id: scalar(),
				name: scalar(),
				bio: scalar(),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
			},
		},
	},
})

export const { useEntity } = createBindx(schema)

// Helper to query by data-testid
export function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

export function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

export function getAllByTestId(container: Element, testId: string): Element[] {
	return Array.from(container.querySelectorAll(`[data-testid="${testId}"]`))
}

// Helper to create client-side errors for testing
export function createClientError(message: string, code?: string) {
	return { source: 'client' as const, message, code }
}

// Test data factory
export function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				published: true,
				status: 'draft',
				views: 100,
				rating: 4.5,
				publishedAt: '2024-01-15',
				createdAt: '2024-01-15T10:30:00Z',
				author: {
					id: 'author-1',
					name: 'John Doe',
					bio: 'Writer',
				},
				tags: [
					{ id: 'tag-1', name: 'JavaScript' },
					{ id: 'tag-2', name: 'React' },
				],
			},
			'article-2': {
				id: 'article-2',
				title: 'Another Article',
				published: null,
				status: 'published',
				views: null,
				rating: null,
				publishedAt: null,
				createdAt: null,
				author: null,
				tags: [],
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				bio: 'Writer',
			},
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JavaScript' },
			'tag-2': { id: 'tag-2', name: 'React' },
		},
	}
}

export function createAdapter(data = createMockData()) {
	return new MockAdapter(data, { delay: 0 })
}
