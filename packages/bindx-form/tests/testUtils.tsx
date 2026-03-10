import '../../../tests/setup'
import { MockAdapter, useEntity } from '@contember/bindx-react'

// Re-export shared utilities
export {
	getByTestId,
	queryByTestId,
	getAllByTestId,
	createClientError,
} from '../../../tests/shared/helpers'

export { useEntity }

export {
	testSchema as schema,
	schema as entityDefs,
	type Article,
	type Author,
	type Tag,
	type TestSchema,
} from '../../../tests/shared/schema'

// Form-specific mock data factory (simplified for form tests)
export function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				content: 'Test content',
				published: true,
				status: 'draft',
				views: 100,
				rating: 4.5,
				publishedAt: '2024-01-15',
				createdAt: '2024-01-15T10:30:00Z',
				author: {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
					bio: 'Writer',
				},
				location: null,
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
					{ id: 'tag-2', name: 'React', color: '#61dafb' },
				],
			},
			'article-2': {
				id: 'article-2',
				title: 'Another Article',
				content: 'More content',
				published: null,
				status: 'published',
				views: null,
				rating: null,
				publishedAt: null,
				createdAt: null,
				author: null,
				location: null,
				tags: [],
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
				bio: 'Writer',
			},
		},
		Location: {},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
			'tag-2': { id: 'tag-2', name: 'React', color: '#61dafb' },
		},
	}
}

export function createAdapter(data = createMockData()) {
	return new MockAdapter(data, { delay: 0 })
}
