import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { Descendant, Editor, Node, Transforms } from 'slate'
import { Slate, useSlate, useSlateStatic, ReactEditor } from 'slate-react'
import type { RenderElementProps } from 'slate-react'
import { createEditor } from '../editor/createEditor.js'
import { paragraphElementType } from '../plugins/element/paragraphs/index.js'
import { createElementKey } from '../internal/helpers/createElementKey.js'
import type { FieldRef, HasManyRef, EntityAccessor, AnyBrand } from '@contember/bindx'
import { FIELD_REF_META } from '@contember/bindx'
import type { SerializableEditorNode } from '../types/editor.js'
import type {
	BlockEditorBaseProps,
	BlockEditorWithReferencesProps,
	BlockEditorProps,
	BlockDefinition,
} from '../types/editorProps.js'
import { useBlockEditorReferences } from '../internal/hooks/useBlockEditorReferences.js'
import { referenceOverrides } from '../plugins/references/referenceOverrides.js'
import { isElementWithReference } from '../plugins/references/elements/ElementWithReference.js'
import { EditorErrorBoundary } from './EditorErrorBoundary.js'
import { ReferenceElementWrapper } from '../plugins/references/ReferenceElementWrapper.js'
import { EditorGetReferencedEntityProvider, useEditorGetReferencedEntity } from '../contexts/EditorReferencesContext.js'
import { EditorBlockElementProvider } from '../contexts/EditorBlockElementContext.js'
import { BINDX_COMPONENT, type SelectionFieldMeta, type SelectionProvider, type SelectionMeta, createCollectorProxy } from '@contember/bindx-react'
import { SelectionScope } from '@contember/bindx'

export type { BlockEditorBaseProps, BlockEditorWithReferencesProps, BlockEditorProps }

function isWithReferences<
	TEntity extends object,
	TSelected,
	TBrand extends AnyBrand,
	TEntityName extends string,
	TSchema extends Record<string, object>,
>(props: BlockEditorProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): props is BlockEditorWithReferencesProps<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	return 'references' in props && props.references !== undefined
}

export function BlockEditor<
	TEntity extends object = object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
>(props: BlockEditorProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): ReactNode {
	if (isWithReferences(props)) {
		return <BlockEditorWithReferences {...props} />
	}
	return <BlockEditorSimple {...props} />
}

function BlockEditorSimple({ field, plugins, children }: BlockEditorBaseProps): ReactNode {
	const fullField = field as FieldRef<SerializableEditorNode | null>

	const [{ editor, OuterWrapper, InnerWrapper }] = useState(() => {
		return createEditor({ defaultElementType: paragraphElementType, plugins })
	})

	const handleEditorOnChange = useCallback((value: Descendant[]) => {
		const contentJson: SerializableEditorNode | null = value.length > 0 ? { formatVersion: 2, children: value } : null

		const currentValue = fullField.value
		if (contentJson && currentValue && typeof currentValue === 'object' && 'children' in currentValue && currentValue.children === value) {
			return
		}

		fullField.setValue(contentJson)
	}, [fullField])

	const [emptyValue] = useState(() => [{ ...editor.createDefaultElement([{ text: '' }]), key: createElementKey() }])

	const fieldValue = fullField.value
	const nodes = fieldValue && typeof fieldValue === 'object' && 'children' in fieldValue
		? (fieldValue.children as Descendant[])
		: emptyValue

	return (
		<OuterWrapper>
			<Slate editor={editor} initialValue={nodes} onChange={handleEditorOnChange}>
				<SyncValue nodes={nodes} />
				<InnerWrapper>
					{children(editor)}
				</InnerWrapper>
			</Slate>
		</OuterWrapper>
	)
}

function BlockEditorWithReferences<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
>({
	field,
	references,
	discriminationField,
	blocks,
	plugins,
	children,
}: BlockEditorWithReferencesProps<TEntity, TSelected, TBrand, TEntityName, TSchema>): ReactNode {
	type Accessor = EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>

	const fullField = field as FieldRef<SerializableEditorNode | null>
	// At runtime, references is always a full HasManyRef
	const fullReferences = references as HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>

	const [{ editor, OuterWrapper, InnerWrapper }] = useState(() => {
		const result = createEditor({ defaultElementType: paragraphElementType, plugins })
		const { editor } = result

		// Register block elements from blocks prop
		for (const [name, block] of Object.entries(blocks)) {
			const blockDef = block as BlockDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>
			editor.registerElement({
				type: name,
				canContainAnyBlocks: !blockDef.isVoid,
				isVoid: blockDef.isVoid,
				render: renderProps => {
					return (
						<EditorBlockElementProvider value={renderProps}>
							<BlockElementRenderer
								block={blockDef}
								renderProps={renderProps}
							/>
						</EditorBlockElementProvider>
					)
				},
			})
		}

		// Apply reference overrides for smart insertion, paste handling, etc.
		referenceOverrides(editor)

		// Wrap renderElement to add reference entity scope
		const { renderElement } = editor
		editor.renderElement = renderProps => {
			const rendered = renderElement(renderProps)
			if (isElementWithReference(renderProps.element)) {
				return (
					<EditorErrorBoundary>
						<ReferenceElementWrapper element={renderProps.element}>{rendered}</ReferenceElementWrapper>
					</EditorErrorBoundary>
				)
			}
			return rendered
		}

		return result
	})

	const onBeforePersist = useCallback((callback: () => void): (() => void) => {
		// HasManyRef doesn't expose parent entity's interceptPersisting directly.
		// We need to find a way to hook into persistence. For now, use a no-op.
		// The cleanup will be triggered by the component lifecycle.
		// TODO: Add proper persist interception via parent entity
		return () => {}
	}, [])

	const { getReferencedEntity, insertBlock } = useBlockEditorReferences({
		references: fullReferences,
		discriminationField,
		blocks,
		editor,
		onBeforePersist,
	})

	// Wire insertBlock onto the editor
	useMemo(() => {
		editor.insertBlock = (name: string, init?: (ref: unknown) => void) => {
			insertBlock(name, init as ((ref: Accessor) => void) | undefined)
		}
	}, [editor, insertBlock])

	const handleEditorOnChange = useCallback((value: Descendant[]) => {
		const contentJson: SerializableEditorNode | null = value.length > 0 ? { formatVersion: 2, children: value } : null

		const currentValue = fullField.value
		if (contentJson && currentValue && typeof currentValue === 'object' && 'children' in currentValue && currentValue.children === value) {
			return
		}

		fullField.setValue(contentJson)
	}, [fullField])

	const [emptyValue] = useState(() => [{ ...editor.createDefaultElement([{ text: '' }]), key: createElementKey() }])

	const fieldValue = fullField.value
	const nodes = fieldValue && typeof fieldValue === 'object' && 'children' in fieldValue
		? (fieldValue.children as Descendant[])
		: emptyValue

	return (
		<EditorGetReferencedEntityProvider value={getReferencedEntity as (path: import('slate').Path, id: string) => EntityAccessor<unknown, unknown>}>
			<OuterWrapper>
				<Slate editor={editor} initialValue={nodes} onChange={handleEditorOnChange}>
					<SyncValue nodes={nodes} />
					<InnerWrapper>
						{children(editor)}
					</InnerWrapper>
				</Slate>
			</OuterWrapper>
		</EditorGetReferencedEntityProvider>
	)
}

