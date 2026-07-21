import type { ReactNode } from 'react'
import { createComponent, Field, HasOne, withCollector, type EntityRef } from '@contember/bindx-react'
import { schema, type Author } from './_schema.js'

// Phase-2.1 closure lifting: an inline render-prop child of a HOLE element that captures nothing
// from render scope (only its own params + module bindings) is LIFTED verbatim into the hole's
// extraProps — the target's staticRender replays it with a collector proxy, so collection proceeds
// and stays oracle-equal. A child that captures a render-scope value (a `.use()` output, an entity
// root) cannot be reproduced at the module emit site → it BAILS (FUNCTION_PROP_ON_HOLE, runtime
// fallback). See docs/compiler-plan.md (Phase 2.1).

interface SelectFieldProps {
	field: EntityRef<Author>
	children: (entity: EntityRef<Author>) => ReactNode
}

// Mirrors npi's SelectField: a withCollector primitive whose staticRender reaches the field
// ONLY through the render-prop child (it INVOKES it with a collector proxy).
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

// LIFTED — the render-prop child uses only its OWN param `it` + module scope (no render capture),
// so it is emitted verbatim into the hole's extraProps. SelectField.staticRender replays it with a
// collector proxy → author.name is collected. The chain COMPILES and is ORACLE-EQUAL end-to-end.
export const LiftedRenderProp = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<SelectField field={article.author}>
			{it => <Field field={it.name} />}
		</SelectField>
	))

// BAILS — the render-prop child captures `t` (a `.use()` value) from render scope, which cannot be
// reproduced at the module-scope emit site. Default deny → FUNCTION_PROP_ON_HOLE (runtime fallback).
export const CapturingRenderProp = createComponent()
	.entity('article', schema.Article)
	.use(() => ({ t: (): string => 'x' }))
	.render(({ article, t }) => (
		<SelectField field={article.author}>
			{it => <Field field={it.name} format={() => t()} />}
		</SelectField>
	))

// SAFE (drop) — the hole's extra function props take no params and capture no entity roots, so
// invoking them at collection time cannot reach a selection scope. The chain still COMPILES with
// the hole, which resolves author.name through AuthorSummary's own staticRender.
export const SafeHoleClosures = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<AuthorSummary
			author={article.author}
			onClick={() => sideEffect()}
			format={() => null}
		/>
	))
