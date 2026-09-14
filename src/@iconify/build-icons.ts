/**
 * This is an advanced example for creating icon bundles for Iconify SVG Framework.
 *
 * It creates a bundle from:
 * - All SVG files in a directory.
 * - Custom JSON files.
 * - Iconify icon sets.
 * - SVG framework.
 *
 * This example uses Iconify Tools to import and clean up icons.
 * For Iconify Tools documentation visit https://docs.iconify.design/tools/tools2/
 */
import { promises as fs } from 'node:fs'
import { dirname, extname, join } from 'node:path'

// Installation: npm install --save-dev @iconify/tools @iconify/utils @iconify/json @iconify/iconify
import {
  cleanupSVG,
  importDirectory,
  isEmptyColor,
  parseColors,
  runSVGO,
} from '@iconify/tools'
import type { IconifyJSON, IconifyMetaData } from '@iconify/types'
import { getIcons, minifyIconSet, stringToIcon } from '@iconify/utils'

/**
 * Script configuration
 */
interface BundleScriptCustomSVGConfig {

  // Path to SVG files
  dir: string

  // True if icons should be treated as monotone: colors replaced with currentColor
  monotone: boolean

  // Icon set prefix
  prefix: string
}

interface BundleScriptCustomJSONConfig {

  // Path to JSON file
  filename: string

  // List of icons to import. If missing, all icons will be imported
  icons?: string[]
}

interface BundleScriptConfig {

  // Custom SVG to import and bundle
  svg?: BundleScriptCustomSVGConfig[]

  // Icons to bundled from @iconify/json packages
  icons?: string[]

  // List of JSON files to bundled
  // Entry can be a string, pointing to filename or a BundleScriptCustomJSONConfig object (see type above)
  // If entry is a string or object without 'icons' property, an entire JSON file will be bundled
  json?: (string | BundleScriptCustomJSONConfig)[]
}

type LegacyIconPrefix = 'bx' | 'bxs' | 'bxl'

const legacyIconCollections: Record<LegacyIconPrefix, string> = {
  bx: require.resolve('@iconify-json/bx/icons.json'),
  bxs: require.resolve('@iconify-json/bxs/icons.json'),
  bxl: require.resolve('@iconify-json/bxl/icons.json'),
}

const sourceFileExtensions = new Set(['.js', '.ts', '.tsx', '.vue'])
const legacyIconPattern = /\b(bx|bxs|bxl)(?:-|:)([a-z0-9]+(?:-[a-z0-9]+)*)\b/g

async function collectLegacyIcons(directory: string) {
  const icons: Record<LegacyIconPrefix, Set<string>> = {
    bx: new Set<string>(),
    bxs: new Set<string>(),
    bxl: new Set<string>(),
  }

  async function visit(currentDirectory: string) {
    const entries = await fs.readdir(currentDirectory, { withFileTypes: true })

    for (const entry of entries) {
      const filename = join(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        // Generated Iconify files contain every bundled name and must not feed
        // the next build. Explicit dynamic icons can be added to sources.icons.
        if (currentDirectory === directory && entry.name === '@iconify')
          continue

        await visit(filename)
      }
      else if (sourceFileExtensions.has(extname(entry.name))) {
        const source = await fs.readFile(filename, 'utf8')

        for (const match of source.matchAll(legacyIconPattern))
          icons[match[1] as LegacyIconPrefix].add(match[2])
      }
    }
  }

  await visit(directory)

  return icons
}

const sources: BundleScriptConfig = {
  svg: [
    {
      dir: 'src/assets/images/iconify-svg',
      monotone: false,
      prefix: 'custom',
    },

    // {
    //   dir: 'emojis',
    //   monotone: false,
    //   prefix: 'emoji',
    // },
  ],

  icons: [
    // 'mdi:home',
    // 'mdi:account',
    // 'mdi:login',
    // 'mdi:logout',
    // 'octicon:book-24',
    // 'octicon:code-square-24',
  ],

  json: [
    // Custom JSON file
    // 'json/gg.json',

    // Iconify JSON file (@iconify/json is a package name, /json/ is directory where files are, then filename)
    {
      filename: require.resolve('@iconify-json/mdi/icons.json'),
      icons: [
        'file-remove-outline',
        'translate',
        'vuetify',
        'information-variant',
        'arrow-top-right',
        'arrow-bottom-right',
        'arrow-bottom-left',
        'arrow-top-left',
        'arrow-collapse-all',
        'arrow-down-left',
        'web',
        'cpu-32-bit',
        'alpha-r',
        'alpha-g',
        'alpha-b',
        'map-marker-off-outline',
        'laptop',
      ],
    },

    // Custom file with only few icons
    // {
    //   filename: require.resolve('@iconify-json/line-md/icons.json'),
    //   icons: [
    //     'home-twotone-alt',
    //     'github',
    //     'document-list',
    //     'document-code',
    //     'image-twotone',
    //   ],
    // },

  ],
}

