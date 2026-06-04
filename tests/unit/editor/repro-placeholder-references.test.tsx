// Regression test for <issue-url — filled in after filing>
//
// BlockEditor (references mode) crashes with
//   TypeError: Cannot read properties of undefined (reading 'entityType')
// when the `references` relation is reached through a DISCONNECTED has-one
// placeholder (e.g. `<HasOne field={article.content}>` where `content` is null
// in the store).
//
// Root cause: PlaceholderHandle.createPlaceholderFieldHandle special-cases
// has-many fields and returns a bare "empty has-many" object (items/length/map/
// $state) WITHOUT the FIELD_REF_META symbol (packages/bindx/src/handles/
// PlaceholderHandle.ts, has-many branch). BlockEditorWithReferences then reads
// `fullReferences[FIELD_REF_META].entityType` unguarded (packages/bindx-editor/
// src/components/BlockEditor.tsx) and throws before the first paint.
import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Entity,
	HasOne,
	MockAdapter,
	defineSchema,
	entityDef,
	hasMany,
	hasOne,
	scalar,
} from '@contember/bindx-react'
import type { MockDataStore } from '@contember/bindx'
import { BlockEditor, Editable, withParagraphs } from '@contember/bindx-editor'
import type { BlockDefinitions } from '@contember/bindx-editor'
import type { RenderElementProps } from 'slate-react'

afterEach(() => {
	cleanup()
})

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | { readonly [K in string]?: JSONValue } | readonly JSONValue[]

interface ContentReference {
	id: string
	type: string
}

interface Content {
	id: string
	data: JSONValue | null
	references: ContentReference[]
}

interface Article {
	id: string
	content: Content | null
}

interface TestSchema {
	Article: Article
	Content: Content
	ContentReference: ContentReference
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				content: hasOne('Content', { nullable: true }),
			},
		},
		Content: {
			fields: {
				id: scalar(),
				data: scalar(),
				references: hasMany('ContentReference'),
			},
		},
		ContentReference: {
			fields: {
				id: scalar(),
				type: scalar(),
			},
		},
	},
})

const ArticleDef = entityDef<Article>('Article')

const ParagraphRenderer = (props: RenderElementProps): React.ReactNode => (
	<p {...props.attributes}>{props.children}</p>
)

const blocks: BlockDefinitions<ContentReference> = {
	quote: {
		isVoid: true,
		render: props => (
			<blockquote {...props.attributes} contentEditable={false} data-testid="quote-block">
				{props.children}
			</blockquote>
		),
	},
}

const plugins = [withParagraphs({ render: ParagraphRenderer })]

function createStore(): MockDataStore {
	return {
		// `content` is null — the article has no Content row yet, so the
		// <HasOne> below hands BlockEditor a placeholder entity.
		Article: {
			'article-1': { id: 'article-1', content: null },
		},
		Content: {},
		ContentReference: {},
	}
}

function Harness(): React.ReactNode {
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }} loading={<div data-testid="loading">Loading</div>}>
			{article => (
				<HasOne field={article.content}>
					{content => (
						<div data-testid="editor-root">
							<BlockEditor
								field={content.data}
								references={content.references}
								discriminationField="type"
								blocks={blocks}
								plugins={plugins}
							>
								{editor => <Editable renderElement={editor.renderElement} renderLeaf={editor.renderLeaf} />}
							</BlockEditor>
						</div>
					)}
				</HasOne>
			)}
		</Entity>
	)
}

describe('BlockEditor references mode over a disconnected has-one placeholder', () => {
	test('should render the editor when the parent of the references relation is a placeholder', async () => {
		const adapter = new MockAdapter(createStore(), { delay: 0 })
		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Harness />
			</BindxProvider>,
		)

		// Currently throws during render:
		//   TypeError: Cannot read properties of undefined (reading 'entityType')
		// at BlockEditorWithReferences — fullReferences[FIELD_REF_META] is
		// undefined because the placeholder's has-many handle carries no meta.
		await waitFor(() => {
			expect(document.querySelector('[data-testid="editor-root"]')).not.toBeNull()
		})
	})
})
