import { test, expect } from 'bun:test'
import { browserTest, el } from './browser.js'

browserTest('Location Picker', () => {
	test('section renders', () => {
		expect(el('location-picker').exists).toBe(true)
		expect(el('location-select').exists).toBe(true)
	})

	test('no details shown initially', () => {
		expect(el('location-details').exists).toBe(false)
	})

	test('selecting Tokyo shows location details', () => {
		el('location-select').select('Tokyo')

		expect(el('location-details').exists).toBe(true)
		expect(el('location-selected-label').text).toContain('Selected: Tokyo')
		expect(el('location-coordinates').text).toContain('35.6762')
		expect(el('location-coordinates').text).toContain('139.6503')
		expect(el('location-maps-link').exists).toBe(true)
	})

	test('changing to London updates details', () => {
		el('location-select').select('London')

		expect(el('location-selected-label').text).toContain('Selected: London')
		expect(el('location-coordinates').text).toContain('51.5074')
	})

	test('selecting empty option hides details', () => {
		el('location-select').select('Choose a location')

		expect(el('location-details').exists).toBe(false)
	})
})
