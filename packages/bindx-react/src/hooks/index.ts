export {
	BindxProvider,
	useBackendAdapter,
	useSnapshotStore,
	useDispatcher,
	useBatchPersister,
	useBindxContext,
	type BindxProviderProps,
	type BindxContextValue,
} from './BackendAdapterContext.js'

export {
	usePersist,
	usePersistEntity,
	type PersistApi,
	type EntityPersistApi,
	type AnyRefWithMeta,
} from './usePersist.js'

export {
	createBindx,
	type UseEntityOptions,
	type UseEntityListOptions,
	type LoadingEntityAccessor,
	type ErrorEntityAccessor,
	type NotFoundEntityAccessor,
	type ReadyEntityAccessor,
	type EntityAccessorResult,
	type EntityFields,
	type LoadingEntityListAccessor,
	type ErrorEntityListAccessor,
	type ReadyEntityListAccessor,
	type EntityListAccessorResult,
} from './createBindx.js'

export {
	ContemberBindxProvider,
} from './ContemberBindxProvider.js'

export { useUndo, type UndoHookResult } from './useUndo.js'

export {
	useOnEvent,
	useOnEntityEvent,
	useOnFieldEvent,
	useIntercept,
	useInterceptEntity,
	useInterceptField,
} from './useBindxEvents.js'

export { useEntityBeforePersist } from './useEntityBeforePersist.js'

export {
	useEntityErrors,
	type EntityErrorsState,
} from './useErrors.js'