/**
 * Renders a block element, looking up the referenced entity via context.
 */
function BlockElementRenderer<
	TEntity extends object,
	TSelected,
	TBrand extends AnyBrand,
	TEntityName extends string,
	TSchema extends Record<string, object>,
>({
	block,
	renderProps,
}: {
	block: BlockDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>
	renderProps: RenderElementProps
}): ReactNode {
	if (isElementWithReference(renderProps.element)) {
		return <BlockElementWithRef block={block} renderProps={renderProps} />
	}

	return <>{block.render({ ...renderProps, isVoid: block.isVoid }, null)}</>
}

function BlockElementWithRef<
	TEntity extends object,
	TSelected,
	TBrand extends AnyBrand,
	TEntityName extends string,
	TSchema extends Record<string, object>,
>({
	block,
	renderProps,
}: {
	block: BlockDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>
	renderProps: RenderElementProps
}): ReactNode {
	const getReferencedEntity = useEditorGetReferencedEntity()
	const editor = useSlateStatic()
	const element = renderProps.element as import('../plugins/references/elements/ElementWithReference.js').ElementWithReference
	const path = ReactEditor.findPath(editor, element)
	const entity = getReferencedEntity(path, element.referenceId) as EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>

	return <>{block.render({ ...renderProps, isVoid: block.isVoid }, entity)}</>
}

function SyncValue({ nodes }: { nodes: Descendant[] }): null {
	const editor = useSlate()
	useEffect(() => {
		if (editor.children !== nodes && JSON.stringify(editor.children) !== JSON.stringify(nodes)) {
			Editor.withoutNormalizing(editor, () => {
				for (const [, childPath] of Node.children(editor, [], { reverse: true })) {
					Transforms.removeNodes(editor, { at: childPath })
				}
				Transforms.insertNodes(editor, nodes)
			})
		}
	}, [editor, nodes])
	return null
}

// Static method for selection extraction
const blockEditorAny = BlockEditor as unknown as Record<string | symbol, unknown> & SelectionProvider

blockEditorAny.getSelection = (
	props: unknown,
	collectNested: (children: ReactNode) => SelectionMeta,
): SelectionFieldMeta | SelectionFieldMeta[] | null => {
	const editorProps = props as BlockEditorProps
	if (editorProps.field === undefined || editorProps.field === null) {
		return null
	}
	const fieldMeta = editorProps.field[FIELD_REF_META]
	if (!fieldMeta) {
		return null
	}

	const fieldSelection: SelectionFieldMeta = {
		fieldName: fieldMeta.fieldName,
		alias: fieldMeta.fieldName,
		path: fieldMeta.path,
		isArray: false,
		isRelation: false,
	}

	// If has references, also collect the has-many relation
	if ('references' in editorProps && editorProps.references) {
		const refProps = editorProps as BlockEditorWithReferencesProps<object>
		const refMeta = refProps.references[FIELD_REF_META]
		if (refMeta) {
			const refScope = new SelectionScope()
			refScope.addScalar(refProps.discriminationField)

			// Collect fields from each block's staticRender
			for (const block of Object.values(refProps.blocks)) {
				const blockDef = block as BlockDefinition<object>
				const blockScope = new SelectionScope()
				const collector = createCollectorProxy<object>(blockScope, null, null)

				// Call staticRender with collector proxy — dual-track collection:
				// 1. Proxy tracking captures ref.field access
				// 2. JSX analysis discovers <Field>, <HasOne>, <HasMany> in returned JSX
				const jsx = blockDef.staticRender(collector)
				if (jsx) {
					const jsxMeta = collectNested(jsx as ReactNode)
					blockScope.mergeFromSelectionMeta(jsxMeta)
				}

				refScope.merge(blockScope)
			}

			const referencesSelection: SelectionFieldMeta = {
				fieldName: refMeta.fieldName,
				alias: refMeta.fieldName,
				path: refMeta.path,
				isArray: true,
				isRelation: true,
				nested: refScope.toSelectionMeta(),
			}
			return [fieldSelection, referencesSelection]
		}
	}

	return fieldSelection
}

blockEditorAny[BINDX_COMPONENT] = true
