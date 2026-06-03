import type { ReactNode, CSSProperties, SyntheticEvent } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { ContentReference } from '../generated/entities.js'
import type { FieldRef } from '@contember/bindx'
import {
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
	withLists,
	withHorizontalRules,
	withAnchors,
	withPaste,
	type BlockDefinitions,
	type ParagraphElement,
	type HorizontalRuleElement,
	type AnchorElement,
	type ListItemElement,
	type OrderedListElement,
	type UnorderedListElement,
	type HeadingElement,
} from '@contember/bindx-editor'
import { Field } from '@contember/bindx-react'

// ============================================================================
// Element Renderers
// ============================================================================

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

// Inline styles re-assert list semantics that the example's Tailwind preflight
// reset strips (list-style / padding), so lists are visually distinguishable.
const ListItemRenderer = (props: RenderElementProps & { element: ListItemElement }): ReactNode => (
	<li {...props.attributes} style={{ display: 'list-item' }}>{props.children}</li>
)

const UnorderedListRenderer = (props: RenderElementProps & { element: UnorderedListElement }): ReactNode => (
	<ul {...props.attributes} style={{ listStyleType: 'disc', paddingLeft: '1.5rem', margin: '0.5rem 0' }}>{props.children}</ul>
)

const OrderedListRenderer = (props: RenderElementProps & { element: OrderedListElement }): ReactNode => (
	<ol {...props.attributes} style={{ listStyleType: 'decimal', paddingLeft: '1.5rem', margin: '0.5rem 0' }}>{props.children}</ol>
)

// ============================================================================
// Plugin Sets
// ============================================================================

export const richTextPlugins = [withBold(), withItalic(), withUnderline(), withNewline()]

export const blockEditorPlugins = [
	withParagraphs({ render: ParagraphRenderer }),
	withBold(),
	withItalic(),
	withUnderline(),
	withHeadings({ render: HeadingRenderer }),
]

