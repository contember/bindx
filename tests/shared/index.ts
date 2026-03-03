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
 *   useEntity,
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

// Schema definitions and typed hooks
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
	// Typed hooks from testSchema
	useEntity,
	useEntityList,
	Entity,
	// Bindx instances for other schemas
	minimalBindx,
	hasManyBindx,
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
