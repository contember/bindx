import type { ReactNode } from 'react'
import type { RenderElementProps } from 'slate-react'
import type { Editor } from 'slate'
import type { FieldRefBase, HasManyRefBase, EntityAccessor, AnyBrand } from '@contember/bindx'
import type { SerializableEditorNode } from './editor.js'
import type { EditorPlugin } from './plugins.js'

type JSONPrimitive = string | number | boolean | null
type JSONValue = JSONPrimitive | { readonly [K in string]?: JSONValue } | readonly JSONValue[]

export interface RichTextEditorProps {
	field: FieldRefBase<SerializableEditorNode | null> | FieldRefBase<JSONValue | null>
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
	 *  Called during analysis phase with a collector proxy — must be pure (no hooks, no side effects). */
	staticRender: (ref: EntityAccessor<TEntity, TSelected, TBrand, TEntityName, TSchema>) => ReactNode
}

export type BlockDefinitions<
	TEntity extends object,
	TSelected = TEntity,
	TBrand extends AnyBrand = AnyBrand,
	TEntityName extends string = string,
	TSchema extends Record<string, object> = Record<string, object>,
> = Record<string, BlockDefinition<TEntity, TSelected, TBrand, TEntityName, TSchema>>

export interface BlockEditorBaseProps {
	field: FieldRefBase<SerializableEditorNode | null> | FieldRefBase<JSONValue | null>
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
	field: FieldRefBase<SerializableEditorNode | null> | FieldRefBase<JSONValue | null>
	references: HasManyRefBase<TEntity, TSelected, TBrand, TEntityName, TSchema>
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
