import { createComponent, Field, cond } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// `.if()` condition fields are collected into the same selection as the render body.
export const Condition = createComponent()
	.entity('article', schema.Article)
	.if(({ article }) => cond.and(
		cond.isTruthy(article.published),
		cond.eq(article.status, 'active'),
	))
	.render(({ article }) => <Field field={article.title} />)

export const cases: FixtureCase[] = [
	{ component: Condition, prop: 'article' },
]
