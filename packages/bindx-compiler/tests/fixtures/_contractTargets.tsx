// Contract components a cross-file host imports. Their `withCollector(_, contract)`
// declaration is what the compiler's contract discovery parses out of this sibling module.
import type { ReactNode } from 'react'
import { itemOf, entityOf, withCollector, type EntityRef, type HasManyRef, type HasOneRef } from '@contember/bindx-react'
import type { Author, Tag } from './_schema.js'

interface RepeaterProps {
	field: HasManyRef<Tag>
	children?: (item: EntityRef<Tag>) => ReactNode
}

// itemOf: `children` is invoked per item of the has-many `field`.
export const ItemRepeater = withCollector(
	function ItemRepeaterRuntime(_props: RepeaterProps): ReactNode { return null },
	{ children: itemOf('field') },
)

interface EditorProps {
	entity: HasOneRef<Author>
	children?: (entity: EntityRef<Author>) => ReactNode
}

// entityOf: `children` is invoked with the entity of the has-one `entity`.
export const EntityEditor = withCollector(
	function EntityEditorRuntime(_props: EditorProps): ReactNode { return null },
	{ children: entityOf('entity') },
)
