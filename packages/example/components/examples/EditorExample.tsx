import type { ReactNode } from 'react'
import { useEntity, Entity, Field } from '@contember/bindx-react'
import { schema } from '../../generated/index.js'
import {
	RichTextEditor,
	BlockEditor,
	Editable,
	EditorMarkTrigger,
	EditorElementTrigger,
	withBold,
	boldMark,
	withItalic,
	italicMark,
	withUnderline,
	underlineMark,
	withCode,
	codeMark,
	withStrikeThrough,
	strikeThroughMark,
	withHighlight,
	highlightMark,
	withParagraphs,
	withNewline,
	withHeadings,
	headingElementType,
	withLists,
	orderedListElementType,
	unorderedListElementType,
	withHorizontalRules,
	horizontalRuleElementType,
	withAnchors,
	withPaste,
	type BlockDefinitions,
	type SerializableEditorNode,
} from '@contember/bindx-editor'
import type { RenderElementProps } from 'slate-react'
import type { ContentReference } from '../../generated/entities.js'
import type { FieldRefBase } from '@contember/bindx'
import type { ParagraphElement, HorizontalRuleElement, AnchorElement, ListItemElement, OrderedListElement, UnorderedListElement } from '@contember/bindx-editor'
import type { HeadingElement } from '@contember/bindx-editor'

const ParagraphRenderer = (props: RenderElementProps & { element: ParagraphElement }): ReactNode => (
	<p {...props.attributes}>{props.children}</p>
)

const HeadingRenderer = (props: RenderElementProps & { element: HeadingElement }): ReactNode => {
	const Tag = `h${props.element.level ?? 2}` as 'h1' | 'h2' | 'h3'
	return <Tag {...props.attributes}>{props.children}</Tag>
}

const HorizontalRuleRenderer = (props: RenderElementProps & { element: HorizontalRuleElement }): ReactNode => (
	<div {...props.attributes} contentEditable={false}>
		<hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '16px 0' }} />
		{props.children}
	</div>
)

const AnchorRenderer = (props: RenderElementProps & { element: AnchorElement }): ReactNode => (
	<a {...props.attributes} href={(props.element as AnchorElement).href} style={{ color: '#1a73e8', textDecoration: 'underline' }}>
		{props.children}
	</a>
)

const ListItemRenderer = (props: RenderElementProps & { element: ListItemElement }): ReactNode => (
	<li {...props.attributes}>{props.children}</li>
)

const UnorderedListRenderer = (props: RenderElementProps & { element: UnorderedListElement }): ReactNode => (
	<ul {...props.attributes}>{props.children}</ul>
)

const OrderedListRenderer = (props: RenderElementProps & { element: OrderedListElement }): ReactNode => (
	<ol {...props.attributes}>{props.children}</ol>
)

const richTextPlugins = [withBold(), withItalic(), withUnderline(), withNewline()]

const blockEditorPlugins = [
	withParagraphs({ render: ParagraphRenderer }),
	withBold(),
	withItalic(),
	withUnderline(),
	withHeadings({ render: HeadingRenderer }),
]

const comprehensivePlugins = [
	withParagraphs({ render: ParagraphRenderer }),
	withBold(),
	withItalic(),
	withUnderline(),
	withCode(),
	withStrikeThrough(),
	withHighlight(),
	withHeadings({ render: HeadingRenderer }),
	withLists({ renderListItem: ListItemRenderer, renderUnorderedList: UnorderedListRenderer, renderOrderedList: OrderedListRenderer }),
	withHorizontalRules({ render: HorizontalRuleRenderer }),
	withAnchors({ render: AnchorRenderer }),
	withNewline(),
	withPaste,
]

const variantColors: Record<string, string> = {
	info: '#e3f2fd',
	warning: '#fff3e0',
	success: '#e8f5e9',
	error: '#fce4ec',
}

function extractYoutubeId(url: string | null): string {
	if (!url) return ''
	const match = url.match(/(?:youtu\.be\/|v=)([^&]+)/)
	return match?.[1] ?? ''
}

const simpleBlocks: BlockDefinitions<ContentReference> = {
	image: {
		isVoid: true,
		render: (props, ref) => (
			<div {...props.attributes} contentEditable={false} style={{ padding: '8px', background: '#f5f5f5', borderRadius: '4px', margin: '8px 0' }}>
				<img
					src={ref?.imageUrl?.value ?? 'https://via.placeholder.com/400x200'}
					alt={ref?.caption?.value ?? ''}
					style={{ maxWidth: '100%', borderRadius: '4px' }}
				/>
				<p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
					{ref?.caption?.value ?? 'No caption'}
				</p>
				{props.children}
			</div>
		),
		staticRender: ref => (
			<><Field field={ref.imageUrl} /><Field field={ref.caption} /></>
		),
	},
}

