import { useCallback, useMemo, useRef } from 'react'
import { Descendant, Editor, Element } from 'slate'
import type { HasManyAccessor, EntityAccessor, AnyBrand } from '@contember/bindx'
import type { BlockDefinitions, InsertBlockOptions } from '../../types/editorProps.js'
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
	references: HasManyAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	discriminationField: keyof TEntity & string
	blocks: BlockDefinitions<TEntity, TSelected, TBrand, TEntityName, TSchema>
	editor: Editor
}

export interface BlockEditorReferencesResult<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	getReferencedEntity: (path: Path, id: string) => EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>
	insertBlock: (name: string, options?: InsertBlockOptions<EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>>) => void
	/** Removes reference entities no longer present in the document. Register on the parent's before-persist. */
	cleanup: () => void
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
}: UseBlockEditorReferencesOptions<TEntity, TSelected, TBrand, TEntityName, TSchema>): BlockEditorReferencesResult<TEntity, TSelected, TBrand, TEntityName, TSchema> {
	type Accessor = EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>

	const getReferencedEntity = useCallback((_path: Path, id: string): Accessor => {
		return references.getById(id)
	}, [references])

	const insertBlock = useCallback((name: string, options?: InsertBlockOptions<Accessor>) => {
		const targetBlock = blocks[name]
		if (!targetBlock) {
			throw new Error(
				`BlockEditor: Trying to insert a block discriminated by '${name}' but no such block has been found!`,
			)
		}

		// A block is reference-backed iff it declares a `staticRender` (the selection it needs from
		// its reference entity). Reference-less blocks keep all their data inline on the node, so we
		// skip entity creation entirely — see BlockDefinition.staticRender.
		const hasReference = !!targetBlock.staticRender

		const children: Descendant[] = targetBlock.isVoid
			? [{ text: '' }]
			: [editor.createDefaultElement([{ text: '' }])]

		Editor.withoutNormalizing(editor, () => {
			// Void blocks (with or without a reference) are placed as standalone top-level blocks.
			const path = prepareElementForInsertion(editor, hasReference || targetBlock.isVoid)

			let referenceId: string | undefined
			if (hasReference) {
				// Create the reference entity with a stable client-generated id, then use
				// the SAME id as the node's referenceId. The id is persisted as the entity's
				// primary key, so the document keeps resolving to it after a save (a temp id
				// would be remapped server-side and leave the node dangling).
				referenceId = crypto.randomUUID()
				references.add({ id: referenceId } as unknown as Partial<TEntity>)
				const entityAccessor = references.getById(referenceId)

				// Set discrimination field via proxy (EntityAccessor proxy resolves string keys to field handles)
				const fieldRef = (entityAccessor as Record<string, unknown>)[discriminationField]
				if (fieldRef && typeof fieldRef === 'object' && 'setValue' in fieldRef) {
					(fieldRef as { setValue: (v: unknown) => void }).setValue(name)
				}

				options?.initReference?.(entityAccessor)
			}

			// Seed inline props onto the node (e.g. a block's text fields kept out of the reference
			// entity). `referenceId` is omitted entirely for reference-less blocks.
			const newNode = {
				type: name,
				children,
				...(referenceId !== undefined ? { referenceId } : {}),
				...(options?.data ?? {}),
			} as unknown as ElementWithReference
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

	return useMemo(() => ({ getReferencedEntity, insertBlock, cleanup }), [getReferencedEntity, insertBlock, cleanup])
}
