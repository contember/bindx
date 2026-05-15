import { memo } from 'react'
import { Input } from '#bindx-ui/ui/input'
import {
	DataViewHasFilterType,
	DataViewTextFilterInput,
	QUERY_FILTER_NAME,
} from '@contember/bindx-dataview'
import { dict } from '../dict.js'

export const SelectDefaultFilter = memo((): React.ReactElement => (
	<DataViewHasFilterType name={QUERY_FILTER_NAME}>
		<DataViewTextFilterInput name={QUERY_FILTER_NAME}>
			<Input placeholder={dict.select.search} className={'w-full'} autoFocus inputSize={'sm'} />
		</DataViewTextFilterInput>
	</DataViewHasFilterType>
))
SelectDefaultFilter.displayName = 'SelectDefaultFilter'
