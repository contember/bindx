import './setup'
import { describe, test, expect, afterEach } from 'bun:test'
import { render, cleanup, act } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import {
	UploaderStateContext,
	UploaderUploadFilesContext,
	UploaderOptionsContext,
	UploaderFileStateContext,
	UploaderEachFile,
	UploaderHasFile,
	UploaderFileStateSwitch,
	type UploaderFileState,
	type UploaderState,
	type UploaderOptions,
} from '../src/index.js'

afterEach(() => {
	cleanup()
})

// Helper to query by data-testid
function getByTestId(container: Element, testId: string): Element {
	const el = container.querySelector(`[data-testid="${testId}"]`)
	if (!el) throw new Error(`Element with data-testid="${testId}" not found`)
	return el
}

function queryByTestId(container: Element, testId: string): Element | null {
	return container.querySelector(`[data-testid="${testId}"]`)
}

// Helper to create mock file state
function createMockFileState(
	id: string,
	state: UploaderFileState['state'],
	overrides: Partial<UploaderFileState> = {},
): UploaderFileState {
	const file = new File(['content'], `${id}.jpg`, { type: 'image/jpeg' })
	const fileWithMeta = {
		id,
		file,
		previewUrl: `blob:${id}`,
		abortController: new AbortController(),
	}

	const baseState = {
		file: fileWithMeta,
	}

	switch (state) {
		case 'initial':
			return { ...baseState, state: 'initial', ...overrides } as UploaderFileState
		case 'uploading':
			return {
				...baseState,
				state: 'uploading',
				progress: { progress: 50, uploadedBytes: 50, totalBytes: 100 },
				...overrides,
			} as UploaderFileState
		case 'finalizing':
			return {
				...baseState,
				state: 'finalizing',
				result: { publicUrl: 'https://example.com/file.jpg' },
				...overrides,
			} as UploaderFileState
		case 'success':
			return {
				...baseState,
				state: 'success',
				result: { publicUrl: 'https://example.com/file.jpg' },
				dismiss: () => {},
				...overrides,
			} as UploaderFileState
		case 'error':
			return {
				...baseState,
				state: 'error',
				error: new Error('Upload failed'),
				dismiss: () => {},
				...overrides,
			} as UploaderFileState
	}
}

// Test provider wrapper
interface UploaderTestProviderProps {
	children: ReactNode
	files?: UploaderState
	options?: Partial<UploaderOptions>
	onUpload?: (files: File[]) => void
}

function UploaderTestProvider({
	children,
	files = [],
	options = {},
	onUpload = () => {},
}: UploaderTestProviderProps): ReactNode {
	const fullOptions: UploaderOptions = {
		accept: undefined,
		multiple: false,
		...options,
	}

	return (
		<UploaderStateContext.Provider value={files}>
			<UploaderUploadFilesContext.Provider value={onUpload}>
				<UploaderOptionsContext.Provider value={fullOptions}>
					{children}
				</UploaderOptionsContext.Provider>
			</UploaderUploadFilesContext.Provider>
		</UploaderStateContext.Provider>
	)
}

describe('UploaderEachFile', () => {
	test('renders nothing when no files', () => {
		const { container } = render(
			<UploaderTestProvider files={[]}>
				<UploaderEachFile>
					<div data-testid="file-item">Item</div>
				</UploaderEachFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'file-item')).toBeNull()
	})

	test('renders fallback when no files', () => {
		const { container } = render(
			<UploaderTestProvider files={[]}>
				<UploaderEachFile fallback={<div data-testid="fallback">No files</div>}>
					<div data-testid="file-item">Item</div>
				</UploaderEachFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'fallback')).not.toBeNull()
		expect(getByTestId(container, 'fallback').textContent).toBe('No files')
	})

	test('renders children for each file', () => {
		const files = [
			createMockFileState('file-1', 'uploading'),
			createMockFileState('file-2', 'success'),
		]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderEachFile>
					<div data-testid="file-item">Item</div>
				</UploaderEachFile>
			</UploaderTestProvider>,
		)

		const items = container.querySelectorAll('[data-testid="file-item"]')
		expect(items.length).toBe(2)
	})

	test('filters files by state', () => {
		const files = [
			createMockFileState('file-1', 'uploading'),
			createMockFileState('file-2', 'success'),
			createMockFileState('file-3', 'error'),
		]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderEachFile state="uploading">
					<div data-testid="uploading-item">Uploading</div>
				</UploaderEachFile>
			</UploaderTestProvider>,
		)

		const items = container.querySelectorAll('[data-testid="uploading-item"]')
		expect(items.length).toBe(1)
	})

	test('filters files by multiple states', () => {
		const files = [
			createMockFileState('file-1', 'uploading'),
			createMockFileState('file-2', 'success'),
			createMockFileState('file-3', 'error'),
		]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderEachFile state={['uploading', 'success']}>
					<div data-testid="item">Item</div>
				</UploaderEachFile>
			</UploaderTestProvider>,
		)

		const items = container.querySelectorAll('[data-testid="item"]')
		expect(items.length).toBe(2)
	})

	test('provides file state context to children', () => {
		const files = [createMockFileState('file-1', 'uploading')]

		function FileStateDisplay() {
			const state = React.useContext(UploaderFileStateContext)
			if (!state) return null
			return <div data-testid="state">{state.state}</div>
		}

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderEachFile>
					<FileStateDisplay />
				</UploaderEachFile>
			</UploaderTestProvider>,
		)

		expect(getByTestId(container, 'state').textContent).toBe('uploading')
	})
})

