import { useState } from 'react'
import { useEntityList } from '../../bindx.js'

/**
 * Example: Location picker using useEntityList
 * Demonstrates a standalone select component pattern
 */
export function LocationSelectExample() {
	const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)

	const locations = useEntityList('Location', {}, e => e.id().label().lat().lng())

	if (locations.isLoading) {
		return <div>Loading locations...</div>
	}

	if (locations.isError) {
		return <div>Error: {locations.error.message}</div>
	}

	const selectedLocation = selectedLocationId
		? locations.items.find(item => item.id === selectedLocationId)?.data
		: null

	return (
		<div className="location-select-example">
			<h3>Location Picker</h3>

			<div className="field">
				<label>Select Location</label>
				<select
					value={selectedLocationId ?? ''}
					onChange={e => setSelectedLocationId(e.target.value || null)}
				>
					<option value="">Choose a location...</option>
					{locations.items.map(item => (
						<option key={item.key} value={item.id}>
							{item.data.label}
						</option>
					))}
				</select>
			</div>

			{selectedLocation && (
				<div className="location-details">
					<h4>Selected: {selectedLocation.label}</h4>
					<p>
						Coordinates: {selectedLocation.lat.toFixed(4)}, {selectedLocation.lng.toFixed(4)}
					</p>
					<p>
						<a
							href={`https://www.google.com/maps?q=${selectedLocation.lat},${selectedLocation.lng}`}
							target="_blank"
							rel="noopener noreferrer"
						>
							View on Google Maps
						</a>
					</p>
				</div>
			)}
		</div>
	)
}
