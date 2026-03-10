import type { EntityRef, EntityListAccessorResult } from '@contember/bindx-react'
import { TextInput } from '../inputs/index.js'

interface TagData {
	id: string
	name: string
	color: string | null
}

/**
 * Tag editor - knows about Tag model structure
 */
export function TagEditor({ tag }: { tag: EntityRef<TagData> }) {
	return (
		<div className="tag-editor">
			<TextInput field={tag.$fields.name} label="Tag Name" />
			<TextInput field={tag.$fields.color} label="Color" />
		</div>
	)
}

/**
 * Tag list editor with add/remove functionality
 */
export function TagListEditor({
	tags,
}: {
	tags: EntityListAccessorResult<TagData>
}) {
	if (tags.isLoading) {
		return <div>Loading tags...</div>
	}

	if (tags.isError) {
		return <div>Error loading tags: {tags.error.message}</div>
	}

	return (
		<div className="tag-list-editor">
			<h3>Tags ({tags.length})</h3>

			{tags.items.map(item => (
				<div key={item.id} className="tag-item">
					<TagEditor tag={item} />
					<button onClick={() => tags.remove(item.id)}>Remove</button>
				</div>
			))}

			<button onClick={() => tags.add({ name: '', color: '#000000' })}>Add Tag</button>
		</div>
	)
}
