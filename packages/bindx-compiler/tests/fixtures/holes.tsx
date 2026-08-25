import type { ReactNode } from 'react'
import { createComponent, Field, HasOne } from '@contember/bindx-react'
import { schema } from './_schema.js'
import { AuthorCard, AuthorBadge, PlainAuthor, Panel } from './_targets.js'

// Phase-2 holes: entity-derived values passed to component-typed elements. Every chain
// here is an escaping host; each maps 1:1 to a case in holes.test.ts by source order.

const handler = (): void => {}
const someVar = 'runtime-only'

// 0. createComponent target — hole author = article.author
export const ToCreateComponent = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <AuthorCard author={article.author} />)

// 1. withCollector target
export const ToWithCollector = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <AuthorBadge author={article.author} />)

// 2. plain component target WITH a sibling dummy <Field> (host still collects title)
export const ToPlainWithSibling = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<div>
			<Field field={article.title} />
			<PlainAuthor author={article.author} />
		</div>
	))

// 3. plain component target WITHOUT a sibling field
export const ToPlainNoSibling = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <PlainAuthor author={article.author} />)

// 4. multiple entity props on one element → merged into ONE hole
export const MultipleEntityProps = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <Panel primary={article.author} secondary={article} />)

// 5. entity-derived value through a HasOne callback root → source article, path [author]
export const DerivedPathViaCallback = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<HasOne field={article.author}>
			{author => <PlainAuthor author={author} />}
		</HasOne>
	))

// 6. literal + module-scope extra props (literals kept; module-scope identifiers `cb`/`dyn`
//    lifted into extraProps so the real values reach the target — phase 2.1)
export const LiteralAndNonLiteralProps = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<Panel author={article.author} label="hi" count={5} obj={{ a: 1 }} cb={handler} dyn={someVar} />
	))

// 7. target defined LATER in the module (thunk dodges TDZ)
export const ToLaterDefined = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <LaterPanel author={article.author} />)

const LaterPanel = (props: { author: unknown }): ReactNode => <span>{String(props.author)}</span>
