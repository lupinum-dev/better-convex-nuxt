import { recommendedRuleLevels, rules, strictOnlyRuleLevels } from './rules/index.js'
import { TENANT_RULE_NAME } from './shared.js'

const plugin = {
  rules,
  configs: {} as Record<string, Record<string, unknown>>,
}

plugin.configs.recommended = {
  name: `${TENANT_RULE_NAME}/recommended`,
  plugins: {
    [TENANT_RULE_NAME]: plugin,
  },
  rules: recommendedRuleLevels,
}

plugin.configs.strict = {
  name: `${TENANT_RULE_NAME}/strict`,
  plugins: {
    [TENANT_RULE_NAME]: plugin,
  },
  rules: {
    ...Object.fromEntries(Object.keys(recommendedRuleLevels).map((name) => [name, 'error'])),
    ...strictOnlyRuleLevels,
  },
}

export default plugin
export { rules }
