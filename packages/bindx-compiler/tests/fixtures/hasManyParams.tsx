import { createComponent, Field, HasMany } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Has-many with literal params. The runtime collector selects it under a params alias,
// which a static field map cannot hold, so the chain bails to the runtime pass.
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
	{ expect: 'bail', code: 'HASMANY_PARAMS' },
]
