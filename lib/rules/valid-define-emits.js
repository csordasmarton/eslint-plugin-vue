/**
 * @author Yosuke Ota <https://github.com/ota-meshi>
 * See LICENSE file in root directory for full license.
 */
'use strict'

const { findVariable } = require('eslint-utils')
const utils = require('../utils')

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'enforce valid `defineEmits` compiler macro',
      // TODO Switch in the major version.
      // categories: ['vue3-essential'],
      categories: undefined,
      url: 'https://eslint.vuejs.org/rules/valid-define-emits.html'
    },
    fixable: null,
    schema: [],
    messages: {
      hasTypeAndArg: '`defineEmits` has both a type-only emit and an argument.',
      referencingLocally:
        '`defineEmits` are referencing locally declared variables.',
      multiple: '`defineEmits` has been called multiple times.',
      notDefined: 'Custom events are not defined.',
      definedInBoth:
        'Custom events are defined in both `defineEmits` and `export default {}`.'
    }
  },
  /** @param {RuleContext} context */
  create(context) {
    const scriptSetup = utils.getScriptSetupElement(context)
    if (!scriptSetup) {
      return {}
    }

    /** @type {Set<Expression | SpreadElement>} */
    const emitsDefExpressions = new Set()
    let hasDefaultExport = false
    /** @type {CallExpression[]} */
    const defineEmitsNodes = []
    /** @type {CallExpression | null} */
    let emptyDefineEmits = null

    return utils.compositingVisitors(
      utils.defineScriptSetupVisitor(context, {
        onDefineEmitsEnter(node) {
          defineEmitsNodes.push(node)

          if (node.arguments.length >= 1) {
            if (node.typeParameters && node.typeParameters.params.length >= 1) {
              // `defineEmits` has both a literal type and an argument.
              context.report({
                node,
                messageId: 'hasTypeAndArg'
              })
              return
            }

            emitsDefExpressions.add(node.arguments[0])
          } else {
            if (
              !node.typeParameters ||
              node.typeParameters.params.length === 0
            ) {
              emptyDefineEmits = node
            }
          }
        },
        Identifier(node) {
          for (const defineEmits of emitsDefExpressions) {
            if (utils.inRange(defineEmits.range, node)) {
              const variable = findVariable(context.getScope(), node)
              if (
                variable &&
                variable.references.some((ref) => ref.identifier === node)
              ) {
                if (
                  variable.defs.length &&
                  variable.defs.every(
                    (def) =>
                      utils.inRange(scriptSetup.range, def.name) &&
                      !utils.inRange(defineEmits.range, def.name)
                  )
                ) {
                  //`defineEmits` are referencing locally declared variables.
                  context.report({
                    node,
                    messageId: 'referencingLocally'
                  })
                }
              }
            }
          }
        }
      }),
      utils.defineVueVisitor(context, {
        onVueObjectEnter(node, { type }) {
          if (type !== 'export' || utils.inRange(scriptSetup.range, node)) {
            return
          }

          hasDefaultExport = Boolean(utils.findProperty(node, 'emits'))
        }
      }),
      {
        'Program:exit'() {
          if (!defineEmitsNodes.length) {
            return
          }
          if (defineEmitsNodes.length > 1) {
            // `defineEmits` has been called multiple times.
            for (const node of defineEmitsNodes) {
              context.report({
                node,
                messageId: 'multiple'
              })
            }
            return
          }
          if (emptyDefineEmits) {
            if (!hasDefaultExport) {
              // Custom events are not defined.
              context.report({
                node: emptyDefineEmits,
                messageId: 'notDefined'
              })
            }
          } else {
            if (hasDefaultExport) {
              // Custom events are defined in both `defineEmits` and `export default {}`.
              for (const node of defineEmitsNodes) {
                context.report({
                  node,
                  messageId: 'definedInBoth'
                })
              }
            }
          }
        }
      }
    )
  }
}
