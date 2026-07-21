import type { ReactNode } from 'react'
import { createComponent, Field, HasOne, withCollector, type EntityRef } from '@contember/bindx-react'
import { schema, type Author } from './_schema.js'

// Phase-2 under-fetch guard: function props / render-prop children of a HOLE element are
// dropped from the emitted hole, but the target's staticRender may INVOKE them with a
// collector proxy during collection. See docs/compiler-plan.md (FUNCTION_PROP_ON_HOLE).

interface SelectFieldProps {
	field: EntityRef<Author>
	children: (entity: EntityRef<Author>) => ReactNode
}

// Mirrors npi's SelectField: a withCollector primitive whose staticRender reaches the field
// ONLY through the render-prop child. Dropping that child under-fetches unless the chain bails.
export const SelectField = withCollector(
	(_props: SelectFieldProps): ReactNode => null,
	(props: SelectFieldProps): ReactNode => (
		<HasOne field={props.field}>
			{entity => props.children(entity)}
		</HasOne>
	),
)

interface AuthorSummaryProps {
	author: EntityRef<Author>
	onClick?: () => void
	format?: () => ReactNode
}

// Reads the field in its OWN staticRender, independent of children — so dropping the safe
// extra function props (below) loses nothing.
export const AuthorSummary = withCollector(
	(props: AuthorSummaryProps): ReactNode => <Field field={props.author.name} />,
	(props: AuthorSummaryProps): ReactNode => <Field field={props.author.name} />,
)

const sideEffect = (): void => {}

// UNSAFE — the render-prop child reads a field off its OWN param. The hole drops it, yet
// SelectField.staticRender invokes it with a collector proxy → compiled would under-fetch.
// The chain BAILS with FUNCTION_PROP_ON_HOLE.
export const UnsafeRenderProp = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<SelectField field={article.author}>
			{it => <Field field={it.name} />}
		</SelectField>
	))

// SAFE — the hole's extra function props take no params and capture no entity roots, so
// invoking them at collection time cannot reach a selection scope. The chain still COMPILES
// with the hole, which resolves author.name through AuthorSummary's own staticRender.
export const SafeHoleClosures = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<AuthorSummary
			author={article.author}
			onClick={() => sideEffect()}
			format={() => null}
		/>
	))
