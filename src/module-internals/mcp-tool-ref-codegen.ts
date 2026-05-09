export interface McpToolRefBindingInput {
  exportName: string
  descriptorName: string
  apiPath: readonly string[]
}

export interface McpToolRefsModuleInput {
  projectMcpToolRefImport: string
  apiImport: string
  descriptorImport: string
  descriptors: readonly string[]
  refs: readonly McpToolRefBindingInput[]
}

function renderImport(names: readonly string[], from: string): string {
  return `import { ${names.join(', ')} } from '${from}'`
}

function renderApiPath(path: readonly string[]): string {
  if (path.length === 0) {
    throw new Error('MCP tool ref apiPath must contain at least one segment')
  }

  return ['api', ...path].join('.')
}

export function renderMcpToolRefsModule(input: McpToolRefsModuleInput): string {
  if (input.descriptors.length === 0) {
    throw new Error('MCP tool refs module requires at least one descriptor import')
  }

  if (input.refs.length === 0) {
    throw new Error('MCP tool refs module requires at least one ref binding')
  }

  const lines = [
    renderImport(['projectMcpToolRef'], input.projectMcpToolRefImport),
    renderImport(['api'], input.apiImport),
    renderImport(input.descriptors, input.descriptorImport),
    '',
  ]

  for (const [index, ref] of input.refs.entries()) {
    lines.push(`export const ${ref.exportName} = projectMcpToolRef(`)
    lines.push(`  ${ref.descriptorName},`)
    lines.push(`  ${renderApiPath(ref.apiPath)},`)
    lines.push(')')
    if (index < input.refs.length - 1) lines.push('')
  }

  lines.push('')
  return lines.join('\n')
}
