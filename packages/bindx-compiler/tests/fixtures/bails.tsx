import type { ReactNode } from 'react'
import { createComponent, Field, HasMany, type EntityRef } from '@contember/bindx-react'
import type { FixtureCase } from '../fixtureTypes.js'
import { schema, type Article } from './_schema.js'

// One chain per bail trigger, in source order (the harness maps cases[] by order).

// 1. INTERFACES_MODE
export const BailInterfaces = createComponent()
	.interfaces<{ item: { name: string } }>()
	.render(({ item }) => <span>{item.fields.name.value}</span>)

// 2. EXPLICIT_RENDER_FN — render arg is not an inline function literal
const renderArticle = ({ article }: { article: EntityRef<Article> }): ReactNode =>
	<Field field={article.title} />
export const BailExplicitFn = createComponent()
	.entity('article', schema.Article)
	.render(renderArticle)

// 3. DYNAMIC_ENTITY_NAME — entity name is not a string literal
const propName = 'article'
export const BailDynamicName = createComponent()
	.entity(propName, schema.Article)
	.render(({ article }) => <Field field={article.title} />)

// 4. ENTITY_ESCAPES_TO_CALL — entity value passed to an unrecognized call
const formatAuthor = (value: unknown): string => String(value)
export const BailEntityCall = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <span>{formatAuthor(article.author)}</span>)

// 5. ENTITY_ESCAPES_TO_COMPONENT — entity value to a non-children prop of an unknown component
const Unknown = (props: { data: unknown }): ReactNode => <span>{String(props.data)}</span>
export const BailEntityComponent = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <Unknown data={article.author} />)

// 6. ENTITY_SPREAD — spread of an entity root
export const BailSpread = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <div {...article} />)

// 7. COMPUTED_MEMBER — computed member access off a root
const key: string = 'title'
export const BailComputedMember = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => <Field field={article[key]} />)

// 8. NON_LITERAL_HASMANY_PARAM — a HasMany param that is not a static literal
const dynamicLimit = 3
export const BailNonLiteralParam = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => (
		<HasMany field={article.tags} limit={dynamicLimit}>
			{tag => <Field field={tag.name} />}
		</HasMany>
	))

// 9. ENTITY_REASSIGNMENT — entity-rooted binding is not const
export const BailReassignment = createComponent()
	.entity('article', schema.Article)
	.render(({ article }) => {
		let author = article.author
		author = article.author
		return <Field field={author.name} />
	})

export const cases: FixtureCase[] = [
	{ expect: 'bail', code: 'INTERFACES_MODE' },
	{ expect: 'bail', code: 'EXPLICIT_RENDER_FN' },
	{ expect: 'bail', code: 'DYNAMIC_ENTITY_NAME' },
	{ expect: 'bail', code: 'ENTITY_ESCAPES_TO_CALL' },
	{ expect: 'bail', code: 'ENTITY_ESCAPES_TO_COMPONENT' },
	{ expect: 'bail', code: 'ENTITY_SPREAD' },
	{ expect: 'bail', code: 'COMPUTED_MEMBER' },
	{ expect: 'bail', code: 'NON_LITERAL_HASMANY_PARAM' },
	{ expect: 'bail', code: 'ENTITY_REASSIGNMENT' },
]
