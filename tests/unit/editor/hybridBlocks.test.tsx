import '../../setup'
import { afterEach, describe, expect, test } from 'bun:test'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import React from 'react'
import {
	BindxProvider,
	Entity,
	Field,
	MockAdapter,
	defineSchema,
	entityDef,
	hasMany,
	scalar,
} from '@contember/bindx-react'
import type { MockDataStore } from '@contember/bindx'
import { BlockEditor, Editable, useEditorBlockElement, withParagraphs } from '@contember/bindx-editor'
import type { BlockDefinitions } from '@contember/bindx-editor'
import type { Editor } from 'slate'
import type { RenderElementProps } from 'slate-react'

afterEach(() => {
	cleanup()
})

// Hybrid blocks: a `testimonial` block keeps its text inline on the Slate node and references an
// entity ONLY for a real relation (the avatar url); a `divider` block is fully reference-less.

interface ContentReference {
	id: string
	type: string
	avatarUrl: string | null
}

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | { readonly [K in string]?: JSONValue } | readonly JSONValue[]

interface Article {
	id: string
	richContent: JSONValue | null
	contentReferences: ContentReference[]
}

interface TestSchema {
	Article: Article
	ContentReference: ContentReference
}

const schema = defineSchema<TestSchema>({
	entities: {
		Article: {
			fields: {
				id: scalar(),
				richContent: scalar(),
				contentReferences: hasMany('ContentReference'),
			},
		},
		ContentReference: {
			fields: {
				id: scalar(),
				type: scalar(),
				avatarUrl: scalar(),
			},
		},
	},
})

const ArticleDef = entityDef<Article>('Article')

const ParagraphRenderer = (props: RenderElementProps): React.ReactNode => (
	<p {...props.attributes}>{props.children}</p>
)

// Inline data carried on the node, typed for the renders below.
type TestimonialEl = RenderElementProps['element'] & { quote?: string }
type DividerEl = RenderElementProps['element'] & { dividerStyle?: string }

const blocks: BlockDefinitions<ContentReference> = {
	// Hybrid: text inline (props.element.quote), avatar via the reference entity.
	testimonial: {
		isVoid: true,
		render: (props, ref) => {
			const el = props.element as TestimonialEl
			return (
				<figure {...props.attributes} contentEditable={false} data-testid="testimonial-block">
					<blockquote data-testid="testimonial-quote">{el.quote ?? 'NO_QUOTE'}</blockquote>
					{ref
						? <Field field={ref.avatarUrl}>{u => <img data-testid="testimonial-avatar" src={u.value ?? ''} alt="" />}</Field>
						: <span data-testid="testimonial-noref">NO_REF</span>}
					{props.children}
				</figure>
			)
		},
		// Reference is used only for the avatar relation.
		staticRender: ref => <Field field={ref.avatarUrl} />,
	},
	// Reference-less: everything inline, ref must be null.
	divider: {
		isVoid: true,
		render: (props, ref) => {
			const el = props.element as DividerEl
			return (
				<div {...props.attributes} contentEditable={false} data-testid="divider-block">
					<span data-testid="divider-style">{el.dividerStyle ?? 'NO_STYLE'}</span>
					<span data-testid="divider-ref">{ref === null ? 'REF_NULL' : 'REF_PRESENT'}</span>
					{props.children}
				</div>
			)
		},
		// no staticRender → reference-less
	},
}

const plugins = [withParagraphs({ render: ParagraphRenderer })]

function createStore(): MockDataStore {
	return {
		Article: {
			'article-1': { id: 'article-1', richContent: null, contentReferences: [] },
		},
		ContentReference: {},
	}
}

let capturedEditor: Editor | null = null

// A child that surfaces setData so we can drive it from the test.
let capturedSetData: ((patch: Record<string, unknown>) => void) | null = null
function SetDataProbe(): React.ReactNode {
	const { setData } = useEditorBlockElement()
	capturedSetData = setData as (patch: Record<string, unknown>) => void
	return null
}

