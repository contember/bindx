export {
	BindxProvider,
	useBackendAdapter,
	useSnapshotStore,
	useDispatcher,
	usePersistence,
	useBindxContext,
	useIdentityMap, // Legacy alias
	type BindxProviderProps,
	type BindxContextValue,
} from './BackendAdapterContext.js'

export {
	createBindx,
	type UseEntityOptions,
	type UseEntityListOptions,
	type LoadingEntityAccessor,
	type ErrorEntityAccessor,
	type ReadyEntityAccessor,
	type EntityAccessorResult,
	type EntityFields,
	type LoadingEntityListAccessor,
	type ErrorEntityListAccessor,
	type ReadyEntityListAccessor,
	type EntityListAccessorResult,
} from './createBindx.js'
