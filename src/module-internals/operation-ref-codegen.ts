export type OperationRefProjection = 'execute' | 'preview'

export interface OperationRefBindingInput {
  exportName: string
  descriptorName: string
  projection: OperationRefProjection
  apiPath: readonly string[]
}

export interface OperationRefsModuleInput {
  projectOperationRefImport: string
  apiImport: string
  descriptorImport: string
  descriptors: readonly string[]
  refs: readonly OperationRefBindingInput[]
}

function renderImport(names: readonly string[], from: string): string {
  return `import { ${names.join(', ')} } from '${from}'`
}

function renderApiPath(path: readonly string[]): string {
  if (path.length === 0) {
    throw new Error('Operation ref apiPath must contain at least one segment')
  }

  return ['api', ...path].join('.')
}

export function renderConvexFunctionRef(path: readonly string[]): string {
  if (path.length < 2) {
    throw new Error('Operation ref apiPath must include a module path and export name')
  }

  const exportName = path.at(-1)
  const modulePath = path.slice(0, -1).join('/')
  return `${modulePath}:${exportName}`
}

export function renderOperationRefsModule(input: OperationRefsModuleInput): string {
  if (input.descriptors.length === 0) {
    throw new Error('Operation refs module requires at least one descriptor import')
  }

  if (input.refs.length === 0) {
    throw new Error('Operation refs module requires at least one ref binding')
  }

  const lines = [
    renderImport(['projectOperationRef'], input.projectOperationRefImport),
    renderImport(['api'], input.apiImport),
    renderImport(input.descriptors, input.descriptorImport),
    '',
  ]

  for (const [index, ref] of input.refs.entries()) {
    lines.push(`export const ${ref.exportName} = projectOperationRef(`)
    lines.push(`  ${ref.descriptorName},`)
    lines.push(`  '${ref.projection}',`)
    lines.push(`  ${renderApiPath(ref.apiPath)},`)
    lines.push(`  { functionRef: '${renderConvexFunctionRef(ref.apiPath)}' },`)
    lines.push(')')
    if (index < input.refs.length - 1) lines.push('')
  }

  lines.push('')
  return lines.join('\n')
}
