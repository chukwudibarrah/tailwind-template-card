import { compile } from 'tailwindcss'

// Tailwind's own stylesheets, inlined at build time so the compiler never
// needs a filesystem or a network fetch at runtime.
import indexCss from 'tailwindcss/index.css?raw'
import themeCss from 'tailwindcss/theme.css?raw'
import preflightCss from 'tailwindcss/preflight.css?raw'
import utilitiesCss from 'tailwindcss/utilities.css?raw'

import daisyuiPlugin from 'daisyui'

type Compiler = Awaited<ReturnType<typeof compile>>

/**
 * The `@import` ids Tailwind's own entrypoint resolves, mapped to the bundled
 * source. `compile()` asks for these by the exact strings below.
 */
const STYLESHEETS: Record<string, string> = {
  tailwindcss: indexCss,
  './index.css': indexCss,
  './theme.css': themeCss,
  './preflight.css': preflightCss,
  './utilities.css': utilitiesCss
}

type CompileOptions = NonNullable<Parameters<typeof compile>[1]>
type PluginModule = Awaited<
  ReturnType<NonNullable<CompileOptions['loadModule']>>
>['module']

const MODULES: Record<string, PluginModule> = {
  daisyui: daisyuiPlugin
}

/**
 * Extracts utility class candidates from rendered HTML.
 *
 * Tailwind's real scanner is a native (Rust) binary and cannot run in the
 * browser, but we do not need it: the card already holds the exact HTML it is
 * about to render, so reading the class attributes is both sufficient and
 * cheap. Arbitrary values use underscores rather than spaces by Tailwind
 * convention, so splitting on whitespace is safe.
 */
const CLASS_ATTRIBUTE = /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export const extractCandidates = (html: string): string[] => {
  const found = new Set<string>()
  let match: RegExpExecArray | null

  CLASS_ATTRIBUTE.lastIndex = 0
  while ((match = CLASS_ATTRIBUTE.exec(html)) !== null) {
    const value = match[1] ?? match[2] ?? ''
    for (const token of value.split(/\s+/)) {
      if (token) found.add(token)
    }
  }

  return [...found]
}

/**
 * `@property` rules are registered per document, and a browser ignores them
 * entirely when they arrive inside a shadow root's adopted stylesheets. Tailwind
 * v4 leans on registered custom properties for gradients, transforms, shadows
 * and filters, so those utilities silently render as nothing unless the rules
 * are hoisted to the document.
 *
 * Verified in Chrome: a gradient defined against a shadow-scoped `@property`
 * computes to `none`; the same rule adopted on `document` resolves correctly.
 */
const AT_PROPERTY_RULE = /@property\s+--[\w-]+\s*\{[^}]*\}/g

export const splitAtProperties = (css: string) => {
  const properties = css.match(AT_PROPERTY_RULE) ?? []
  return { properties, rest: css.replace(AT_PROPERTY_RULE, '') }
}

/** Document-level sheet holding every `@property` rule any card has needed. */
let propertySheet: CSSStyleSheet | null = null
const registeredProperties = new Set<string>()

/**
 * Registers `@property` rules on the document, once each. Shared across every
 * card instance, since custom property registration is global anyway.
 */
export const ensureAtPropertiesRegistered = (rules: string[]) => {
  const unseen = rules.filter(rule => !registeredProperties.has(rule))
  if (unseen.length === 0) return

  unseen.forEach(rule => registeredProperties.add(rule))

  if (!propertySheet) {
    propertySheet = new CSSStyleSheet()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, propertySheet]
  }

  propertySheet.replaceSync([...registeredProperties].join('\n'))
}

type CacheEntry = {
  compiler: Compiler
  candidates: Set<string>
  css: string
}

/**
 * Compiles Tailwind CSS in the browser from a candidate list.
 *
 * Compilers are cached per entry stylesheet (building one is comparatively
 * expensive), and each compiler accumulates the candidates it has been asked
 * for so that repeated renders only trigger a rebuild when genuinely new
 * classes appear.
 */
export class TailwindEngine {
  private static cache = new Map<string, Promise<CacheEntry>>()

  static buildEntryCss(options: {
    daisyui?: boolean
    daisyuiThemes?: string
  }): string {
    const lines = ['@import "tailwindcss";']

    if (options.daisyui) {
      const themes = options.daisyuiThemes?.trim()
      lines.push(
        themes
          ? `@plugin "daisyui" { themes: ${themes}; }`
          : '@plugin "daisyui";'
      )
    }

    return lines.join('\n')
  }

  private static async createCompiler(entryCss: string): Promise<CacheEntry> {
    const compiler = await compile(entryCss, {
      base: '/',
      loadStylesheet: async (id: string) => {
        const content = STYLESHEETS[id]
        if (content === undefined) {
          throw new Error(`Unable to resolve stylesheet import: ${id}`)
        }
        return { path: id, base: '/', content }
      },
      loadModule: async (id: string) => {
        const module = MODULES[id]
        if (module === undefined) {
          throw new Error(`Unable to resolve plugin: ${id}`)
        }
        return { path: id, base: '/', module }
      }
    })

    return { compiler, candidates: new Set<string>(), css: '' }
  }

  /**
   * Returns the CSS needed for `candidates`, reusing previous work where
   * possible. Resolves to the full stylesheet for everything seen so far.
   */
  static async build(entryCss: string, candidates: string[]): Promise<string> {
    let pending = this.cache.get(entryCss)

    if (!pending) {
      pending = this.createCompiler(entryCss)
      this.cache.set(entryCss, pending)
    }

    let entry: CacheEntry
    try {
      entry = await pending
    } catch (e) {
      // Don't cache a failed compiler — a later render may succeed.
      this.cache.delete(entryCss)
      throw e
    }

    const unseen = candidates.filter((c) => !entry.candidates.has(c))
    if (unseen.length === 0 && entry.css) {
      return entry.css
    }

    unseen.forEach((c) => entry.candidates.add(c))
    entry.css = entry.compiler.build([...entry.candidates])

    return entry.css
  }
}
