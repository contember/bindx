// Input components (model-unaware)
export { TextInput, NumberInput, CoordinatePicker, Select } from './inputs/index.js'

// Editor components (model-aware fragments)
export { AuthorEditor, LocationEditor, TagEditor, TagListEditor, AuthorSelect, AuthorSelectWithEmail } from './editors/index.js'

// Article components
export { ArticleEditor, ArticleView } from './articles/index.js'

// Example components demonstrating various patterns
export {
	AuthorListExample,
	TagListExample,
	ArticleWithAuthorSelectExample,
	LocationSelectExample,
	RichTextEditorExample,
	BlockEditorExample,
	SimpleBlockEditorExample,
	DataGridExample,
	HasManyDataGridExample,
} from './examples/index.js'

// Undo/Redo demo
export { UndoDemo } from './UndoDemo.js'
