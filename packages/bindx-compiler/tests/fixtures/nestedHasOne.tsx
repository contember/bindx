import { createComponent, Field, HasOne } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Nested has-one via <HasOne> callback root and via direct member chain.
export const NestedHasOne = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<div>
			<Field field={article.title} />
			<HasOne field={article.author}>
				{author => (
					<div>
						<Field field={author.name} />
						<Field field={author.email} />
					</div>
				)}
			</HasOne>
			<Field field={article.author.name} />
		</div>
	))

export const cases: FixtureCase[] = [
	{ component: NestedHasOne, prop: 'article' },
]
