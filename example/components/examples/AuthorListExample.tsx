import { useEntityList } from '../../bindx.js'

/**
 * Example: Simple entity list display
 * Demonstrates basic useEntityList usage for displaying a list of entities
 */
export function AuthorListExample() {
	const authors = useEntityList('Author', {}, e => e.id().name().email().bio())

	if (authors.isLoading) {
		return <div>Loading authors...</div>
	}

	if (authors.isError) {
		return <div>Error: {authors.error.message}</div>
	}

	return (
		<div className="author-list">
			<h3>All Authors ({authors.length})</h3>
			<ul>
				{authors.items.map(item => (
					<li key={item.key}>
						<strong>{item.data.name}</strong>
						<span> - {item.data.email}</span>
						<p>{item.data.bio}</p>
					</li>
				))}
			</ul>
		</div>
	)
}
