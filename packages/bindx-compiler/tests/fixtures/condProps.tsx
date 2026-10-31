import { createComponent, Field, Switch, Case, Default, cond } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Item 4: `cond.*` DSL in a JSX prop position (`<Case if={cond.eq(article.status, 'x')}>`).
// The only selection a condition carries is the FieldRefs in its args (verified against
// Case.getSelection), so those are recorded as touched leaves and the prop itself is dropped.
// Oracle (Switch/Case/Default getSelection) collects exactly the same → strict equality.

export const CondInProps = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<Switch>
			<Case if={cond.eq(article.status, 'draft')}>
				<Field field={article.title} />
			</Case>
			<Default>
				<Field field={article.content} />
			</Default>
		</Switch>
	))

// Nested combinators — every FieldRef arg (status, rating) is recorded.
export const CondCombinators = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<Switch>
			<Case if={cond.or(cond.eq(article.status, 'a'), cond.isNotNull(article.rating))}>
				<Field field={article.title} />
			</Case>
			<Default>{null}</Default>
		</Switch>
	))

export const cases: FixtureCase[] = [
	{ component: CondInProps, prop: 'article' },
	{ component: CondCombinators, prop: 'article' },
]
