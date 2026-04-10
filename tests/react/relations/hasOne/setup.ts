/**
 * Shared setup for hasOne relation tests
 */
import {
	defineSchema,
	entityDef,
	scalar,
	hasOne,
} from '@contember/bindx-react'

// Re-export helpers
export { getByTestId, queryByTestId } from '../../../shared/helpers'

// HasOne-specific types
export interface Author {
	id: string
	name: string
	email: string
}

export interface Article {
	id: string
	title: string
	author: Author | null
}

export interface TestSchema {
	Article: Article
	Author: Author
}

export const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				author: hasOne('Author', { nullable: true }),
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

export const entityDefs = {
	Article: entityDef<Article>('Article'),
	Author: entityDef<Author>('Author'),
} as const

// Test data factory
export function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				author: {
					id: 'author-1',
					name: 'John Doe',
					email: 'john@example.com',
				},
			},
			'article-no-author': {
				id: 'article-no-author',
				title: 'No Author Article',
				author: null,
			},
		},
		Author: {
			'author-1': {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
			},
			'author-2': {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
			},
		},
	}
}
