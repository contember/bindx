import { useEntityList } from '../../bindx.js'

/**
 * Example: Tag list with colored badges
 * Demonstrates useEntityList with custom rendering
 */
export function TagListExample() {
	const tags = useEntityList('Tag', {}, e => e.id().name().color())

	if (tags.isLoading) {
		return <div>Loading tags...</div>
	}

	if (tags.isError) {
		return <div>Error: {tags.error.message}</div>
	}

	return (
		<div className="tag-list">
			<h3>Available Tags</h3>
			<div className="tag-badges">
				{tags.items.map(item => (
					<span
						key={item.key}
						className="tag-badge"
						style={{
							backgroundColor: item.data.color,
							color: '#fff',
							padding: '4px 8px',
							borderRadius: '4px',
							marginRight: '8px',
							display: 'inline-block',
						}}
					>
						{item.data.name}
					</span>
				))}
			</div>
		</div>
	)
}
