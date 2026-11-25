import './setup'
// An uploader fed a relation ref reached through a has-one (`article.author.avatar`,
// `article.author.photos`) must select its fields under that relation of `author`,
// not as a stray relation of the root entity.
import { describe, expect, test } from 'bun:test'
import React, { type ReactNode } from 'react'
import { collectSelection, createCollectorProxy, defineSchema, hasMany, hasOne, mergeSelections, scalar, type EntityAccessor } from '@contember/bindx-react'
import { SchemaRegistry, SelectionScope, buildQueryFromSelection, type QuerySpec } from '@contember/bindx'
import { MultiUploader, Uploader, createImageFileType } from '../src/index.js'

interface Image {
	id: string
	url: string
}

interface Author {
	id: string
	avatar: Image | null
	photos: Image[]
}

interface Article {
	id: string
	author: Author | null
}

interface TestSchema {
	Article: Article
	Author: Author
	Image: Image
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: { fields: { id: scalar(), author: hasOne('Author', { nullable: true }) } },
		Author: { fields: { id: scalar(), avatar: hasOne('Image', { nullable: true }), photos: hasMany('Image') } },
		Image: { fields: { id: scalar(), url: scalar() } },
	},
})

const imageFileType = createImageFileType<Image>({ urlField: 'url' })

/** Collects a root Article selection the way `<Entity>` does: collector proxy plus JSX analysis. */
function collectArticleQuery(renderArticle: (article: EntityAccessor<Article>) => ReactNode): QuerySpec {
	const scope = new SelectionScope()
	const article = createCollectorProxy<Article>(scope, 'Article', new SchemaRegistry(schema))
	const jsxSelection = collectSelection(renderArticle(article))
	const selection = scope.toSelectionMeta()
	mergeSelections(selection, jsxSelection)
	return buildQueryFromSelection(selection)
}

function fieldNames(spec: QuerySpec | undefined): string[] {
	return (spec?.fields ?? []).map(field => field.name).sort()
}

function nestedSpec(spec: QuerySpec | undefined, name: string): QuerySpec | undefined {
	return spec?.fields.find(field => field.name === name)?.nested
}

describe('an uploader fed a nested relation ref', () => {
	test('<Uploader entity={article.author.avatar}> selects avatar under author', () => {
		const query = collectArticleQuery(article => (
			<Uploader entity={article.author.avatar} fileType={imageFileType}>{null}</Uploader>
		))
		expect(fieldNames(query)).toEqual(['author', 'id'])
		const author = nestedSpec(query, 'author')
		expect(fieldNames(author)).toEqual(['avatar', 'id'])
		expect(fieldNames(nestedSpec(author, 'avatar'))).toEqual(['id', 'url'])
	})

	test('<MultiUploader field={article.author.photos}> selects photos under author', () => {
		const query = collectArticleQuery(article => (
			<MultiUploader field={article.author.photos} fileType={imageFileType}>{null}</MultiUploader>
		))
		expect(fieldNames(query)).toEqual(['author', 'id'])
		const author = nestedSpec(query, 'author')
		expect(fieldNames(author)).toEqual(['id', 'photos'])
		const photos = author?.fields.find(field => field.name === 'photos')
		expect(photos?.isArray).toBe(true)
		expect(fieldNames(photos?.nested)).toEqual(['id', 'url'])
	})
})
