import type { ReactNode } from 'react'
import { useEntity } from '../../generated/index.js'
import {
	RichTextEditor,
	BlockEditor,
	Editable,
	EditorMarkTrigger,
	withBold,
	boldMark,
	withItalic,
	italicMark,
	withUnderline,
	underlineMark,
	withParagraphs,
	withNewline,
	withHeadings,
	type BlockDefinitions,
	type SerializableEditorNode,
} from '@contember/bindx-editor'
import type { RenderElementProps } from 'slate-react'
import type { ContentReference } from '../../generated/entities.js'
import type { FieldRefBase } from '@contember/bindx'
import type { ParagraphElement } from '@contember/bindx-editor'
import type { HeadingElement } from '@contember/bindx-editor'

const ParagraphRenderer = (props: RenderElementProps & { element: ParagraphElement }): ReactNode => (
	<p {...props.attributes}>{props.children}</p>
)

const HeadingRenderer = (props: RenderElementProps & { element: HeadingElement }): ReactNode => {
	const Tag = `h${props.element.level ?? 2}` as 'h1' | 'h2' | 'h3'
	return <Tag {...props.attributes}>{props.children}</Tag>
}

const richTextPlugins = [withBold(), withItalic(), withUnderline(), withNewline()]

const blockEditorPlugins = [
	withParagraphs({ render: ParagraphRenderer }),
	withBold(),
	withItalic(),
	withUnderline(),
	withHeadings({ render: HeadingRenderer }),
]

const blocks: BlockDefinitions<ContentReference> = {
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
	},
}

/**
 * Rich Text Editor example — inline editing with formatting toolbar
 */
export function RichTextEditorExample({ id }: { id: string }): ReactNode {
	const article = useEntity('Article', { by: { id } }, e =>
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
 * Block Editor example — structured content with embedded references
 */
export function BlockEditorExample({ id }: { id: string }): ReactNode {
	const article = useEntity('Article', { by: { id } }, e =>
		e
			.id()
			.title()
			.richContent()
			.contentReferences(r => r.id().type().imageUrl().caption()),
	)

	if (article.isLoading) return <div>Loading...</div>
	if (article.isError) return <div>Error: {article.error.message}</div>

	return (
		<div className="editor-example" data-testid="block-editor">
			<h3>{article.fields.title.value}</h3>

			<BlockEditor
				field={article.fields.richContent as unknown as FieldRefBase<SerializableEditorNode | null>}
				references={article.fields.contentReferences}
				discriminationField="type"
				blocks={blocks}
				plugins={blockEditorPlugins}
			>
				{editor => (
					<div>
						<div className="editor-toolbar">
							<EditorMarkTrigger mark={boldMark}>
								<button type="button" data-testid="block-bold-button"><strong>B</strong></button>
							</EditorMarkTrigger>
							<EditorMarkTrigger mark={italicMark}>
								<button type="button" data-testid="block-italic-button"><em>I</em></button>
							</EditorMarkTrigger>
							<button type="button" onClick={() => editor.insertBlock?.('image')} data-testid="insert-image-button">
								Insert Image
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
	)
}

/**
 * Simple Block Editor example — without references
 */
export function SimpleBlockEditorExample({ id }: { id: string }): ReactNode {
	const article = useEntity('Article', { by: { id } }, e =>
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
