import { useEntityList } from '../../bindx.js'
import { Select } from '../inputs/index.js'

interface AuthorSelectProps {
	value: string | null
	onChange: (authorId: string | null) => void
	label?: string
}

/**
 * Author select component - demonstrates useEntityList for loading options
 */
export function AuthorSelect({ value, onChange, label = 'Author' }: AuthorSelectProps) {
	const authors = useEntityList('Author', {}, e => e.id().name().email())

	return (
		<Select
			label={label}
			value={value}
			onChange={onChange}
			options={authors}
			getLabel={author => author.name}
			placeholder="Select author..."
		/>
	)
}

/**
 * Alternative: Author select with email shown
 */
export function AuthorSelectWithEmail({ value, onChange, label = 'Author' }: AuthorSelectProps) {
	const authors = useEntityList('Author', {}, e => e.id().name().email())

	if (authors.isLoading) {
		return (
			<div className="field">
				<label>{label}</label>
				<select disabled>
					<option>Loading authors...</option>
				</select>
			</div>
		)
	}

	if (authors.isError) {
		return (
			<div className="field">
				<label>{label}</label>
				<div>Error: {authors.error.message}</div>
			</div>
		)
	}

	return (
		<div className="field">
			<label>{label}</label>
			<select value={value ?? ''} onChange={e => onChange(e.target.value || null)}>
				<option value="">Select author...</option>
				{authors.items.map(item => (
					<option key={item.key} value={item.id}>
						{item.data.name} ({item.data.email})
					</option>
				))}
			</select>
		</div>
	)
}
