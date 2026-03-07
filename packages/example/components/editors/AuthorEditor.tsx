import type { FieldRef } from '@contember/bindx-react'
import { TextInput } from '../inputs/index.js'

/**
 * Author editor - knows about Author model structure
 * Receives only the fields it needs for flexible composition
 */
export function AuthorEditor({
	author,
}: {
	author: { name: FieldRef<string>; email: FieldRef<string> }
}) {
	return (
		<div className="author-editor" data-testid="author-editor">
			<h3>Author</h3>
			<TextInput field={author.name} label="Name" testId="author-name-input" />
			<TextInput field={author.email} label="Email" testId="author-email-input" />
		</div>
	)
}
