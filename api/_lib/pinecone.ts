import { Pinecone } from '@pinecone-database/pinecone'

const apiKey = process.env.PINECONE_API_KEY
if (!apiKey) {
  // Allow runtime without Pinecone for environments where it isn't configured
}

export const pinecone = apiKey ? new Pinecone({ apiKey }) : null

export function getPineconeIndex() {
  if (!pinecone) return null
  const indexName = process.env.PINECONE_INDEX || 'clothing-comps'
  return pinecone.index(indexName)
}



