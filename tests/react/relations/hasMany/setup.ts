/**
 * Shared setup for hasMany relation tests
 */
import {
	defineSchema,
	entityDef,
	scalar,
	hasMany,
} from '@contember/bindx-react'

// Re-export helpers
export { getByTestId, queryByTestId } from '../../../shared/helpers'

// HasMany-specific types
export interface Tag {
	id: string
	name: string
	color: string
}

export interface Article {
	id: string
	title: string
	tags: Tag[]
}

export interface TestSchema {
	Article: Article
	Tag: Tag
}

export const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				title: scalar(),
				tags: hasMany('Tag'),
			},
		},
		Tag: {
			fields: {
				id: scalar(),
				name: scalar(),
				color: scalar(),
			},
		},
	},
})

export const entityDefs = {
	Article: entityDef<Article>('Article'),
	Tag: entityDef<Tag>('Tag'),
} as const

// Test data factory - Article with 2 tags
export function createMockData() {
	return {
		Article: {
			'article-1': {
				id: 'article-1',
				title: 'Test Article',
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
					{ id: 'tag-2', name: 'React', color: '#61dafb' },
				],
			},
			'article-empty': {
				id: 'article-empty',
				title: 'Empty Article',
				tags: [],
			},
			'article-single': {
				id: 'article-single',
				title: 'Single Tag Article',
				tags: [
					{ id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
				],
			},
		},
		Tag: {
			'tag-1': { id: 'tag-1', name: 'JavaScript', color: '#f7df1e' },
			'tag-2': { id: 'tag-2', name: 'React', color: '#61dafb' },
			'tag-3': { id: 'tag-3', name: 'TypeScript', color: '#3178c6' },
			'tag-4': { id: 'tag-4', name: 'Vue', color: '#42b883' },
		},
	}
}

// Reusable test component props
export interface TestComponentProps {
	articleId: string
}