function Harness(): React.ReactNode {
	capturedEditor = null
	return (
		<Entity entity={ArticleDef} by={{ id: 'article-1' }} loading={<div data-testid="loading">Loading</div>}>
			{article => (
				<div data-testid="editor-root">
					<BlockEditor
						field={article.richContent}
						references={article.contentReferences}
						discriminationField="type"
						blocks={{
							...blocks,
							testimonial: {
								...blocks.testimonial,
								render: (props, ref) => (
									<>
										<SetDataProbe />
										{blocks.testimonial.render(props, ref)}
									</>
								),
							},
						}}
						plugins={plugins}
					>
						{editor => {
							capturedEditor = editor
							return <Editable renderElement={editor.renderElement} renderLeaf={editor.renderLeaf} />
						}}
					</BlockEditor>
				</div>
			)}
		</Entity>
	)
}

describe('hybrid blocks (inline data + optional reference)', () => {
	test('insertBlock seeds inline data on the node AND initializes the reference entity', async () => {
		const adapter = new MockAdapter(createStore(), { delay: 0 })
		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Harness />
			</BindxProvider>,
		)
		await waitFor(() => expect(capturedEditor).not.toBeNull())

		act(() => {
			capturedEditor!.insertBlock!('testimonial', {
				data: { quote: 'Great course!' },
				initReference: (ref: any) => ref.avatarUrl.setValue('https://x/a.png'),
			})
		})

		const node = capturedEditor!.children.find((n: any) => n.type === 'testimonial') as any
		expect(node).toBeDefined()
		// inline data landed on the node
		expect(node.quote).toBe('Great course!')
		// reference was created and linked
		expect(typeof node.referenceId).toBe('string')

		// the rendered block shows inline quote + resolved avatar from the reference entity
		await waitFor(() => {
			expect(document.querySelector('[data-testid="testimonial-quote"]')?.textContent).toBe('Great course!')
			expect(document.querySelector('[data-testid="testimonial-avatar"]')?.getAttribute('src')).toBe('https://x/a.png')
		})
	})

	test('reference-less block creates no reference entity and no referenceId', async () => {
		const adapter = new MockAdapter(createStore(), { delay: 0 })
		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Harness />
			</BindxProvider>,
		)
		await waitFor(() => expect(capturedEditor).not.toBeNull())

		act(() => {
			capturedEditor!.insertBlock!('divider', { data: { dividerStyle: 'dashed' } })
		})

		const node = capturedEditor!.children.find((n: any) => n.type === 'divider') as any
		expect(node).toBeDefined()
		expect(node.dividerStyle).toBe('dashed')
		expect('referenceId' in node).toBe(false)

		await waitFor(() => {
			expect(document.querySelector('[data-testid="divider-style"]')?.textContent).toBe('dashed')
			expect(document.querySelector('[data-testid="divider-ref"]')?.textContent).toBe('REF_NULL')
		})
	})

	test('setData patches inline node data', async () => {
		capturedSetData = null
		const adapter = new MockAdapter(createStore(), { delay: 0 })
		render(
			<BindxProvider adapter={adapter} schema={schema}>
				<Harness />
			</BindxProvider>,
		)
		await waitFor(() => expect(capturedEditor).not.toBeNull())

		act(() => {
			capturedEditor!.insertBlock!('testimonial', { data: { quote: 'before' } })
		})
		await waitFor(() => expect(capturedSetData).not.toBeNull())

		act(() => {
			capturedSetData!({ quote: 'after' })
		})

		const node = capturedEditor!.children.find((n: any) => n.type === 'testimonial') as any
		expect(node.quote).toBe('after')
		await waitFor(() => {
			expect(document.querySelector('[data-testid="testimonial-quote"]')?.textContent).toBe('after')
		})
	})
})
