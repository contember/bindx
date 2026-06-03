import type { ReactNode } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { Editor } from 'slate'
import type { FieldRef, HasManyRef, EntityAccessor, AnyBrand } from '@contember/bindx'
import type { SerializableEditorNode } from './editor.js'
import type { EditorPlugin } from './plugins.js'

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | { readonly [K in string]?: JSONValue } | readonly JSONValue[]

export interface RichTextEditorProps {
	field: FieldRef<SerializableEditorNode | null> | FieldRef<JSONValue | null>
	plugins?: EditorPlugin[]
	children: (editor: Editor) => ReactNode
}

export interface BlockDefinition<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	isVoid: boolean
	render: (
		props: RenderElementProps & { isVoid: boolean },
		ref: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema> | null,
	) => ReactNode
	/** Static render for selection collection. Returns JSX with <Field>, <HasOne>, etc.
	 *  Called during analysis phase with a collector proxy — must be pure (no hooks, no side effects).
	 *
	 *  OPTIONAL: omit it to make the block **reference-less** — no reference entity is created on
	 *  insert, the node carries no `referenceId`, `render` receives `ref === null`, and the block is
	 *  skipped during selection collection. Such a block keeps all its data inline on the Slate node
	 *  (seed it via `insertBlock(name, { data })`, mutate it via `useEditorBlockElement().setData`).
	 *  This is the "hybrid" knob: a block *with* `staticRender` can still keep some fields inline on
	 *  the node and reserve the reference entity for genuine relations (an image asset, a product). */
	staticRender?: (ref: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>) => ReactNode
}

/** Options for `editor.insertBlock` and the references-hook `insertBlock`. */
export interface InsertBlockOptions<TRef = unknown> {
	/** Inline props seeded directly onto the new block's Slate node (persisted in the JSON field). */
	data?: Record<string, unknown>
	/** Initialize the reference entity. Ignored for reference-less blocks (those without `staticRender`). */
	initReference?: (ref: TRef) => void
}

export type BlockDefinitions<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = Record<string, BlockDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>

export interface BlockEditorBaseProps {
	field: FieldRef<SerializableEditorNode | null> | FieldRef<JSONValue | null>
	plugins?: EditorPlugin[]
	children: (editor: Editor) => ReactNode
}

export interface BlockEditorWithReferencesProps<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> {
	field: FieldRef<SerializableEditorNode | null> | FieldRef<JSONValue | null>
	references: HasManyRef<TEntity, TSelected, TBrand, TEntityName, TSchema>
	discriminationField: keyof TEntity & string
	blocks: BlockDefinitions<TEntity, TSelected, TBrand, TEntityName, TSchema>
	plugins?: EditorPlugin[]
	children: (editor: Editor) => ReactNode
}

export type BlockEditorProps<
	TEntity extends object = object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = BlockEditorBaseProps | BlockEditorWithReferencesProps<TEntity, TSelected, TBrand, TEntityName, TSchema>