const blocks: BlockDefinitions<ContentReference> = {
	image: {
		isVoid: true,
		render: (props, ref) => (
			<div {...props.attributes} contentEditable={false} style={{ padding: '12px', background: '#f5f5f5', borderRadius: '8px', margin: '8px 0' }}>
				<Field field={ref.imageUrl}>
					{url => <img src={url.value ?? 'https://via.placeholder.com/400x200'} alt="" style={{ maxWidth: '100%', borderRadius: '4px' }} />}
				</Field>
				<Field field={ref.caption}>
					{caption => <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{caption.value ?? 'No caption'}</p>}
				</Field>
				{props.children}
			</div>
		),
		staticRender: ref => (
			<><Field field={ref.imageUrl} /><Field field={ref.caption} /></>
		),
	},
	quote: {
		isVoid: true,
		render: (props, ref) => (
			<blockquote {...props.attributes} contentEditable={false} style={{ borderLeft: '4px solid #ccc', padding: '8px 16px', margin: '8px 0', fontStyle: 'italic', background: '#fafafa' }}>
				<Field field={ref.quoteText}>
					{text => <p><em>{text.value}</em></p>}
				</Field>
				<Field field={ref.quoteAuthor}>
					{author => <footer style={{ fontSize: '12px', color: '#666' }}>— {author.value}</footer>}
				</Field>
				{props.children}
			</blockquote>
		),
		staticRender: ref => (
			<><Field field={ref.quoteText} /><Field field={ref.quoteAuthor} /></>
		),
	},
	embed: {
		isVoid: true,
		render: (props, ref) => (
			<div {...props.attributes} contentEditable={false} style={{ padding: '12px', background: '#f0f0f0', borderRadius: '8px', margin: '8px 0' }}>
				<Field field={ref.embedUrl}>
					{url => (
						<Field field={ref.embedType}>
							{type =>
								type.value === 'youtube'
									? <iframe src={`https://youtube.com/embed/${extractYoutubeId(url.value)}`} style={{ width: '100%', height: '315px', border: 'none', borderRadius: '4px' }} title="YouTube video" />
									: <a href={url.value ?? ''} target="_blank" rel="noopener noreferrer" style={{ color: '#1a73e8' }}>{url.value}</a>
							}
						</Field>
					)}
				</Field>
				{props.children}
			</div>
		),
		staticRender: ref => (
			<><Field field={ref.embedUrl} /><Field field={ref.embedType} /></>
		),
	},
	callout: {
		isVoid: true,
		render: (props, ref) => (
			<div {...props.attributes} contentEditable={false} style={{ margin: '8px 0' }}>
				<Field field={ref.calloutVariant}>
					{variant => (
						<div style={{ background: variantColors[variant.value ?? 'info'], padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}>
							<Field field={ref.calloutText}>
								{text => <p style={{ margin: 0 }}>{text.value}</p>}
							</Field>
						</div>
					)}
				</Field>
				{props.children}
			</div>
		),
		staticRender: ref => (
			<><Field field={ref.calloutText} /><Field field={ref.calloutVariant} /></>
		),
	},
}

/**
 * Rich Text Editor example — inline editing with formatting toolbar
 */
export function RichTextEditorExample({ id }: { id: string }): ReactNode {
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e.id().title().content(),
	)

	if (article.isLoading) return <div>Loading...</div>
	if (article.isError) return <div>Error: {article.error.message}</div>

	return (
		<div className="editor-example" data-testid="rich-text-editor">
			<h3>{article.fields.title.value}</h3>

			<RichTextEditor field={article.fields.content} plugins={richTextPlugins}>
				{editor => (
					<div>
						<div className="editor-toolbar">
							<EditorMarkTrigger mark={boldMark}>
								<button type="button" data-testid="rte-bold-button"><strong>B</strong></button>
							</EditorMarkTrigger>
							<EditorMarkTrigger mark={italicMark}>
								<button type="button" data-testid="rte-italic-button"><em>I</em></button>
							</EditorMarkTrigger>
							<EditorMarkTrigger mark={underlineMark}>
								<button type="button" data-testid="rte-underline-button"><u>U</u></button>
							</EditorMarkTrigger>
						</div>
						<div className="editor-content" data-testid="rte-content">
							<Editable
								renderElement={editor.renderElement}
								renderLeaf={editor.renderLeaf}
								onKeyDown={editor.onKeyDown}
								placeholder="Type some rich text..."
							/>
						</div>
					</div>
				)}
			</RichTextEditor>

			{article.fields.content.isDirty && (
				<p style={{ color: 'orange', fontSize: '12px' }} data-testid="rte-dirty-notice">Content has been modified</p>
			)}
		</div>
	)
}

/**
 * Block Editor example — comprehensive block editor with all block types using Entity JSX pattern.
 * Selection is auto-collected from JSX: BlockEditor.getSelection calls each block's staticRender
 * with a collector proxy, discovering all referenced fields automatically.
 */
