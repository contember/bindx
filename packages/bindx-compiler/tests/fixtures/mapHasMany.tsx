import { createComponent, Field } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// `.map()` over a has-many children callback (no <HasMany> component).
export const MapHasMany = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<ul>
			{article.tags.map(tag => (
				<li key={tag.id}>
					<Field field={tag.name} />
				</li>
			))}
		</ul>
	))

export const cases: FixtureCase[] = [
	{ component: MapHasMany, prop: 'article' },
]
