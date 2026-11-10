/**
 * The plugin's own model-facing skill.
 *
 * A plugin package's files are not a skill root, so `skills/asc-hub/SKILL.md` is
 * never discovered from disk: it ships as the source of truth and is registered
 * at runtime through `ctx.skills.register(...)`. Registration is optional — a
 * deployment without the skill registry simply gets the tool and no skill.
 */

import { readFileSync } from 'node:fs'

import type { HostContext, SkillRegistry } from './types.js'
import { skillRegistry } from './types.js'

/** The authored document, shipped in the package's `files` list; dist/host/ -> root. */
const SKILL_URL = new URL('../../skills/asc-hub/SKILL.md', import.meta.url)

/** A skill name the registry accepts: lowercase kebab-case. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The parsed document, before the registry adds its `source`. */
export interface SkillDocument {
  name: string
  description: string
  whenToUse?: string
  content: string
}

/** The parsed frontmatter fields plus the instruction body. */
export interface ParsedSkillDocument {
  fields: Record<string, string>
  content: string
}

/**
 * Split a `SKILL.md` document into its frontmatter fields and instruction body.
 * The frontmatter this project writes is a flat `key: value` block, so a full
 * YAML parser would be a dependency for nothing.
 */
export function parseSkillDocument(source: string): ParsedSkillDocument {
  const text = String(source)
  if (!text.startsWith('---')) return { fields: {}, content: text.trim() }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { fields: {}, content: text.trim() }
  const head = text.slice(3, end)
  const body = text.slice(end + 4).replace(/^\r?\n/, '')
  const fields: Record<string, string> = {}
  for (const line of head.split(/\r?\n/)) {
    const match = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim())
    if (match === null) continue
    const raw = match[2].trim()
    const unquoted = /^(['"])(.*)\1$/.exec(raw)
    fields[match[1]] = unquoted === null ? raw : unquoted[2]
  }
  return { fields, content: body.trim() }
}

/**
 * Read and parse the shipped skill. Throws when the package is incomplete, which
 * the caller treats as "no skill" rather than a plugin failure.
 */
export function readSkill(): SkillDocument {
  const { fields, content } = parseSkillDocument(readFileSync(SKILL_URL, 'utf8'))
  const name = typeof fields.name === 'string' && SKILL_NAME.test(fields.name) ? fields.name : 'asc-hub'
  const description = typeof fields.description === 'string' && fields.description.length > 0
    ? fields.description
    : 'Ship an iOS app through App Store Connect with the asc_hub tool.'
  const skill: SkillDocument = { name, description, content }
  if (typeof fields.whenToUse === 'string' && fields.whenToUse.length > 0) skill.whenToUse = fields.whenToUse
  return skill
}

/**
 * Register the shipped skill with the registry service, when one is mounted.
 * @returns whether a registration happened
 */
export function registerSkill(ctx: HostContext): boolean {
  let skills: SkillRegistry | undefined
  try {
    skills = skillRegistry(ctx)
  } catch {
    skills = undefined
  }
  if (skills === undefined) return false

  let definition: SkillDocument
  try {
    definition = readSkill()
  } catch (error) {
    ctx.logger?.warn?.(`asc-hub: skill document unavailable (${error instanceof Error ? error.message : String(error)})`)
    return false
  }

  try {
    const registry = skills
    ctx.effect(() => registry.register({ ...definition, source: '@sleep9ull/dsh-asc-hub' }), 'asc-hub: model skill')
    return true
  } catch (error) {
    ctx.logger?.warn?.(`asc-hub: skill registration refused (${error instanceof Error ? error.message : String(error)})`)
    return false
  }
}
