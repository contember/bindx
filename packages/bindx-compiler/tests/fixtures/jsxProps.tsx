import type { ReactNode } from 'react'
import { createComponent, Field, withCollector } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// Item 5: a JSX-element / fragment prop value (`slot={<Field .../>}`) is analyzed statically like
// children (recurse; entity refs form paths as usual) and the prop itself is not emitted. The
// oracle walks the same JSX via the target's staticRender proxies → static analysis is an
// equal-or-superset union. SlotPanel's staticRender renders `slot` as children, so both agree.

const SlotPanel = withCollector(
	(_props: { slot?: ReactNode; children?: ReactNode }): ReactNode => null,
	(props: { slot?: ReactNode; children?: ReactNode }): ReactNode => <>{props.slot}{props.children}</>,
)

export const JsxElementProp = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<SlotPanel slot={<Field field={article.title} />}>
			<Field field={article.content} />
		</SlotPanel>
	))

export const JsxFragmentProp = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<SlotPanel slot={<><Field field={article.title} /><Field field={article.content} /></>} />
	))

export const cases: FixtureCase[] = [
	{ component: JsxElementProp, prop: 'article' },
	{ component: JsxFragmentProp, prop: 'article' },
]
