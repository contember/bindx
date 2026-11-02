// A compiled <Entity> root must keep what a hole target's getSelection RETURNS, like the runtime
// root walk does (mergeSelections of the analyzed JSX); a createComponent host drops it, like its proxy pass.
import '../../setup'
import { describe, test, expect } from 'bun:test'
import { createComponent, Field, type SelectionFieldMeta, type SelectionMeta } from '@contember/bindx-react'
import { resolveCompiledRootSelection } from '../../../packages/bindx-react/src/jsx/compiledSelection.js'
import { schema } from '../../shared'

function ReturningTarget(): null {
	return null
}
ReturningTarget.getSelection = (): SelectionFieldMeta => ({
	fieldName: 'author',
	alias: 'author',
	path: ['author'],
	isArray: false,
	isRelation: true,
	nested: {
		fields: new Map([['email', { fieldName: 'email', alias: 'email', path: ['email'], isArray: false, isRelation: false }]]),
	},
})

function fieldNamesOf(meta: SelectionMeta | undefined): string[] {
	return meta ? [...meta.fields.values()].map(field => field.fieldName).sort() : []
}

describe('returned hole selections', () => {
	test('an <Entity> root merges a returned selection', () => {
		const selection = resolveCompiledRootSelection({
			compiled: {
				v: 2,
				props: { entity: { title: true } },
				holes: [{ component: () => ReturningTarget, entityProps: { entity: { source: 'entity', path: ['author'] } } }],
			},
			entityType: 'Article',
			schemaRegistry: null,
			validateMode: false,
		})
		expect(fieldNamesOf(selection)).toEqual(['author', 'title'])
		expect(fieldNamesOf(selection.fields.get('author')?.nested)).toContain('email')
	})

	test('a createComponent host drops it, as its proxy pass does', () => {
		const Host = createComponent()
			.entity('article', schema.Article)
			.render(() => null, {
				v: 2,
				props: { article: { title: true } },
				holes: [{ component: () => ReturningTarget, entityProps: { entity: { source: 'article', path: ['author'] } } }],
			})
		void Host.$article
		const nested = Host.$article?.__meta.fields.get('author')?.nested
		expect(fieldNamesOf(nested)).not.toContain('email')
	})

	test('a literal on an interfaces-mode component is ignored', () => {
		const Comp = createComponent()
			.entity('article', schema.Article)
			.interfaces<{ other: { name: string } }>()
			.render(({ article, other }) => <span><Field field={article.title} /><Field field={other.name} /></span>, {
				v: 2,
				props: { article: { title: true } },
			})
		expect(Reflect.get(Comp, '$other')).toBeDefined()
	})
})
