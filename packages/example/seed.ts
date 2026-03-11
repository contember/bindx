#!/usr/bin/env bun
import { GraphQlClient } from '@contember/graphql-client'

const apiUrl = process.env['CONTEMBER_API_URL'] ?? 'http://localhost:1581'
const apiToken = process.env['CONTEMBER_API_TOKEN'] ?? '0000000000000000000000000000000000000000'

const client = new GraphQlClient({
	url: `${apiUrl}/content/example/live`,
	apiToken,
})

// Fixed UUIDs for reproducible seeds
const ids = {
	author1: '00000000-0000-0000-0000-000000000a01',
	author2: '00000000-0000-0000-0000-000000000a02',
	author3: '00000000-0000-0000-0000-000000000a03',
	author4: '00000000-0000-0000-0000-000000000a04',
	author5: '00000000-0000-0000-0000-000000000a05',
	tag1: '00000000-0000-0000-0000-000000000b01',
	tag2: '00000000-0000-0000-0000-000000000b02',
	tag3: '00000000-0000-0000-0000-000000000b03',
	tag4: '00000000-0000-0000-0000-000000000b04',
	tag5: '00000000-0000-0000-0000-000000000b05',
	tag6: '00000000-0000-0000-0000-000000000b06',
	location1: '00000000-0000-0000-0000-000000000c01',
	location2: '00000000-0000-0000-0000-000000000c02',
	location3: '00000000-0000-0000-0000-000000000c03',
	location4: '00000000-0000-0000-0000-000000000c04',
	ref1: '00000000-0000-0000-0000-000000000d01',
	ref2: '00000000-0000-0000-0000-000000000d02',
	ref3: '00000000-0000-0000-0000-000000000d03',
	ref4: '00000000-0000-0000-0000-000000000d04',
	article1: '00000000-0000-0000-0000-000000000e01',
	article2: '00000000-0000-0000-0000-000000000e02',
}

