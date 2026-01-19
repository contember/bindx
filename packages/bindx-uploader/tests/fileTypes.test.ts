import './setup'
import { describe, test, expect } from 'bun:test'
import {
	createImageFileType,
	createVideoFileType,
	createAudioFileType,
	createAnyFileType,
} from '../src/index.js'

describe('createImageFileType', () => {
	test('creates file type with default image accept', () => {
		const fileType = createImageFileType({ urlField: 'url' })

		expect(fileType.accept).toEqual({
			'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'],
		})
	})

	test('creates file type with custom accept', () => {
		const customAccept = { 'image/png': ['.png'] }
		const fileType = createImageFileType({
			urlField: 'url',
			accept: customAccept,
		})

		expect(fileType.accept).toEqual(customAccept)
	})

	test('includes all specified extractors', () => {
		const fileType = createImageFileType({
			urlField: 'url',
			widthField: 'width',
			heightField: 'height',
			fileNameField: 'fileName',
			fileSizeField: 'fileSize',
		})

		const allFieldNames = fileType.extractors?.flatMap(e => e.getFieldNames()) ?? []

		expect(allFieldNames).toContain('url')
		expect(allFieldNames).toContain('width')
		expect(allFieldNames).toContain('height')
		expect(allFieldNames).toContain('fileName')
		expect(allFieldNames).toContain('fileSize')
	})

	test('passes custom uploader', () => {
		const mockUploader = { upload: async () => ({ publicUrl: 'test' }) }
		const fileType = createImageFileType({
			urlField: 'url',
			uploader: mockUploader,
		})

		expect(fileType.uploader).toBe(mockUploader)
	})

	test('passes acceptFile validator', () => {
		const validator = () => true
		const fileType = createImageFileType({
			urlField: 'url',
			acceptFile: validator,
		})

		expect(fileType.acceptFile).toBe(validator)
	})

	test('includes additional extractors', () => {
		const customExtractor = {
			getFieldNames: () => ['customField'],
		}
		const fileType = createImageFileType({
			urlField: 'url',
			extractors: [customExtractor],
		})

		const allFieldNames = fileType.extractors?.flatMap(e => e.getFieldNames()) ?? []
		expect(allFieldNames).toContain('customField')
	})
})

describe('createVideoFileType', () => {
	test('creates file type with default video accept', () => {
		const fileType = createVideoFileType({ urlField: 'url' })

		expect(fileType.accept).toEqual({
			'video/*': ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.wmv', '.mkv', '.3gp'],
		})
	})

	test('includes video-specific extractors', () => {
		const fileType = createVideoFileType({
			urlField: 'url',
			widthField: 'width',
			heightField: 'height',
			durationField: 'duration',
		})

		const allFieldNames = fileType.extractors?.flatMap(e => e.getFieldNames()) ?? []

		expect(allFieldNames).toContain('url')
		expect(allFieldNames).toContain('width')
		expect(allFieldNames).toContain('height')
		expect(allFieldNames).toContain('duration')
	})
})

describe('createAudioFileType', () => {
	test('creates file type with default audio accept', () => {
		const fileType = createAudioFileType({ urlField: 'url' })

		expect(fileType.accept).toEqual({
			'audio/*': ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma', '.aiff'],
		})
	})

	test('includes audio-specific extractors', () => {
		const fileType = createAudioFileType({
			urlField: 'url',
			durationField: 'duration',
		})

		const allFieldNames = fileType.extractors?.flatMap(e => e.getFieldNames()) ?? []

		expect(allFieldNames).toContain('url')
		expect(allFieldNames).toContain('duration')
	})
})

describe('createAnyFileType', () => {
	test('creates file type with undefined accept (any file)', () => {
		const fileType = createAnyFileType({ urlField: 'url' })

		expect(fileType.accept).toBe(undefined)
	})

	test('includes generic metadata extractors', () => {
		const fileType = createAnyFileType({
			urlField: 'url',
			fileNameField: 'fileName',
			fileSizeField: 'fileSize',
			fileTypeField: 'mimeType',
		})

		const allFieldNames = fileType.extractors?.flatMap(e => e.getFieldNames()) ?? []

		expect(allFieldNames).toContain('url')
		expect(allFieldNames).toContain('fileName')
		expect(allFieldNames).toContain('fileSize')
		expect(allFieldNames).toContain('mimeType')
	})
})
