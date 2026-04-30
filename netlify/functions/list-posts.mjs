import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

export default async () => {
  const blogDir = join(process.cwd(), 'blog')

  let entries
  try {
    entries = await readdir(blogDir)
  } catch {
    return Response.json([])
  }

  const files = entries.filter((name) => name.endsWith('.md'))

  const posts = await Promise.all(
    files.map(async (name) => {
      const slug = name.replace(/\.md$/, '')
      const raw = await readFile(join(blogDir, name), 'utf-8')
      const { meta, body } = parseFrontmatter(raw)
      return {
        slug,
        title: meta.title || slug,
        date: meta.date || '',
        summary: meta.summary || excerpt(body),
        thumbnail: meta.thumbnail || '',
      }
    }),
  )

  posts.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return Response.json(posts, {
    headers: { 'Cache-Control': 'public, max-age=60' },
  })
}

export const config = {
  path: '/api/posts',
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return { meta: {}, body: raw }
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/)
    if (!m) continue
    let value = m[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    meta[m[1]] = value
  }
  return { meta, body: match[2] }
}

function excerpt(body, max = 160) {
  const text = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#>*_`]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text
}
