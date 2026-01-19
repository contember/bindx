/**
 * Repeater components for has-many list management with Bindx
 *
 * @packageDocumentation
 */

// Types
export type {
	RepeaterAddItemIndex,
	RepeaterMoveItemIndex,
	RepeaterPreprocessCallback,
	RepeaterItemInfo,
	RepeaterItems,
	RepeaterMethods,
	RepeaterRenderFn,
	RepeaterProps,
} from './types.js'

// Hooks (internal, but exposed for advanced use cases)
export { useSortedItems } from './hooks/index.js'

// Utils
export {
	arrayMove,
	sortEntities,
	repairEntitiesOrder,
} from './utils/index.js'

// Components
export { Repeater, RepeaterWithMeta } from './components/index.js'
