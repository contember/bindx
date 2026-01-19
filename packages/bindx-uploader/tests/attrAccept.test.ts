import './setup'
import { describe, test, expect } from 'bun:test'
import { attrAccept, acceptToString } from '../src/index.js'

describe('attrAccept', () => {
	describe('with no accept specification', () => {
		test('accepts any file when accept is undefined', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, undefined)).toBe(true)
		})

		test('accepts any file when accept is empty string', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, '')).toBe(true)
		})

		test('accepts any file when accept is empty array', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, [])).toBe(true)
		})

		test('accepts any file when accept is empty object', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, {})).toBe(true)
		})
	})

	describe('with extension matching', () => {
		test('accepts file with matching extension', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, '.png')).toBe(true)
		})

		test('rejects file with non-matching extension', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, '.jpg')).toBe(false)
		})

		test('extension matching is case-insensitive', () => {
			const file = { type: 'image/png', name: 'test.PNG' }
			expect(attrAccept(file, '.png')).toBe(true)
		})

		test('accepts file with one of multiple extensions', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, ['.jpg', '.png', '.gif'])).toBe(true)
		})
	})

	describe('with MIME type matching', () => {
		test('accepts file with exact MIME type', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, 'image/png')).toBe(true)
		})

		test('rejects file with non-matching MIME type', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, 'image/jpeg')).toBe(false)
		})

		test('MIME type matching is case-insensitive', () => {
			const file = { type: 'IMAGE/PNG', name: 'test.png' }
			expect(attrAccept(file, 'image/png')).toBe(true)
		})
	})

	describe('with wildcard MIME type', () => {
		test('accepts any image with image/*', () => {
			expect(attrAccept({ type: 'image/png', name: 'test.png' }, 'image/*')).toBe(true)
			expect(attrAccept({ type: 'image/jpeg', name: 'test.jpg' }, 'image/*')).toBe(true)
			expect(attrAccept({ type: 'image/gif', name: 'test.gif' }, 'image/*')).toBe(true)
		})

		test('rejects non-image with image/*', () => {
			expect(attrAccept({ type: 'video/mp4', name: 'test.mp4' }, 'image/*')).toBe(false)
			expect(attrAccept({ type: 'application/pdf', name: 'test.pdf' }, 'image/*')).toBe(false)
		})

		test('accepts any video with video/*', () => {
			expect(attrAccept({ type: 'video/mp4', name: 'test.mp4' }, 'video/*')).toBe(true)
			expect(attrAccept({ type: 'video/webm', name: 'test.webm' }, 'video/*')).toBe(true)
		})

		test('accepts any audio with audio/*', () => {
			expect(attrAccept({ type: 'audio/mpeg', name: 'test.mp3' }, 'audio/*')).toBe(true)
			expect(attrAccept({ type: 'audio/wav', name: 'test.wav' }, 'audio/*')).toBe(true)
		})
	})

	describe('with string accept (comma-separated)', () => {
		test('accepts file matching one of comma-separated values', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, 'image/jpeg, image/png, image/gif')).toBe(true)
		})

		test('handles mixed extensions and MIME types', () => {
			const file = { type: 'image/png', name: 'test.png' }
			expect(attrAccept(file, '.jpg, image/png')).toBe(true)
		})
	})

	describe('with Record<string, string[]> accept', () => {
		test('accepts file matching MIME type key', () => {
			const file = { type: 'image/png', name: 'test.png' }
			const accept = { 'image/png': ['.png'] }
			expect(attrAccept(file, accept)).toBe(true)
		})

		test('accepts file matching extension in values', () => {
			const file = { type: 'application/octet-stream', name: 'test.png' }
			const accept = { 'image/png': ['.png'] }
			expect(attrAccept(file, accept)).toBe(true)
		})

		test('accepts file with wildcard MIME key', () => {
			const file = { type: 'image/webp', name: 'test.webp' }
			const accept = { 'image/*': ['.png', '.jpg', '.webp'] }
			expect(attrAccept(file, accept)).toBe(true)
		})
	})

	describe('edge cases', () => {
		test('handles file with no extension', () => {
			const file = { type: 'image/png', name: 'test' }
			expect(attrAccept(file, '.png')).toBe(false)
			expect(attrAccept(file, 'image/png')).toBe(true)
		})

		test('handles file with multiple dots in name', () => {
			const file = { type: 'image/png', name: 'test.backup.png' }
			expect(attrAccept(file, '.png')).toBe(true)
		})

		test('handles file with empty type', () => {
			const file = { type: '', name: 'test.png' }
			expect(attrAccept(file, '.png')).toBe(true)
			expect(attrAccept(file, 'image/png')).toBe(false)
		})
	})
})

describe('acceptToString', () => {
	test('returns undefined for undefined input', () => {
		expect(acceptToString(undefined)).toBe(undefined)
	})

	test('converts Record to comma-separated string', () => {
		const accept = {
			'image/png': ['.png'],
			'image/jpeg': ['.jpg', '.jpeg'],
		}
		const result = acceptToString(accept)
		expect(result).toContain('image/png')
		expect(result).toContain('.png')
		expect(result).toContain('image/jpeg')
		expect(result).toContain('.jpg')
		expect(result).toContain('.jpeg')
	})

	test('handles empty record', () => {
		expect(acceptToString({})).toBe('')
	})
})
