import type { ReactNode } from 'react'
import type { FieldRef } from '@contember/bindx-react'

/**
 * Generic text input - doesn't know about models
 */
export function TextInput({ field, label, testId }: { field: FieldRef<string> | FieldRef<string | null>; label: string; testId?: string }): ReactNode {
	return (
		<div className="field">
			<label>{label}</label>
			<input
				type="text"
				value={field.value ?? ''}
				onChange={e => field.setValue(e.target.value)}
				data-testid={testId}
			/>
			{field.isDirty && <span className="dirty-indicator">*</span>}
		</div>
	)
}
