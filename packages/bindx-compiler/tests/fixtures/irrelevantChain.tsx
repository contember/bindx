import { createComponent, Field } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema } from './_schema.js'

// .props()/.use()/.mock() present but irrelevant to selection analysis.
export const IrrelevantChain = createComponent()
	.entity('article', schema.Article)
	.props<{ className?: string }>()
	.use(() => ({ t: (key: string): string => `t:${key}` }))
	.mock({ className: 'x', t: (key: string): string => key })
	.render(({ article, className, t }) => (
		<div className={className}>
			<h2>{t('heading')}</h2>
			<Field field={article.title} />
		</div>
	))

export const cases: FixtureCase[] = [
	{ component: IrrelevantChain, prop: 'article' },
]
