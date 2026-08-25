import { createComponent, Field } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Both-branch ternary. The compiler unions both branches; the runtime executes
// only one, so the harness asserts runtime ⊆ compiler (superset), not equality.
export const Ternary = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<div>
			{article.status === 'published'
				? <Field field={article.rating} />
				: <Field field={article.views} />}
		</div>
	))

export const cases: FixtureCase[] = [
	{ component: Ternary, prop: 'article', expect: 'superset' },
]
