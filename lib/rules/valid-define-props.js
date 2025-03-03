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
      description: 'enforce valid `defineProps` compiler macro',
      // TODO Switch in the major version.
      // categories: ['vue3-essential'],
      categories: undefined,
      url: 'https://eslint.vuejs.org/rules/valid-define-props.html'
    },
    fixable: null,
    schema: [],
    messages: {
      hasTypeAndArg:
        '`defineProps` has both a type-only props and an argument.',
      referencingLocally:
        '`defineProps` are referencing locally declared variables.',
      multiple: '`defineProps` has been called multiple times.',
      notDefined: 'Props are not defined.',
      definedInBoth:
        'Props are defined in both `defineProps` and `export default {}`.'
    }
  },
  /** @param {RuleContext} context */
  create(context) {
    const scriptSetup = utils.getScriptSetupElement(context)
    if (!scriptSetup) {
      return {}
    }

    /** @type {Set<Expression | SpreadElement>} */
    const propsDefExpressions = new Set()
    let hasDefaultExport = false
    /** @type {CallExpression[]} */
    const definePropsNodes = []
    /** @type {CallExpression | null} */
    let emptyDefineProps = null

    return utils.compositingVisitors(
      utils.defineScriptSetupVisitor(context, {
        onDefinePropsEnter(node) {
          definePropsNodes.push(node)

          if (node.arguments.length >= 1) {
            if (node.typeParameters && node.typeParameters.params.length >= 1) {
              // `defineProps` has both a literal type and an argument.
              context.report({
                node,
                messageId: 'hasTypeAndArg'
              })
              return
            }

            propsDefExpressions.add(node.arguments[0])
          } else {
            if (
              !node.typeParameters ||
              node.typeParameters.params.length === 0
            ) {
              emptyDefineProps = node
            }
          }
        },
        Identifier(node) {
          for (const defineProps of propsDefExpressions) {
            if (utils.inRange(defineProps.range, node)) {
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
                      !utils.inRange(defineProps.range, def.name)
                  )
                ) {
                  //`defineProps` are referencing locally declared variables.
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

          hasDefaultExport = Boolean(utils.findProperty(node, 'props'))
        }
      }),
      {
        'Program:exit'() {
          if (!definePropsNodes.length) {
            return
          }
          if (definePropsNodes.length > 1) {
            // `defineProps` has been called multiple times.
            for (const node of definePropsNodes) {
              context.report({
                node,
                messageId: 'multiple'
              })
            }
            return
          }
          if (emptyDefineProps) {
            if (!hasDefaultExport) {
              // Props are not defined.
              context.report({
                node: emptyDefineProps,
                messageId: 'notDefined'
              })
            }
          } else {
            if (hasDefaultExport) {
              // Props are defined in both `defineProps` and `export default {}`.
              for (const node of definePropsNodes) {
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