describe('UploaderHasFile', () => {
	test('renders children when files exist', () => {
		const files = [createMockFileState('file-1', 'uploading')]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderHasFile>
					<div data-testid="content">Has files</div>
				</UploaderHasFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'content')).not.toBeNull()
	})

	test('renders nothing when no files', () => {
		const { container } = render(
			<UploaderTestProvider files={[]}>
				<UploaderHasFile>
					<div data-testid="content">Has files</div>
				</UploaderHasFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'content')).toBeNull()
	})

	test('renders fallback when no files', () => {
		const { container } = render(
			<UploaderTestProvider files={[]}>
				<UploaderHasFile fallback={<div data-testid="fallback">No files</div>}>
					<div data-testid="content">Has files</div>
				</UploaderHasFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'fallback')).not.toBeNull()
		expect(queryByTestId(container, 'content')).toBeNull()
	})

	test('filters by state - has matching files', () => {
		const files = [
			createMockFileState('file-1', 'uploading'),
			createMockFileState('file-2', 'success'),
		]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderHasFile state="uploading">
					<div data-testid="content">Has uploading files</div>
				</UploaderHasFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'content')).not.toBeNull()
	})

	test('filters by state - no matching files', () => {
		const files = [createMockFileState('file-1', 'success')]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderHasFile state="uploading">
					<div data-testid="content">Has uploading files</div>
				</UploaderHasFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'content')).toBeNull()
	})

	test('filters by multiple states', () => {
		const files = [createMockFileState('file-1', 'error')]

		const { container } = render(
			<UploaderTestProvider files={files}>
				<UploaderHasFile state={['uploading', 'error']}>
					<div data-testid="content">Has files in progress or error</div>
				</UploaderHasFile>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'content')).not.toBeNull()
	})
})

