import { createComponent, Field, Show } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Scalar leaves via <Field>, direct render access, and <Show>.
export const Scalars = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<div>
			<Field field={article.title} />
			<Field field={article.content} />
			<Show field={article.published}>
				<Field field={article.status} />
			</Show>
		</div>
	))

export const cases: FixtureCase[] = [
	{ component: Scalars, prop: 'article' },
]
