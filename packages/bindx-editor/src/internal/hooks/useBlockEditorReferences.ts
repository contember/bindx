import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Descendant, Editor, Element } from 'slate'
import type { HasManyRef, EntityAccessor, AnyBrand } from '@contember/bindx'
import type { BlockDefinitions } from '../../types/editorProps.js'
import { isElementWithReference } from '../../plugins/references/elements/ElementWithReference.js'
import { prepareElementForInsertion } from '../../plugins/references/utils/prepareElementForInsertion.js'
import { Transforms } from 'slate'
import type { ElementWithReference } from '../../plugins/references/elements/ElementWithReference.js'
import type { Path } from 'slate'

export interface UseBlockEditorReferencesOptions<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	references: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	discriminationField: keyof TEntity & string
	blocks: BlockDefinitions<TEntity, TSelected, TBrand, TEntityName, TSchema>
	editor: Editor
	onBeforePersist: (callback: () => void) => (() => void)
}

export interface BlockEditorReferencesResult<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	getReferencedEntity: (path: Path, id: string) => EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	insertBlock: (name: string, init?: (ref: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>) => void) => void
}

export function useBlockEditorReferences<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
>({
	references,
	discriminationField,
	blocks,
	editor,
	onBeforePersist,
}: UseBlockEditorReferencesOptions<TEntity, TSelected, TBrand, TEntityName, TSchema>): BlockEditorReferencesResult<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	type Accessor = EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>

	const getReferencedEntity = useCallback((_path: Path, id: string): Accessor => {
		return references.getById(id)
	}, [references])

	const insertBlock = useCallback((name: string, init?: (ref: Accessor) => void) => {
		const targetBlock = blocks[name]
		if (!targetBlock) {
			throw new Error(
				`BlockEditor: Trying to insert a block discriminated by '${name}' but no such block has been found!`,
			)
		}

		const children: Descendant[] = targetBlock.isVoid
			? [{ text: '' }]
			: [editor.createDefaultElement([{ text: '' }])]

		Editor.withoutNormalizing(editor, () => {
			const path = prepareElementForInsertion(editor, true)

			// Create reference entity
			const tempId = references.add()
			const entityAccessor = references.getById(tempId)

			// Set discrimination field via proxy (EntityAccessor proxy resolves string keys to field handles)
			const fieldRef = (entityAccessor as Record<string, unknown>)[discriminationField]
			if (fieldRef && typeof fieldRef === 'object' && 'setValue' in fieldRef) {
				(fieldRef as { setValue: (v: unknown) => void }).setValue(name)
			}

			init?.(entityAccessor)

			const referenceId = entityAccessor.id
			const newNode: ElementWithReference = { type: name, children, referenceId }
			Transforms.insertNodes(editor, newNode, { at: path })
		})
	}, [blocks, editor, references, discriminationField])

	// Cleanup orphaned references before persist
	const editorRef = useRef(editor)
	editorRef.current = editor
	const referencesRef = useRef(references)
	referencesRef.current = references

	const cleanup = useCallback(() => {
		const referenceIds: string[] = []
		const collectReferences = (nodes: Descendant[]): void => {
			for (const node of nodes) {
				if (isElementWithReference(node)) {
					referenceIds.push(node.referenceId)
				}
				if (Element.isElement(node) && node.children) {
					collectReferences(node.children)
				}
			}
		}
		collectReferences(editorRef.current.children)

		const items = referencesRef.current.items
		for (const item of items) {
			const itemId = item.id as string
			if (!referenceIds.includes(itemId)) {
				referencesRef.current.remove(itemId)
			}
		}
	}, [])

	useEffect(() => {
		return onBeforePersist(cleanup)
	}, [onBeforePersist, cleanup])

	return useMemo(() => ({ getReferencedEntity, insertBlock }), [getReferencedEntity, insertBlock])
}
