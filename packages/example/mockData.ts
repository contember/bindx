import type { MockDataStore } from '@contember/bindx-react'

/**
 * Example mock data for testing
 */
export const mockData: MockDataStore = {
	Article: {
		'article-1': {
			id: 'article-1',
			title: 'Introduction to React',
			content: 'React is a JavaScript library for building user interfaces...',
			publishedAt: '2024-01-15',
			author: {
				id: 'author-1',
				name: 'John Doe',
				email: 'john@example.com',
				bio: 'Senior developer at Example Corp',
			},
			location: {
				id: 'location-1',
				lat: 40.7128,
				lng: -74.006,
				label: 'New York',
			},
			tags: [
				{ id: 'tag-1', name: 'React', color: '#61dafb' },
				{ id: 'tag-2', name: 'JavaScript', color: '#f7df1e' },
			],
		},
		'article-2': {
			id: 'article-2',
			title: 'TypeScript Best Practices',
			content: 'TypeScript adds static typing to JavaScript...',
			publishedAt: '2024-02-20',
			author: {
				id: 'author-2',
				name: 'Jane Smith',
				email: 'jane@example.com',
				bio: 'TypeScript enthusiast',
			},
			location: {
				id: 'location-2',
				lat: 51.5074,
				lng: -0.1278,
				label: 'London',
			},
			tags: [
				{ id: 'tag-3', name: 'TypeScript', color: '#3178c6' },
				{ id: 'tag-2', name: 'JavaScript', color: '#f7df1e' },
			],
		},
	},
	Author: {
		'author-1': {
			id: 'author-1',
			name: 'John Doe',
			email: 'john@example.com',
			bio: 'Senior developer at Example Corp',
		},
		'author-2': {
			id: 'author-2',
			name: 'Jane Smith',
			email: 'jane@example.com',
			bio: 'TypeScript enthusiast',
		},
		'author-3': {
			id: 'author-3',
			name: 'Bob Wilson',
			email: 'bob@example.com',
			bio: 'Full-stack developer',
		},
		'author-4': {
			id: 'author-4',
			name: 'Alice Brown',
			email: 'alice@example.com',
			bio: 'Frontend architect',
		},
		'author-5': {
			id: 'author-5',
			name: 'Charlie Davis',
			email: 'charlie@example.com',
			bio: 'DevOps engineer',
		},
	},
	Tag: {
		'tag-1': { id: 'tag-1', name: 'React', color: '#61dafb' },
		'tag-2': { id: 'tag-2', name: 'JavaScript', color: '#f7df1e' },
		'tag-3': { id: 'tag-3', name: 'TypeScript', color: '#3178c6' },
		'tag-4': { id: 'tag-4', name: 'CSS', color: '#264de4' },
		'tag-5': { id: 'tag-5', name: 'Node.js', color: '#339933' },
		'tag-6': { id: 'tag-6', name: 'GraphQL', color: '#e10098' },
	},
	Location: {
		'location-1': { id: 'location-1', lat: 40.7128, lng: -74.006, label: 'New York' },
		'location-2': { id: 'location-2', lat: 51.5074, lng: -0.1278, label: 'London' },
		'location-3': { id: 'location-3', lat: 48.8566, lng: 2.3522, label: 'Paris' },
		'location-4': { id: 'location-4', lat: 35.6762, lng: 139.6503, label: 'Tokyo' },
	},
}
