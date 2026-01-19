import './setup'
import { describe, test, expect } from 'bun:test'
import {
	getFileUrlDataExtractor,
	getGenericFileMetadataExtractor,
	getImageFileDataExtractor,
	getVideoFileDataExtractor,
	getAudioFileDataExtractor,
} from '../src/index.js'

describe('Extractors - getFieldNames', () => {
	describe('getFileUrlDataExtractor', () => {
		test('returns urlField', () => {
			const extractor = getFileUrlDataExtractor({ urlField: 'url' })
			expect(extractor.getFieldNames()).toEqual(['url'])
		})
	})

	describe('getGenericFileMetadataExtractor', () => {
		test('returns all specified fields', () => {
			const extractor = getGenericFileMetadataExtractor({
				fileNameField: 'fileName',
				fileSizeField: 'fileSize',
				fileTypeField: 'mimeType',
				lastModifiedField: 'lastModified',
			})
			expect(extractor.getFieldNames()).toEqual(['fileName', 'fileSize', 'mimeType', 'lastModified'])
		})

		test('returns only specified fields', () => {
			const extractor = getGenericFileMetadataExtractor({
				fileNameField: 'fileName',
				fileSizeField: 'fileSize',
			})
			expect(extractor.getFieldNames()).toEqual(['fileName', 'fileSize'])
		})

		test('returns empty array when no fields specified', () => {
			const extractor = getGenericFileMetadataExtractor({})
			expect(extractor.getFieldNames()).toEqual([])
		})
	})

	describe('getImageFileDataExtractor', () => {
		test('returns width and height fields', () => {
			const extractor = getImageFileDataExtractor({
				widthField: 'width',
				heightField: 'height',
			})
			expect(extractor.getFieldNames()).toEqual(['width', 'height'])
		})

		test('returns only width field', () => {
			const extractor = getImageFileDataExtractor({
				widthField: 'width',
			})
			expect(extractor.getFieldNames()).toEqual(['width'])
		})

		test('returns empty array when no fields specified', () => {
			const extractor = getImageFileDataExtractor({})
			expect(extractor.getFieldNames()).toEqual([])
		})
	})

	describe('getVideoFileDataExtractor', () => {
		test('returns all fields', () => {
			const extractor = getVideoFileDataExtractor({
				widthField: 'width',
				heightField: 'height',
				durationField: 'duration',
			})
			expect(extractor.getFieldNames()).toEqual(['width', 'height', 'duration'])
		})

		test('returns only specified fields', () => {
			const extractor = getVideoFileDataExtractor({
				durationField: 'duration',
			})
			expect(extractor.getFieldNames()).toEqual(['duration'])
		})

		test('returns empty array when no fields specified', () => {
			const extractor = getVideoFileDataExtractor({})
			expect(extractor.getFieldNames()).toEqual([])
		})
	})

	describe('getAudioFileDataExtractor', () => {
		test('returns duration field', () => {
			const extractor = getAudioFileDataExtractor({
				durationField: 'duration',
			})
			expect(extractor.getFieldNames()).toEqual(['duration'])
		})

		test('returns empty array when no field specified', () => {
			const extractor = getAudioFileDataExtractor({})
			expect(extractor.getFieldNames()).toEqual([])
		})
	})
})

describe('Extractors - populateFields', () => {
	test('getFileUrlDataExtractor populates URL field', () => {
		const extractor = getFileUrlDataExtractor({ urlField: 'url' })

		let capturedValue: unknown = undefined
		const mockEntity = {
			$fields: {
				url: {
					setValue: (value: unknown) => {
						capturedValue = value
					},
				},
			},
		}

		extractor.populateFields?.({
			entity: mockEntity as any,
			result: { publicUrl: 'https://example.com/image.jpg' },
		})

		expect(capturedValue).toBe('https://example.com/image.jpg')
	})

	test('getGenericFileMetadataExtractor populates metadata fields', () => {
		const extractor = getGenericFileMetadataExtractor({
			fileNameField: 'fileName',
			fileSizeField: 'fileSize',
			fileTypeField: 'mimeType',
		})

		const capturedValues: Record<string, unknown> = {}
		const mockEntity = {
			$fields: {
				fileName: { setValue: (v: unknown) => { capturedValues['fileName'] = v } },
				fileSize: { setValue: (v: unknown) => { capturedValues['fileSize'] = v } },
				mimeType: { setValue: (v: unknown) => { capturedValues['mimeType'] = v } },
			},
		}

		const mockFile = new File(['content'], 'test.jpg', { type: 'image/jpeg' })

		const populator = extractor.extractFileData?.({
			id: 'file-1',
			file: mockFile,
			previewUrl: 'blob:...',
			abortController: new AbortController(),
		})

		if (typeof populator === 'function') {
			populator({
				entity: mockEntity as any,
				result: { publicUrl: 'https://example.com/test.jpg' },
			})
		}

		expect(capturedValues['fileName']).toBe('test.jpg')
		expect(capturedValues['fileSize']).toBe(7) // 'content'.length
		expect(capturedValues['mimeType']).toBe('image/jpeg')
	})
})
