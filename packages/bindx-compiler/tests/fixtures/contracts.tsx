import type { ReactNode } from 'react'
import { createComponent, Field, itemOf, withCollector, type EntityRef, type HasManyRef } from '@contember/bindx-react'
import { schema, type Tag } from './_schema.js'
import { ItemRepeater, EntityEditor } from './_contractTargets.js'

// Contract hosts (Phase 2.2). Each chain maps 1:1 to a case in contracts.test.ts by source
// order; every chain uses the `article` implicit prop. Contract components form NO hole —
// their callback is analyzed like a <HasMany>/<HasOne> child.

interface LocalRepeaterProps {
	field: HasManyRef<Tag>
	onSelect?: () => void
	children?: (item: EntityRef<Tag>) => ReactNode
}

// Same-file contract target — discovered via a top-level `withCollector(_, contract)` declaration.
const LocalRepeater = withCollector(
	function LocalRepeaterRuntime(_props: LocalRepeaterProps): ReactNode { return null },
	{ children: itemOf('field') },
)

// Contract-shaped but UNPARSEABLE (spread in the object literal) → discovery yields no contract,
// so the element falls back to hole/bail rules (the render-prop child captures a host root → bail).
const spreadBase = {}
const BrokenRepeater = withCollector(
	function BrokenRepeaterRuntime(_props: LocalRepeaterProps): ReactNode { return null },
	{ ...spreadBase, children: itemOf('field') },
)

// 0. same-file contract target
export const SameFile = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<LocalRepeater field={article.tags}>
			{tag => <Field field={tag.name} />}
		</LocalRepeater>
	))

// 1. cross-file contract target (imported from ./_contractTargets)
export const CrossFile = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<ItemRepeater field={article.tags}>
			{tag => <Field field={tag.name} />}
		</ItemRepeater>
	))

// 2. footer-editor replica — item callback uses its param AND captures a host-root field. STRICT.
export const HostCapture = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<ItemRepeater field={article.tags}>
			{tag => (
				<>
					<Field field={tag.name} />
					<Field field={article.title} />
				</>
			)}
		</ItemRepeater>
	))

// 3. entityOf variant
export const EntityOf = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<EntityEditor entity={article.author}>
			{author => <Field field={author.name} />}
		</EntityEditor>
	))

// 4. non-contract function prop on a contract element → dropped, no safety bail
export const DroppedFnProp = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<LocalRepeater field={article.tags} onSelect={() => console.log('x')}>
			{tag => <Field field={tag.name} />}
		</LocalRepeater>
	))

// 5. contract entry with a missing callback → relation only
export const MissingCallback = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <ItemRepeater field={article.tags} />)

// 6. negative — unparseable contract falls back to hole rules; host-root capture in the child → bail
export const Unparseable = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<BrokenRepeater field={article.tags}>
			{tag => (
				<>
					<Field field={tag.name} />
					<Field field={article.title} />
				</>
			)}
		</BrokenRepeater>
	))
