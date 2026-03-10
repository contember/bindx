/**
 * Shared test utilities barrel export
 *
 * @example
 * ```tsx
 * import {
 *   getByTestId,
 *   queryByTestId,
 *   createMockData,
 *   testSchema,
 *   schema,
 *   renderWithBindx,
 * } from '../shared'
 * ```
 */

// DOM query helpers
export {
	getByTestId,
	queryByTestId,
	getAllByTestId,
	createClientError,
} from './helpers'

// Schema definitions and entity defs
export {
	// Types
	type Author,
	type Tag,
	type Location,
	type Article,
	type TestSchema,
	type MinimalArticle,
	type MinimalAuthor,
	type MinimalSchema,
	type HasManyArticle,
	type HasManyTag,
	type HasManySchema,
	// Schemas
	testSchema,
	minimalSchema,
	hasManySchema,
	// Entity definitions for type-safe hooks
	schema,
	minimalEntityDefs,
	hasManyEntityDefs,
} from './schema'

// Mock data factories
export {
	createMockData,
	createHasOneMockData,
	createHasManyMockData,
	createEmptyMockData,
	createRelationMockData,
} from './mockData'

// Render utilities
export {
	renderWithBindx,
	createTestAdapter,
	type RenderWithBindxOptions,
	type RenderWithBindxResult,
} from './render'
