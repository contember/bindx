import React from 'react'
import { useUndo } from '@contember/bindx-react'
import { useEntity } from '../generated/index.js'
import { TextInput } from './inputs/index.js'

/**
 * Demo component showcasing undo/redo functionality.
 */
export function UndoDemo({ id }: { id: string }): React.ReactElement {
	const { canUndo, canRedo, undo, redo, undoCount, redoCount, beginGroup, endGroup } = useUndo()

	const article = useEntity('Article', { by: { id } }, e => e.id().title().content())

	if (article.isLoading) {
		return <div className="loading">Loading...</div>
	}

	if (article.isError) {
		return <div className="error">Error: {article.error?.message}</div>
	}

	const handleBulkUpdate = () => {
		const groupId = beginGroup('Bulk update')
		article.fields.title.setValue('Bulk Updated Title')
		article.fields.content.setValue('Bulk Updated Content - this is a single undo operation!')
		endGroup(groupId)
	}

	return (
		<div className="undo-demo" data-testid="undo-demo">
			<div className="undo-toolbar">
				<button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" data-testid="undo-button">
					↩ Undo ({undoCount})
				</button>
				<button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" data-testid="redo-button">
					↪ Redo ({redoCount})
				</button>
				<button onClick={handleBulkUpdate} className="bulk-btn" data-testid="bulk-update-button">
					Bulk Update (grouped)
				</button>
			</div>

			<div className="form-fields">
				<div className="field">
					<label>Title:</label>
					<TextInput
						field={article.fields.title}
						label=""
						testId="undo-title-input"
					/>
					{article.fields.title.isDirty && <span className="dirty-indicator">*</span>}
				</div>

				<div className="field">
					<label>Content:</label>
					<textarea
						value={article.fields.content.value ?? ''}
						onChange={e => article.fields.content.setValue(e.target.value)}
						rows={4}
						data-testid="undo-content-input"
					/>
					{article.fields.content.isDirty && <span className="dirty-indicator">*</span>}
				</div>
			</div>

			<div className="hint">
				<p>
					<strong>Try it:</strong> Edit the fields above and use Undo/Redo buttons.
					Changes are auto-grouped when typing rapidly (300ms debounce).
				</p>
				<p>
					<strong>Bulk Update:</strong> Uses beginGroup/endGroup to make multiple changes
					act as a single undo operation.
				</p>
			</div>

			<style>{`
				.undo-demo {
					padding: 1rem;
					border: 1px solid #ddd;
					border-radius: 8px;
				}
				.undo-toolbar {
					display: flex;
					gap: 0.5rem;
					margin-bottom: 1rem;
					padding-bottom: 1rem;
					border-bottom: 1px solid #eee;
				}
				.undo-toolbar button {
					padding: 0.5rem 1rem;
					border: 1px solid #ccc;
					border-radius: 4px;
					background: #f5f5f5;
					cursor: pointer;
				}
				.undo-toolbar button:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				.undo-toolbar button:not(:disabled):hover {
					background: #e5e5e5;
				}
				.bulk-btn {
					margin-left: auto;
					background: #e3f2fd !important;
					border-color: #90caf9 !important;
				}
				.form-fields {
					display: flex;
					flex-direction: column;
					gap: 1rem;
				}
				.field {
					display: flex;
					flex-direction: column;
					gap: 0.25rem;
				}
				.field label {
					font-weight: 500;
				}
				.field input, .field textarea {
					padding: 0.5rem;
					border: 1px solid #ccc;
					border-radius: 4px;
				}
				.dirty-indicator {
					color: #f57c00;
					font-weight: bold;
				}
				.hint {
					margin-top: 1rem;
					padding: 0.75rem;
					background: #f5f5f5;
					border-radius: 4px;
					font-size: 0.9rem;
				}
				.hint p {
					margin: 0.5rem 0;
				}
			`}</style>
		</div>
	)
}
