import { type FC, type ReactNode } from 'react'
import { ReactEditor, useSlateStatic } from 'slate-react'
import type { ElementWithReference } from './elements/ElementWithReference.js'
import { EntityScope } from '@contember/bindx-react'
import type { EntityHandle } from '@contember/bindx'
import { useEditorGetReferencedEntity } from '../../contexts/EditorReferencesContext.js'

export interface ReferenceElementWrapperProps {
	element: ElementWithReference
	children?: ReactNode
}

export const ReferenceElementWrapper: FC<ReferenceElementWrapperProps> = ({ children, element }) => {
	const editor = useSlateStatic()
	const path = ReactEditor.findPath(editor, element)
	const getReferencedEntity = useEditorGetReferencedEntity()
	const ref = getReferencedEntity(path, element.referenceId)
	// EntityAccessor proxy wraps an EntityHandle — safe to cast for context provider
	return <EntityScope entity={ref as unknown as EntityHandle}>{children}</EntityScope>
}
