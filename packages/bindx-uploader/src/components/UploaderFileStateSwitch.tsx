import type { ReactNode, ComponentType } from 'react'
import type {
	UploaderFileState,
	UploaderFileStateInitial,
	UploaderFileStateUploading,
	UploaderFileStateFinalizing,
	UploaderFileStateSuccess,
	UploaderFileStateError,
} from '../types.js'
import { useUploaderFileState } from '../contexts.js'

type StateRenderer<TState> = ReactNode | ComponentType<{ state: TState }>

export interface UploaderFileStateSwitchProps {
	/** Render for initial state (file selected, pre-upload) */
	initial?: StateRenderer<UploaderFileStateInitial>
	/** Render for uploading state */
	uploading?: StateRenderer<UploaderFileStateUploading>
	/** Render for finalizing state (upload complete, processing) */
	finalizing?: StateRenderer<UploaderFileStateFinalizing>
	/** Render for success state */
	success?: StateRenderer<UploaderFileStateSuccess>
	/** Render for error state */
	error?: StateRenderer<UploaderFileStateError>
}

function renderState<TState>(
	renderer: StateRenderer<TState> | undefined,
	state: TState,
): ReactNode {
	if (renderer === undefined) {
		return null
	}
	if (typeof renderer === 'function') {
		const Component = renderer as ComponentType<{ state: TState }>
		return <Component state={state} />
	}
	return renderer
}

/**
 * Renders different content based on the current file upload state.
 * Must be used within UploaderEachFile or another component that provides UploaderFileStateContext.
 */
export function UploaderFileStateSwitch({
	initial,
	uploading,
	finalizing,
	success,
	error,
}: UploaderFileStateSwitchProps): ReactNode {
	const state = useUploaderFileState()

	switch (state.state) {
		case 'initial':
			return renderState(initial, state)
		case 'uploading':
			return renderState(uploading, state)
		case 'finalizing':
			return renderState(finalizing, state)
		case 'success':
			return renderState(success, state)
		case 'error':
			return renderState(error, state)
	}
}