async function seed(): Promise<void> {
	console.log('Seeding data...')

	const result = await client.execute(/* GraphQL */ `
		mutation {
			author1: createAuthor(data: {
				id: "${ids.author1}"
				name: "John Doe"
				email: "john@example.com"
				bio: "Senior developer at Example Corp"
			}) { ok }

			author2: createAuthor(data: {
				id: "${ids.author2}"
				name: "Jane Smith"
				email: "jane@example.com"
				bio: "TypeScript enthusiast"
			}) { ok }

			author3: createAuthor(data: {
				id: "${ids.author3}"
				name: "Bob Wilson"
				email: "bob@example.com"
				bio: "Full-stack developer"
			}) { ok }

			author4: createAuthor(data: {
				id: "${ids.author4}"
				name: "Alice Brown"
				email: "alice@example.com"
				bio: "Frontend architect"
			}) { ok }

			author5: createAuthor(data: {
				id: "${ids.author5}"
				name: "Charlie Davis"
				email: "charlie@example.com"
				bio: "DevOps engineer"
			}) { ok }

			tag1: createTag(data: { id: "${ids.tag1}", name: "React", color: "#61dafb" }) { ok }
			tag2: createTag(data: { id: "${ids.tag2}", name: "JavaScript", color: "#f7df1e" }) { ok }
			tag3: createTag(data: { id: "${ids.tag3}", name: "TypeScript", color: "#3178c6" }) { ok }
			tag4: createTag(data: { id: "${ids.tag4}", name: "CSS", color: "#264de4" }) { ok }
			tag5: createTag(data: { id: "${ids.tag5}", name: "Node.js", color: "#339933" }) { ok }
			tag6: createTag(data: { id: "${ids.tag6}", name: "GraphQL", color: "#e10098" }) { ok }

			location1: createLocation(data: { id: "${ids.location1}", lat: 40.7128, lng: -74.006, label: "New York" }) { ok }
			location2: createLocation(data: { id: "${ids.location2}", lat: 51.5074, lng: -0.1278, label: "London" }) { ok }
			location3: createLocation(data: { id: "${ids.location3}", lat: 48.8566, lng: 2.3522, label: "Paris" }) { ok }
			location4: createLocation(data: { id: "${ids.location4}", lat: 35.6762, lng: 139.6503, label: "Tokyo" }) { ok }

			ref1: createContentReference(data: {
				id: "${ids.ref1}"
				type: "image"
				imageUrl: "https://picsum.photos/400/200"
				caption: "A sample image"
			}) { ok }

			ref2: createContentReference(data: {
				id: "${ids.ref2}"
				type: "quote"
				quoteText: "The only way to do great work is to love what you do."
				quoteAuthor: "Steve Jobs"
			}) { ok }

			ref3: createContentReference(data: {
				id: "${ids.ref3}"
				type: "embed"
				embedUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
				embedType: "youtube"
			}) { ok }

			ref4: createContentReference(data: {
				id: "${ids.ref4}"
				type: "callout"
				calloutText: "This is an important note about React best practices."
				calloutVariant: "info"
			}) { ok }

			article1: createArticle(data: {
				id: "${ids.article1}"
				title: "Introduction to React"
				content: "React is a JavaScript library for building user interfaces..."
				richContent: "{\\"formatVersion\\":2,\\"children\\":[{\\"type\\":\\"paragraph\\",\\"children\\":[{\\"text\\":\\"This is a block editor example with \\"},{\\"text\\":\\"bold text\\",\\"bold\\":true},{\\"text\\":\\" and \\"},{\\"text\\":\\"italic text\\",\\"italic\\":true},{\\"text\\":\\".\\"}]},{\\"type\\":\\"image\\",\\"referenceId\\":\\"${ids.ref1}\\",\\"children\\":[{\\"text\\":\\"\\"}]},{\\"type\\":\\"paragraph\\",\\"children\\":[{\\"text\\":\\"Here is an inspiring quote:\\"}]},{\\"type\\":\\"quote\\",\\"referenceId\\":\\"${ids.ref2}\\",\\"children\\":[{\\"text\\":\\"\\"}]},{\\"type\\":\\"paragraph\\",\\"children\\":[{\\"text\\":\\"Check out this video:\\"}]},{\\"type\\":\\"embed\\",\\"referenceId\\":\\"${ids.ref3}\\",\\"children\\":[{\\"text\\":\\"\\"}]},{\\"type\\":\\"callout\\",\\"referenceId\\":\\"${ids.ref4}\\",\\"children\\":[{\\"text\\":\\"\\"}]},{\\"type\\":\\"paragraph\\",\\"children\\":[{\\"text\\":\\"Try editing this content!\\"}]}]}"
				publishedAt: "2024-01-15T00:00:00.000Z"
				author: { connect: { id: "${ids.author1}" } }
				location: { connect: { id: "${ids.location1}" } }
				tags: [
					{ connect: { id: "${ids.tag1}" } }
					{ connect: { id: "${ids.tag2}" } }
				]
				contentReferences: [
					{ connect: { id: "${ids.ref1}" } }
					{ connect: { id: "${ids.ref2}" } }
					{ connect: { id: "${ids.ref3}" } }
					{ connect: { id: "${ids.ref4}" } }
				]
			}) { ok }

			article2: createArticle(data: {
				id: "${ids.article2}"
				title: "TypeScript Best Practices"
				content: "TypeScript adds static typing to JavaScript..."
				publishedAt: "2024-02-20T00:00:00.000Z"
				author: { connect: { id: "${ids.author2}" } }
				location: { connect: { id: "${ids.location2}" } }
				tags: [
					{ connect: { id: "${ids.tag3}" } }
					{ connect: { id: "${ids.tag2}" } }
				]
			}) { ok }
		}
	`, {})

	console.log('Seed result:', JSON.stringify(result, null, 2))
	console.log('Seed complete!')
}

seed().catch(error => {
	console.error('Seed failed:', error)
	process.exit(1)
})
