import type { EntityFields } from '@contember/bindx-react'
import type { Location } from '../../types.js'
import { TextInput, CoordinatePicker } from '../inputs/index.js'

/**
 * Location editor - knows about Location model structure
 * Receives the whole location fields object for encapsulated access
 */
export function LocationEditor({ fields }: { fields: EntityFields<Location> }) {
	return (
		<div className="location-editor">
			<h3>Location</h3>
			<TextInput field={fields.label} label="Label" />
			<CoordinatePicker lat={fields.lat} lng={fields.lng} />
		</div>
	)
}
