import type { ReactNode } from 'react'
import { Entity, Field, useField } from '@contember/bindx-react'
import type { FieldRef } from '@contember/bindx'
import {
	RichTextEditor,
	BlockEditor,
	Editable,
	EditorMarkTrigger,
	EditorElementTrigger,
} from '@contember/bindx-editor'
import { schema } from '../generated/index.js'
import {
	richTextPlugins,
	blockEditorPlugins,
	comprehensivePlugins,
	blocks,
	boldMark,
	italicMark,
	underlineMark,
	codeMark,
	strikeThroughMark,
	highlightMark,
	headingElementType,
	unorderedListElementType,
	orderedListElementType,
	horizontalRuleElementType,
} from '../components/editorConfig.js'

/**
 * Rich Text Editor — inline editing with formatting toolbar.
 * Uses Entity JSX for data binding.
 */
export function RichTextEditorPage({ id }: { id: string }): ReactNode {
	return (
		<Entity
			entity={schema.Article}
			by={{ id }}
			loading={<div>Loading...</div>}
			notFound={<div>Article not found</div>}
		>
			{article => (
				<div className="editor-example" data-testid="rich-text-editor">
					<h3><Field field={article.title} /></h3>

					<RichTextEditor field={article.content} plugins={richTextPlugins}>
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

					<DirtyNotice field={article.content} />
				</div>
			)}
		</Entity>
	)
}

/**
 * Block Editor — comprehensive block editor with all block types.
 * Uses Entity JSX with auto-collected selection.
 */
export function BlockEditorPage({ id }: { id: string }): ReactNode {
	return (
		<Entity entity={schema.Article} by={{ id }} loading={<div>Loading...</div>}>
			{article => (
				<div className="editor-example" data-testid="block-editor">
					<h3><Field field={article.title} /></h3>

					<BlockEditor
						field={article.richContent}
						references={article.contentReferences}
						discriminationField="type"
						blocks={blocks}
						plugins={comprehensivePlugins}
					>
						{editor => (
							<div>
								<div className="editor-toolbar" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
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
 * Simple Block Editor — without references.
 * Uses Entity JSX.
 */
export function SimpleBlockEditorPage({ id }: { id: string }): ReactNode {
	return (
		<Entity
			entity={schema.Article}
			by={{ id }}
			loading={<div>Loading...</div>}
			notFound={<div>Article not found</div>}
		>
			{article => (
				<div className="editor-example" data-testid="simple-block-editor">
					<h3><Field field={article.title} /></h3>

					<BlockEditor
						field={article.richContent}
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
			)}
		</Entity>
	)
}

function DirtyNotice<T>({ field }: { field: FieldRef<T> }): ReactNode {
	const acc = useField(field)
	if (!acc.isDirty) return null
	return <p style={{ color: 'orange', fontSize: '12px' }} data-testid="rte-dirty-notice">Content has been modified</p>
}

/**
 * Combined editors page.
 */
export function EditorsPage({ id1, id2 }: { id1: string; id2: string }): ReactNode {
	return (
		<>
			<h3>Rich Text Editor</h3>
			<RichTextEditorPage id={id1} />
			<hr className="my-6" />
			<h3>Block Editor (with references)</h3>
			<BlockEditorPage id={id1} />
			<hr className="my-6" />
			<h3>Block Editor (simple)</h3>
			<SimpleBlockEditorPage id={id2} />
		</>
	)
}