export const comprehensivePlugins = [
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

// ============================================================================
// Re-exports for toolbar
// ============================================================================

export {
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
} from '@contember/bindx-editor'

// ============================================================================
// Block Definitions
// ============================================================================

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

// ----------------------------------------------------------------------------
// Editable block fields
//
// Reference blocks are Slate void elements (contentEditable=false), so their
// inner form controls must stop Slate from interpreting pointer/keyboard events
// — otherwise focus is stolen and Backspace deletes the whole block.
// ----------------------------------------------------------------------------

const stopSlate = (e: SyntheticEvent): void => e.stopPropagation()

const blockLabelStyle: CSSProperties = {
	display: 'block',
	fontSize: '11px',
	fontWeight: 600,
	color: '#888',
	textTransform: 'uppercase',
	letterSpacing: '0.04em',
	margin: '8px 0 2px',
}

const blockFieldStyle: CSSProperties = {
	display: 'block',
	width: '100%',
	border: '1px solid #ddd',
	borderRadius: '4px',
	padding: '6px 8px',
	fontSize: '14px',
	fontFamily: 'inherit',
	background: '#fff',
	boxSizing: 'border-box',
}

function BlockTextField({ field, label, placeholder, multiline = false }: {
	field: FieldRef<string | null>
	label: string
	placeholder?: string
	multiline?: boolean
}): ReactNode {
	return (
		<Field field={field}>
			{f => (
				<label style={blockLabelStyle}>
					{label}
					{multiline ? (
						<textarea
							value={f.value ?? ''}
							onChange={e => f.setValue(e.target.value)}
							placeholder={placeholder}
							rows={2}
							onMouseDown={stopSlate}
							onKeyDown={stopSlate}
							onPaste={stopSlate}
							onDrop={stopSlate}
							style={{ ...blockFieldStyle, resize: 'vertical' }}
						/>
					) : (
						<input
							value={f.value ?? ''}
							onChange={e => f.setValue(e.target.value)}
							placeholder={placeholder}
							onMouseDown={stopSlate}
							onKeyDown={stopSlate}
							onPaste={stopSlate}
							onDrop={stopSlate}
							style={blockFieldStyle}
						/>
					)}
				</label>
			)}
		</Field>
	)
}

function BlockSelectField({ field, label, options }: {
	field: FieldRef<string | null>
	label: string
	options: ReadonlyArray<{ value: string; label: string }>
}): ReactNode {
	return (
		<Field field={field}>
			{f => (
				<label style={blockLabelStyle}>
					{label}
					<select
						value={f.value ?? ''}
						onChange={e => f.setValue(e.target.value)}
						onMouseDown={stopSlate}
						onKeyDown={stopSlate}
						style={blockFieldStyle}
					>
						{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
					</select>
				</label>
			)}
		</Field>
	)
}

export const simpleBlocks: BlockDefinitions<ContentReference> = {
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

export const blocks: BlockDefinitions<ContentReference> = {
	image: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<div {...props.attributes} contentEditable={false} style={{ padding: '12px', background: '#f5f5f5', borderRadius: '8px', margin: '8px 0' }}>
					<Field field={ref.imageUrl}>
						{url => <img src={url.value || 'https://via.placeholder.com/400x200'} alt="" style={{ maxWidth: '100%', borderRadius: '4px', display: 'block' }} />}
					</Field>
					<BlockTextField field={ref.imageUrl} label="Image URL" placeholder="https://…" />
					<BlockTextField field={ref.caption} label="Caption" placeholder="Describe the image" />
					{props.children}
				</div>
			)
		},
		staticRender: ref => (
			<><Field field={ref.imageUrl} /><Field field={ref.caption} /></>
		),
	},
	quote: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<blockquote {...props.attributes} contentEditable={false} style={{ borderLeft: '4px solid #ccc', padding: '8px 16px', margin: '8px 0', background: '#fafafa' }}>
					<BlockTextField field={ref.quoteText} label="Quote" placeholder="The quote text" multiline />
					<BlockTextField field={ref.quoteAuthor} label="Author" placeholder="Who said it" />
					{props.children}
				</blockquote>
			)
		},
		staticRender: ref => (
			<><Field field={ref.quoteText} /><Field field={ref.quoteAuthor} /></>
		),
	},
	embed: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<div {...props.attributes} contentEditable={false} style={{ padding: '12px', background: '#f0f0f0', borderRadius: '8px', margin: '8px 0' }}>
					<Field field={ref.embedUrl}>
						{url => (
							<Field field={ref.embedType}>
								{type =>
									type.value === 'youtube' && extractYoutubeId(url.value)
										? <iframe src={`https://youtube.com/embed/${extractYoutubeId(url.value)}`} style={{ width: '100%', height: '240px', border: 'none', borderRadius: '4px' }} title="YouTube video" />
										: <a href={url.value ?? ''} target="_blank" rel="noopener noreferrer" style={{ color: '#1a73e8' }}>{url.value || 'No URL set'}</a>
								}
							</Field>
						)}
					</Field>
					<BlockSelectField field={ref.embedType} label="Type" options={[{ value: 'youtube', label: 'YouTube' }, { value: 'link', label: 'Link' }]} />
					<BlockTextField field={ref.embedUrl} label="URL" placeholder="https://youtube.com/watch?v=…" />
					{props.children}
				</div>
			)
		},
		staticRender: ref => (
			<><Field field={ref.embedUrl} /><Field field={ref.embedType} /></>
		),
	},
	callout: {
		isVoid: true,
		render: (props, ref) => {
			if (!ref) return null
			return (
				<div {...props.attributes} contentEditable={false} style={{ margin: '8px 0' }}>
					<Field field={ref.calloutVariant}>
						{variant => (
							<div style={{ background: variantColors[variant.value ?? 'info'], padding: '12px 16px', borderRadius: '8px', border: '1px solid rgba(0,0,0,0.1)' }}>
								<BlockTextField field={ref.calloutText} label="Callout text" placeholder="Your note" multiline />
								<BlockSelectField
									field={ref.calloutVariant}
									label="Variant"
									options={[
										{ value: 'info', label: 'Info' },
										{ value: 'warning', label: 'Warning' },
										{ value: 'success', label: 'Success' },
										{ value: 'error', label: 'Error' },
									]}
								/>
							</div>
						)}
					</Field>
					{props.children}
				</div>
			)
		},
		staticRender: ref => (
			<><Field field={ref.calloutText} /><Field field={ref.calloutVariant} /></>
		),
	},
}