describe('UploaderFileStateSwitch', () => {
	function renderWithFileState(fileState: UploaderFileState, children: ReactNode) {
		return render(
			<UploaderFileStateContext.Provider value={fileState}>
				{children}
			</UploaderFileStateContext.Provider>,
		)
	}

	test('renders initial content for initial state', () => {
		const fileState = createMockFileState('file-1', 'initial')

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				initial={<div data-testid="initial">Initial</div>}
				uploading={<div data-testid="uploading">Uploading</div>}
			/>,
		)

		expect(queryByTestId(container, 'initial')).not.toBeNull()
		expect(queryByTestId(container, 'uploading')).toBeNull()
	})

	test('renders uploading content for uploading state', () => {
		const fileState = createMockFileState('file-1', 'uploading')

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				initial={<div data-testid="initial">Initial</div>}
				uploading={<div data-testid="uploading">Uploading</div>}
			/>,
		)

		expect(queryByTestId(container, 'initial')).toBeNull()
		expect(queryByTestId(container, 'uploading')).not.toBeNull()
	})

	test('renders finalizing content for finalizing state', () => {
		const fileState = createMockFileState('file-1', 'finalizing')

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				uploading={<div data-testid="uploading">Uploading</div>}
				finalizing={<div data-testid="finalizing">Finalizing</div>}
			/>,
		)

		expect(queryByTestId(container, 'uploading')).toBeNull()
		expect(queryByTestId(container, 'finalizing')).not.toBeNull()
	})

	test('renders success content for success state', () => {
		const fileState = createMockFileState('file-1', 'success')

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				uploading={<div data-testid="uploading">Uploading</div>}
				success={<div data-testid="success">Success</div>}
			/>,
		)

		expect(queryByTestId(container, 'uploading')).toBeNull()
		expect(queryByTestId(container, 'success')).not.toBeNull()
	})

	test('renders error content for error state', () => {
		const fileState = createMockFileState('file-1', 'error')

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				uploading={<div data-testid="uploading">Uploading</div>}
				error={<div data-testid="error">Error</div>}
			/>,
		)

		expect(queryByTestId(container, 'uploading')).toBeNull()
		expect(queryByTestId(container, 'error')).not.toBeNull()
	})

	test('renders nothing for unhandled state', () => {
		const fileState = createMockFileState('file-1', 'success')

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				uploading={<div data-testid="uploading">Uploading</div>}
				error={<div data-testid="error">Error</div>}
			/>,
		)

		expect(queryByTestId(container, 'uploading')).toBeNull()
		expect(queryByTestId(container, 'error')).toBeNull()
	})

	test('accepts component as renderer', () => {
		const fileState = createMockFileState('file-1', 'uploading', {
			progress: { progress: 75, uploadedBytes: 75, totalBytes: 100 },
		})

		function UploadingDisplay({ state }: { state: typeof fileState }) {
			if (state.state !== 'uploading') return null
			return <div data-testid="progress">{state.progress.progress}%</div>
		}

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				uploading={UploadingDisplay}
			/>,
		)

		expect(getByTestId(container, 'progress').textContent).toBe('75%')
	})

	test('passes correct state to component renderer', () => {
		const fileState = createMockFileState('file-1', 'error', {
			error: new Error('Test error'),
		})

		function ErrorDisplay({ state }: { state: typeof fileState }) {
			if (state.state !== 'error') return null
			const error = state.error as Error
			return <div data-testid="error-message">{error.message}</div>
		}

		const { container } = renderWithFileState(
			fileState,
			<UploaderFileStateSwitch
				error={ErrorDisplay}
			/>,
		)

		expect(getByTestId(container, 'error-message').textContent).toBe('Test error')
	})
})

describe('Uploader contexts', () => {
	test('useUploaderState returns files from context', () => {
		const files = [
			createMockFileState('file-1', 'uploading'),
			createMockFileState('file-2', 'success'),
		]

		let capturedFiles: UploaderState = []

		function Consumer() {
			capturedFiles = React.useContext(UploaderStateContext) ?? []
			return null
		}

		render(
			<UploaderStateContext.Provider value={files}>
				<Consumer />
			</UploaderStateContext.Provider>,
		)

		expect(capturedFiles.length).toBe(2)
		expect(capturedFiles[0]?.state).toBe('uploading')
		expect(capturedFiles[1]?.state).toBe('success')
	})

	test('useUploaderUploadFiles returns upload function from context', () => {
		const uploadedFiles: File[] = []
		const onUpload = (files: File[]) => {
			uploadedFiles.push(...files)
		}

		let capturedUploadFn: ((files: File[]) => void) | null = null

		function Consumer() {
			capturedUploadFn = React.useContext(UploaderUploadFilesContext)
			return null
		}

		render(
			<UploaderUploadFilesContext.Provider value={onUpload}>
				<Consumer />
			</UploaderUploadFilesContext.Provider>,
		)

		expect(capturedUploadFn).not.toBeNull()

		const testFile = new File(['test'], 'test.txt', { type: 'text/plain' })
		capturedUploadFn!([testFile])

		expect(uploadedFiles.length).toBe(1)
		expect(uploadedFiles[0]?.name).toBe('test.txt')
	})

	test('useUploaderOptions returns options from context', () => {
		const options: UploaderOptions = {
			accept: { 'image/*': ['.png', '.jpg'] },
			multiple: true,
		}

		let capturedOptions: UploaderOptions | null = null

		function Consumer() {
			capturedOptions = React.useContext(UploaderOptionsContext)
			return null
		}

		render(
			<UploaderOptionsContext.Provider value={options}>
				<Consumer />
			</UploaderOptionsContext.Provider>,
		)

		expect(capturedOptions).not.toBeNull()
		expect(capturedOptions!.multiple).toBe(true)
		expect(capturedOptions!.accept).toEqual({ 'image/*': ['.png', '.jpg'] })
	})
})
