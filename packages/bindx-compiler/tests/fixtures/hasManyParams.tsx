import { createComponent, Field, HasMany } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Has-many with literal params. The runtime collector drops params in the implicit
// path (verified against the oracle), so field-tree equality holds; params are
// asserted separately in analyzer.test.ts.
export const HasManyParams = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<HasMany field={article.tags} limit={5} offset={2} orderBy={{ name: 'asc' }} totalCount>
			{tag => (
				<div>
					<Field field={tag.name} />
					<Field field={tag.color} />
				</div>
			)}
		</HasMany>
	))

export const cases: FixtureCase[] = [
	{ component: HasManyParams, prop: 'article' },
]
