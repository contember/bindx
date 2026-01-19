import './setup'
import { describe, test, expect } from 'bun:test'
import { FIELD_REF_META } from '@contember/bindx'
import {
	UploaderWithMeta,
	MultiUploaderWithMeta,
	createImageFileType,
	createAnyFileType,
} from '../src/index.js'

// Helper to create mock HasOneRef with FIELD_REF_META
function createMockHasOneRef(fieldName: string, entityType = 'Image') {
	return {
		[FIELD_REF_META]: {
			entityType,
			entityId: 'test-entity-1',
			path: [fieldName],
			fieldName,
			isArray: false,
			isRelation: true,
		},
		$entity: {},
		$fields: {},
	}
}

// Helper to create mock HasManyRef with FIELD_REF_META
function createMockHasManyRef(fieldName: string, entityType = 'Image') {
	return {
		[FIELD_REF_META]: {
			entityType,
			entityId: 'test-entity-1',
			path: [fieldName],
			fieldName,
			isArray: true,
			isRelation: true,
		},
		items: [],
		length: 0,
		add: () => 'new-id',
		remove: () => {},
	}
}

// Helper to create mock EntityRef (without FIELD_REF_META)
function createMockEntityRef() {
	return {
		id: 'test-entity-1',
		$fields: {},
		$data: null,
	}
}

describe('UploaderWithMeta.getSelection', () => {
	const collectNested = () => ({ fields: new Map() })

	test('returns null when fileType has no extractors', () => {
		const mockEntity = createMockHasOneRef('image')
		const fileType = { extractors: [] }

		const result = UploaderWithMeta.getSelection(
			{ entity: mockEntity as any, fileType, children: null },
			collectNested,
		)

		expect(result).toBe(null)
	})

	test('returns null when entity is EntityRef (no FIELD_REF_META)', () => {
		const mockEntity = createMockEntityRef()
		const fileType = createImageFileType({
			urlField: 'url',
			widthField: 'width',
			heightField: 'height',
		})

		const result = UploaderWithMeta.getSelection(
			{ entity: mockEntity as any, fileType, children: null },
			collectNested,
		)

		expect(result).toBe(null)
	})

	test('returns SelectionFieldMeta for HasOneRef with extractors', () => {
		const mockEntity = createMockHasOneRef('image')
		const fileType = createImageFileType({
			urlField: 'url',
			widthField: 'width',
			heightField: 'height',
		})

		const result = UploaderWithMeta.getSelection(
			{ entity: mockEntity as any, fileType, children: null },
			collectNested,
		)

		expect(result).not.toBe(null)
		expect(result).toMatchObject({
			fieldName: 'image',
			alias: 'image',
			path: ['image'],
			isArray: false,
			isRelation: true,
		})

		// Check nested fields
		const nested = (result as any).nested
		expect(nested.fields.has('url')).toBe(true)
		expect(nested.fields.has('width')).toBe(true)
		expect(nested.fields.has('height')).toBe(true)
	})

	test('collects all field names from multiple extractors', () => {
		const mockEntity = createMockHasOneRef('coverImage')
		const fileType = createImageFileType({
			urlField: 'url',
			widthField: 'width',
			heightField: 'height',
			fileNameField: 'fileName',
			fileSizeField: 'fileSize',
			fileTypeField: 'mimeType',
		})

		const result = UploaderWithMeta.getSelection(
			{ entity: mockEntity as any, fileType, children: null },
			collectNested,
		)

		const nested = (result as any).nested
		expect(nested.fields.has('url')).toBe(true)
		expect(nested.fields.has('width')).toBe(true)
		expect(nested.fields.has('height')).toBe(true)
		expect(nested.fields.has('fileName')).toBe(true)
		expect(nested.fields.has('fileSize')).toBe(true)
		expect(nested.fields.has('mimeType')).toBe(true)
	})

	test('works with createAnyFileType', () => {
		const mockEntity = createMockHasOneRef('document')
		const fileType = createAnyFileType({
			urlField: 'url',
			fileNameField: 'name',
		})

		const result = UploaderWithMeta.getSelection(
			{ entity: mockEntity as any, fileType, children: null },
			collectNested,
		)

		expect(result).not.toBe(null)
		const nested = (result as any).nested
		expect(nested.fields.has('url')).toBe(true)
		expect(nested.fields.has('name')).toBe(true)
	})
})

describe('MultiUploaderWithMeta.getSelection', () => {
	const collectNested = () => ({ fields: new Map() })

	test('returns null when fileType has no extractors', () => {
		const mockField = createMockHasManyRef('images')
		const fileType = { extractors: [] }

		const result = MultiUploaderWithMeta.getSelection(
			{ field: mockField as any, fileType, children: null },
			collectNested,
		)

		expect(result).toBe(null)
	})

	test('returns SelectionFieldMeta for HasManyRef with extractors', () => {
		const mockField = createMockHasManyRef('images')
		const fileType = createImageFileType({
			urlField: 'url',
			widthField: 'width',
		})

		const result = MultiUploaderWithMeta.getSelection(
			{ field: mockField as any, fileType, children: null },
			collectNested,
		)

		expect(result).not.toBe(null)
		expect(result).toMatchObject({
			fieldName: 'images',
			alias: 'images',
			path: ['images'],
			isArray: true,
			isRelation: true,
		})

		// Check nested fields
		const nested = (result as any).nested
		expect(nested.fields.has('url')).toBe(true)
		expect(nested.fields.has('width')).toBe(true)
	})

	test('collects all field names from multiple extractors', () => {
		const mockField = createMockHasManyRef('gallery')
		const fileType = createImageFileType({
			urlField: 'url',
			widthField: 'width',
			heightField: 'height',
			fileNameField: 'originalName',
			fileSizeField: 'size',
		})

		const result = MultiUploaderWithMeta.getSelection(
			{ field: mockField as any, fileType, children: null },
			collectNested,
		)

		const nested = (result as any).nested
		expect(nested.fields.has('url')).toBe(true)
		expect(nested.fields.has('width')).toBe(true)
		expect(nested.fields.has('height')).toBe(true)
		expect(nested.fields.has('originalName')).toBe(true)
		expect(nested.fields.has('size')).toBe(true)
	})

	test('nested field selections have correct structure', () => {
		const mockField = createMockHasManyRef('photos')
		const fileType = createImageFileType({
			urlField: 'url',
		})

		const result = MultiUploaderWithMeta.getSelection(
			{ field: mockField as any, fileType, children: null },
			collectNested,
		)

		const nested = (result as any).nested
		const urlField = nested.fields.get('url')

		expect(urlField).toMatchObject({
			fieldName: 'url',
			alias: 'url',
			path: [],
			isArray: false,
			isRelation: false,
		})
	})
})
