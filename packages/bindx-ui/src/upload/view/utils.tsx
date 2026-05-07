export const formatBytes = (bytes: number, decimals = 1): string => {
	if (bytes === 0) return '0 Bytes'
	const k = 1024
	const dm = decimals + 1 || 3
	const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

export const formatDuration = (duration: number): string => {
	const minutes = Math.floor(duration / 60)
	const seconds = Math.floor(duration % 60)
	return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export const formatDate = (date: string | Date | null): string | null => {
	if (date === null) {
		return null
	}
	const d = typeof date === 'string' ? new Date(date) : date
	return d.toLocaleDateString()
}

export const truncateUrl = (url: string, maxLength = 30): string => {
	if (url.length <= maxLength) return url
	const half = Math.floor((maxLength - 1) / 2)
	return `${url.slice(0, half)}…${url.slice(-half)}`
}
