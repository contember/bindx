import './setup'
import { describe, test, expect, afterEach, mock } from 'bun:test'
import { render, cleanup, fireEvent } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import {
	UploaderStateContext,
	UploaderUploadFilesContext,
	UploaderOptionsContext,
	UploaderDropzoneRoot,
	UploaderDropzoneArea,
	useUploaderDropzoneState,
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

describe('UploaderDropzoneRoot', () => {
	test('renders children', () => {
		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot>
					<div data-testid="child">Child content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		expect(queryByTestId(container, 'child')).not.toBeNull()
		expect(getByTestId(container, 'child').textContent).toBe('Child content')
	})

	test('renders hidden file input by default', () => {
		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot>
					<div>Content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const input = container.querySelector('input[type="file"]')
		expect(input).not.toBeNull()
	})

	test('does not render file input when noInput is true', () => {
		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot noInput>
					<div>Content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const input = container.querySelector('input[type="file"]')
		expect(input).toBeNull()
	})

	test('provides dropzone state context', () => {
		let hasDropzoneState = false

		function DropzoneStateChecker() {
			const state = useUploaderDropzoneState()
			hasDropzoneState = state !== null && typeof state.getRootProps === 'function'
			return <div data-testid="checker">{hasDropzoneState ? 'has-state' : 'no-state'}</div>
		}

		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot>
					<DropzoneStateChecker />
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		expect(getByTestId(container, 'checker').textContent).toBe('has-state')
	})

	test('respects accept option', () => {
		const { container } = render(
			<UploaderTestProvider options={{ accept: { 'image/*': ['.png', '.jpg'] } }}>
				<UploaderDropzoneRoot>
					<div>Content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const input = container.querySelector('input[type="file"]') as HTMLInputElement
		expect(input).not.toBeNull()
		// react-dropzone sets accept attribute
		expect(input.accept).toContain('image/')
	})

	test('respects multiple option', () => {
		const { container } = render(
			<UploaderTestProvider options={{ multiple: true }}>
				<UploaderDropzoneRoot>
					<div>Content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const input = container.querySelector('input[type="file"]') as HTMLInputElement
		expect(input).not.toBeNull()
		expect(input.multiple).toBe(true)
	})

	test('single file mode by default', () => {
		const { container } = render(
			<UploaderTestProvider options={{ multiple: false }}>
				<UploaderDropzoneRoot>
					<div>Content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const input = container.querySelector('input[type="file"]') as HTMLInputElement
		expect(input).not.toBeNull()
		expect(input.multiple).toBe(false)
	})
})

describe('UploaderDropzoneArea', () => {
	test('applies root props to child element', () => {
		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot>
					<UploaderDropzoneArea>
						<div data-testid="dropzone-area">Drop here</div>
					</UploaderDropzoneArea>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const area = getByTestId(container, 'dropzone-area')
		// react-dropzone adds role and tabIndex
		expect(area.getAttribute('role')).toBe('presentation')
	})

	test('sets data attributes for drag states', () => {
		// Note: Testing actual drag states would require more complex mocking
		// Here we just verify the component renders correctly
		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot>
					<UploaderDropzoneArea>
						<div data-testid="dropzone-area">Drop here</div>
					</UploaderDropzoneArea>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const area = getByTestId(container, 'dropzone-area')
		// Initially not in drag state
		expect(area.getAttribute('data-dropzone-active')).toBeNull()
	})

	test('renders children correctly', () => {
		const { container } = render(
			<UploaderTestProvider>
				<UploaderDropzoneRoot>
					<UploaderDropzoneArea>
						<div data-testid="dropzone-content">
							<span>Drop files here</span>
							<button>Browse</button>
						</div>
					</UploaderDropzoneArea>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const content = getByTestId(container, 'dropzone-content')
		expect(content.querySelector('span')?.textContent).toBe('Drop files here')
		expect(content.querySelector('button')?.textContent).toBe('Browse')
	})
})

describe('Dropzone integration', () => {
	test('calls onUpload when files are dropped', async () => {
		const uploadedFiles: File[] = []
		const onUpload = (files: File[]) => {
			uploadedFiles.push(...files)
		}

		const { container } = render(
			<UploaderTestProvider onUpload={onUpload}>
				<UploaderDropzoneRoot>
					<UploaderDropzoneArea>
						<div data-testid="dropzone">Drop here</div>
					</UploaderDropzoneArea>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const dropzone = getByTestId(container, 'dropzone')
		const file = new File(['test content'], 'test.txt', { type: 'text/plain' })

		// Simulate drop event
		const dataTransfer = {
			files: [file],
			items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
			types: ['Files'],
		}

		fireEvent.drop(dropzone, { dataTransfer })

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100))

		expect(uploadedFiles.length).toBe(1)
		expect(uploadedFiles[0]?.name).toBe('test.txt')
	})

	test('calls onUpload when files are selected via input', async () => {
		const uploadedFiles: File[] = []
		const onUpload = (files: File[]) => {
			uploadedFiles.push(...files)
		}

		const { container } = render(
			<UploaderTestProvider onUpload={onUpload}>
				<UploaderDropzoneRoot>
					<div>Content</div>
				</UploaderDropzoneRoot>
			</UploaderTestProvider>,
		)

		const input = container.querySelector('input[type="file"]') as HTMLInputElement
		const file = new File(['test content'], 'test.txt', { type: 'text/plain' })

		// Simulate file selection
		Object.defineProperty(input, 'files', {
			value: [file],
			writable: false,
		})

		fireEvent.change(input)

		// Wait for async processing
		await new Promise(resolve => setTimeout(resolve, 100))

		expect(uploadedFiles.length).toBe(1)
		expect(uploadedFiles[0]?.name).toBe('test.txt')
	})
})