// Iconify component (this changes import statement in generated file)
// Available options: '@iconify/react' for React, '@iconify/vue' for Vue 3, '@iconify/vue2' for Vue 2, '@iconify/svelte' for Svelte
const component = '@iconify/vue'

// Set to true to use require() instead of import
const commonJS = false

// File to save bundle to
const target = join(__dirname, 'icons-bundle.js');

/**
 * Do stuff!
 */
// eslint-disable-next-line sonarjs/cognitive-complexity
(async function () {
  let bundle = commonJS
    ? `const { addCollection } = require('${component}');\n\n`
    : `import { addCollection } from '${component}';\n\n`

  // Create directory for output if missing
  const dir = dirname(target)
  try {
    await fs.mkdir(dir, {
      recursive: true,
    })
  }
  catch (err) {
    //
  }

  const legacyIcons = await collectLegacyIcons(join(__dirname, '..'))
  const detectedLegacySources = (Object.keys(legacyIconCollections) as LegacyIconPrefix[])
    .map(prefix => ({
      filename: legacyIconCollections[prefix],
      icons: [...legacyIcons[prefix]].sort(),
    }))
    .filter(source => source.icons.length > 0)

  sources.json = [...detectedLegacySources, ...(sources.json ?? [])]

  /**
   * Convert sources.icons to sources.json
   */
  if (sources.icons) {
    const sourcesJSON = sources.json ? sources.json : (sources.json = [])

    // Sort icons by prefix
    const organizedList = organizeIconsList(sources.icons)
    for (const prefix in organizedList) {
      const filename = require.resolve(`@iconify/json/json/${prefix}.json`)

      sourcesJSON.push({
        filename,
        icons: organizedList[prefix],
      })
    }
  }

  /**
   * Bundle JSON files
   */
  if (sources.json) {
    for (let i = 0; i < sources.json.length; i++) {
      const item = sources.json[i]

      // Load icon set
      const filename = typeof item === 'string' ? item : item.filename
      let content = JSON.parse(
        await fs.readFile(filename, 'utf8'),
      ) as IconifyJSON

      // Filter icons
      if (typeof item !== 'string' && item.icons?.length) {
        const filteredContent = getIcons(content, item.icons)
        if (!filteredContent)
          throw new Error(`Cannot find required icons in ${filename}`)

        content = filteredContent
      }

      // Remove metadata and add to bundle
      removeMetaData(content)
      minifyIconSet(content)
      bundle += `addCollection(${JSON.stringify(content)});\n`
      console.log(`Bundled icons from ${filename}`)
    }
  }

  /**
   * Custom SVG
   */
  if (sources.svg) {
    for (let i = 0; i < sources.svg.length; i++) {
      const source = sources.svg[i]

      // Import icons
      const iconSet = await importDirectory(source.dir, {
        prefix: source.prefix,
      })

      // Validate, clean up, fix palette and optimise
      await iconSet.forEach(async (name, type) => {
        if (type !== 'icon')
          return

        // Get SVG instance for parsing
        const svg = iconSet.toSVG(name)
        if (!svg) {
          // Invalid icon
          iconSet.remove(name)

          return
        }

        // Clean up and optimise icons
        try {
          // Clean up icon code
          await cleanupSVG(svg)

          if (source.monotone) {
            // Replace color with currentColor, add if missing
            // If icon is not monotone, remove this code
            await parseColors(svg, {
              defaultColor: 'currentColor',
              callback: (attr, colorStr, color) => {
                return (!color || isEmptyColor(color))
                  ? colorStr
                  : 'currentColor'
              },
            })
          }

          // Optimise
          await runSVGO(svg)
        }
        catch (err) {
          // Invalid icon
          console.error(
            `Error parsing ${name} from ${source.dir}:`,
            err,
          )
          iconSet.remove(name)

          return
        }

        // Update icon from SVG instance
        iconSet.fromSVG(name, svg)
      })
      console.log(`Bundled ${iconSet.count()} icons from ${source.dir}`)

      // Export to JSON
      const content = iconSet.export()

      bundle += `addCollection(${JSON.stringify(content)});\n`
    }
  }

  // Save to file
  await fs.writeFile(target, bundle, 'utf8')

  console.log(`Saved ${target} (${bundle.length} bytes)`)
})().catch(err => {
  console.error(err)
})

/**
 * Remove metadata from icon set
 */
function removeMetaData(iconSet: IconifyJSON) {
  const props: (keyof IconifyMetaData)[] = [
    'info',
    'chars',
    'categories',
    'themes',
    'prefixes',
    'suffixes',
  ]

  props.forEach(prop => {
    delete iconSet[prop]
  })
}

/**
 * Sort icon names by prefix
 */
function organizeIconsList(icons: string[]): Record<string, string[]> {
  const sorted: Record<string, string[]> = Object.create(null)

  icons.forEach(icon => {
    const item = stringToIcon(icon)
    if (!item)
      return

    const prefix = item.prefix

    const prefixList = sorted[prefix]
      ? sorted[prefix]
      : (sorted[prefix] = [])

    const name = item.name
    if (!prefixList.includes(name))
      prefixList.push(name)
  })

  return sorted
}
