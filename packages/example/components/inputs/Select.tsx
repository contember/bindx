import type { EntityListAccessorResult } from '@contember/bindx-react'

export interface SelectOption {
	id: string
	label: string
}

export interface SelectProps<TData extends { id: string }> {
	label: string
	value: string | null
	onChange: (id: string | null) => void
	options: EntityListAccessorResult<TData>
	getLabel: (data: TData) => string
	placeholder?: string
}

/**
 * Generic select component that works with useEntityList
 */
export function Select<TData extends { id: string }>({
	label,
	value,
	onChange,
	options,
	getLabel,
	placeholder = 'Select...',
}: SelectProps<TData>) {
	const isLoading = options.isLoading

	return (
		<div className="field">
			<label>{label}</label>
			<select
				value={value ?? ''}
				onChange={e => onChange(e.target.value || null)}
				disabled={isLoading}
			>
				<option value="">{isLoading ? 'Loading...' : placeholder}</option>
				{!isLoading &&
					options.items.map((item) => (
						<option key={item.id} value={item.id}>
							{item.$data ? getLabel(item.$data) : ''}
						</option>
					))}
			</select>
		</div>
	)
}
