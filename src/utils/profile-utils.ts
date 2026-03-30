export function extractSection(content: string, section: string): string | null {
  const heading = `## ${section}`
  const idx = content.indexOf(heading)
  if (idx === -1) return null

  const start = idx + heading.length
  const nextHeading = content.indexOf('\n## ', start)
  const sectionContent =
    nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading)
  return sectionContent.trim()
}

export function replaceSection(
  content: string,
  section: string,
  newContent: string,
  mode: 'append' | 'replace'
): string {
  const heading = `## ${section}`
  const idx = content.indexOf(heading)

  if (idx === -1) {
    return content.trimEnd() + `\n\n${heading}\n${newContent}\n`
  }

  const start = idx + heading.length
  const nextHeading = content.indexOf('\n## ', start)
  const currentContent =
    nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading)

  const updated =
    mode === 'append'
      ? currentContent.trimEnd() + '\n' + newContent
      : '\n' + newContent

  if (nextHeading === -1) {
    return content.slice(0, start) + updated + '\n'
  }
  return content.slice(0, start) + updated + '\n' + content.slice(nextHeading)
}

export function deleteEntry(
  content: string,
  section: string,
  entrySubstring: string
): string {
  const heading = `## ${section}`
  const idx = content.indexOf(heading)
  if (idx === -1) return content

  const start = idx + heading.length
  const nextHeading = content.indexOf('\n## ', start)
  const sectionContent =
    nextHeading === -1 ? content.slice(start) : content.slice(start, nextHeading)

  const lines = sectionContent.split('\n')
  const matchIdx = lines.findIndex((line) => line.includes(entrySubstring))
  if (matchIdx === -1) return content

  lines.splice(matchIdx, 1)
  const updatedSection = lines.join('\n')

  if (nextHeading === -1) {
    return content.slice(0, start) + updatedSection
  }
  return content.slice(0, start) + updatedSection + content.slice(nextHeading)
}
