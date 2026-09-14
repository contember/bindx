import { createComponent, Field } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Const aliases extend the root set (both a relation alias and a field alias).
export const ConstAlias = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => {
		const author = article.author
		const heading = article.title
		return (
			<div>
				<Field field={heading} />
				<Field field={author.name} />
				<Field field={author.email} />
			</div>
		)
	})

export const cases: FixtureCase[] = [
	{ component: ConstAlias, prop: 'article' },
]