export function BlockEditorExample({ id }: { id: string }): ReactNode {
	return (
		<Entity entity={schema.Article} by={{ id }} loading={<div>Loading...</div>}>
			{article => (
				<div className="editor-example" data-testid="block-editor">
					<h3><Field field={article.title} /></h3>

					<BlockEditor
						field={article.richContent as unknown as FieldRefBase<SerializableEditorNode | null>}
						references={article.contentReferences}
						discriminationField="type"
						blocks={blocks}
						plugins={comprehensivePlugins}
					>
						{editor => (
							<div>
								<div className="editor-toolbar" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
									{/* Mark triggers */}
									<EditorMarkTrigger mark={boldMark}>
										<button type="button" data-testid="block-bold-button"><strong>B</strong></button>
									</EditorMarkTrigger>
									<EditorMarkTrigger mark={italicMark}>
										<button type="button" data-testid="block-italic-button"><em>I</em></button>
									</EditorMarkTrigger>
									<EditorMarkTrigger mark={underlineMark}>
										<button type="button"><u>U</u></button>
									</EditorMarkTrigger>
									<EditorMarkTrigger mark={codeMark}>
										<button type="button" style={{ fontFamily: 'monospace' }}>{'<>'}</button>
									</EditorMarkTrigger>
									<EditorMarkTrigger mark={strikeThroughMark}>
										<button type="button"><s>S</s></button>
									</EditorMarkTrigger>
									<EditorMarkTrigger mark={highlightMark}>
										<button type="button" style={{ background: '#ffeb3b' }}>H</button>
									</EditorMarkTrigger>

									<span style={{ borderLeft: '1px solid #ccc', margin: '0 4px' }} />

									{/* Element triggers */}
									<EditorElementTrigger elementType={headingElementType} suchThat={{ level: 1 }}>
										<button type="button">H1</button>
									</EditorElementTrigger>
									<EditorElementTrigger elementType={headingElementType} suchThat={{ level: 2 }}>
										<button type="button">H2</button>
									</EditorElementTrigger>
									<EditorElementTrigger elementType={headingElementType} suchThat={{ level: 3 }}>
										<button type="button">H3</button>
									</EditorElementTrigger>
									<EditorElementTrigger elementType={unorderedListElementType}>
										<button type="button">UL</button>
									</EditorElementTrigger>
									<EditorElementTrigger elementType={orderedListElementType}>
										<button type="button">OL</button>
									</EditorElementTrigger>
									<EditorElementTrigger elementType={horizontalRuleElementType}>
										<button type="button">HR</button>
									</EditorElementTrigger>

									<span style={{ borderLeft: '1px solid #ccc', margin: '0 4px' }} />

									{/* Block insert buttons */}
									<button type="button" onClick={() => editor.insertBlock?.('image')} data-testid="insert-image-button">
										+ Image
									</button>
									<button type="button" onClick={() => editor.insertBlock?.('quote')} data-testid="insert-quote-button">
										+ Quote
									</button>
									<button type="button" onClick={() => editor.insertBlock?.('embed')} data-testid="insert-embed-button">
										+ Embed
									</button>
									<button type="button" onClick={() => editor.insertBlock?.('callout')} data-testid="insert-callout-button">
										+ Callout
									</button>
								</div>
								<div className="editor-content" data-testid="block-editor-content">
									<Editable
										renderElement={editor.renderElement}
										renderLeaf={editor.renderLeaf}
										onKeyDown={editor.onKeyDown}
										placeholder="Start writing blocks..."
									/>
								</div>
							</div>
						)}
					</BlockEditor>
				</div>
			)}
		</Entity>
	)
}

/**
 * Simple Block Editor example — without references
 */
export function SimpleBlockEditorExample({ id }: { id: string }): ReactNode {
	const article = useEntity(schema.Article, { by: { id } }, e =>
		e.id().title().richContent(),
	)

	if (article.isLoading) return <div>Loading...</div>
	if (article.isError) return <div>Error: {article.error.message}</div>

	return (
		<div className="editor-example" data-testid="simple-block-editor">
			<h3>{article.fields.title.value}</h3>

			<BlockEditor
				field={article.fields.richContent as unknown as FieldRefBase<SerializableEditorNode | null>}
				plugins={blockEditorPlugins}
			>
				{editor => (
					<div>
						<div className="editor-toolbar">
							<EditorMarkTrigger mark={boldMark}>
								<button type="button"><strong>B</strong></button>
							</EditorMarkTrigger>
							<EditorMarkTrigger mark={italicMark}>
								<button type="button"><em>I</em></button>
							</EditorMarkTrigger>
						</div>
						<div className="editor-content">
							<Editable
								renderElement={editor.renderElement}
								renderLeaf={editor.renderLeaf}
								onKeyDown={editor.onKeyDown}
								placeholder="Start writing..."
							/>
						</div>
					</div>
				)}
			</BlockEditor>
		</div>
	)
}
