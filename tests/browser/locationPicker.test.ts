import { describe, test, expect, beforeAll, afterAll } from 'bun:test'
import { open, close, query, action } from './browser.js'

const URL = process.env['PLAYGROUND_URL'] ?? 'http://localhost:5180'

describe('Location Picker', () => {
	beforeAll(() => {
		open(URL)
	})

	afterAll(() => {
		close()
	})

	test('section renders', () => {
		expect(query.exists('location-picker')).toBe(true)
		expect(query.exists('location-select')).toBe(true)
	})

	test('no details shown initially', () => {
		expect(query.exists('location-details')).toBe(false)
	})

	test('selecting Tokyo shows location details', () => {
		action.select('location-select', 'Tokyo')

		expect(query.exists('location-details')).toBe(true)
		expect(query.text('location-selected-label')).toContain('Selected: Tokyo')
		expect(query.text('location-coordinates')).toContain('35.6762')
		expect(query.text('location-coordinates')).toContain('139.6503')
		expect(query.exists('location-maps-link')).toBe(true)
	})

	test('changing to London updates details', () => {
		action.select('location-select', 'London')

		expect(query.text('location-selected-label')).toContain('Selected: London')
		expect(query.text('location-coordinates')).toContain('51.5074')
	})

	test('selecting empty option hides details', () => {
		action.select('location-select', 'Choose a location')

		expect(query.exists('location-details')).toBe(false)
	})
})
