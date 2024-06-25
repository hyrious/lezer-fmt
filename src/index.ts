import {Parser, Tree, type Input} from '@lezer/common'

export type Printer = Parameters<Tree['iterate']>[0] & {
  input: string | Input
  readonly output: string
  readonly ready?: Promise<void>
  done?(): void
  dispose?(): void
}

export interface FormatOptions {
  parser: Parser
  spec: Printer
}

export function format(input: string | Input, options: FormatOptions) {
  let {parser, spec} = options
  if (spec.dispose) spec.dispose()
  parser.parse(spec.input = input).iterate(spec)
  if (spec.done) spec.done()
  if (spec.ready) return spec.ready.then(() => spec.output)
  else return spec.output
}

export class Space {
  constructor(readonly name: string) {}
}
const s = (name: string) => new Space(name),
      none = s(''), before = s('^'), after = s('$'), around = s('^$')

export const space = {
  /** Do not add any extra spaces. */
  none,
  /** Add a space before this token. */
  before,
  /** Add a space after this token. */
  after,
  /** Add spaces before and after this token. */
  around,
}

class SelectorToken<T = unknown> {
  /** @internal */
  constructor(readonly type: SelectorTokenType<T>, readonly value: T) {}
  static define<T = any>(name: string) {
    return new SelectorTokenType<T>(name)
  }
  is<K>(type: SelectorTokenType<K>): this is SelectorToken<K> {
    return this.type === type as any
  }
  get name() { return this.type.name }
  get precedence() { return this.type.precedence }
}

class SelectorTokenType<T = any> {
  /** @internal */
  constructor(readonly name: string) {}
  of(): SelectorToken<void>
  of(value: T): SelectorToken<T>
  of(value?: T): SelectorToken<any> { return new SelectorToken(this, value) }
  get precedence() { return precedence.get(this) || 0 }
}

const t = SelectorToken.define,
      literal = t<string>('literal'), parenL = t('('), parenR = t(')'),
      not = t('-'), and = t('&'), or = t(','), end = t('end')

function lex(selector: string): SelectorToken<unknown>[] {
  let re = /\^.|[-&|,()]|[_\w/]+/g, m: RegExpExecArray | null = null
  let tokens: SelectorToken[] = []
  while ((m = re.exec(selector))) {
    let s = m[0], token: SelectorToken | undefined
    switch (s[0]) {
      case '^': {
        let last = tokens[tokens.length - 1]
        if (last && last.is(literal)) {
          (last as { value: string }).value += s[1]
          break
        }
        else {
          token = literal.of(s[1])
          break
        }
      }
      case '(': token = parenL.of(); break;
      case ')': token = parenR.of(); break;
      case '-': token = not.of(); break;
      case '&': token = and.of(); break;
      case '|': case ',': token = or.of(); break;
      default: token = literal.of(s); break;
    }
    if (token) tokens.push(token)
  }
  tokens.push(end.of())
  return tokens
}

const precedence = new Map<SelectorTokenType<unknown>, number>([
  [literal, 100], [parenL, 1], [parenR, 1],
  [not, 40], [and, 30], [or, 20], [end, 0],
])

type Expression = SelectorToken<any>

function parse(tokens: SelectorToken<unknown>[]): Expression {
  let i = 0

  function peek() { return tokens[i] }
  function eat() { return tokens[i++] }
  function expect(type: SelectorTokenType<any>) {
    if (peek().is(type)) return eat();
    throw new Error(`Expect ${type.name}, got ${peek().name}${
      peek().value ? ' ' + JSON.stringify(peek().value) : ''}`)
  }
  function match(type: SelectorTokenType<any>) {
    if (peek().is(type)) return eat();
  }

  function expression(prec = 0) {
    let left: Expression, t: Expression | undefined

    if (match(parenL)) {
      left = expression(parenL.precedence)
      expect(parenR)
    } else if ((t = match(literal))) {
      left = t
    } else if (match(not)) {
      left = not.of(expression(not.precedence))
    } else {
      throw new Error(`Expect '(', literal, '-', got ${peek().name}`)
    }

    while (prec < peek().precedence) {
      if (match(or)) {
        t = expression(or.precedence)
        left = or.of([left, t])
      } else {
        match(and)
        t = expression(and.precedence)
        left = and.of([left, t])
      }
    }

    return left
  }

  return expression(0)
}

function render(ast: Expression): string {
  function dfs(node: any) {
    if (node.is(literal)) {
      let out = 'match('
      if (node.value === '/') out += '["/"]'
      else out += JSON.stringify(node.value.split('/'))
      return out + ')'
    } else if (node.is(not)) {
      return `!${dfs(node.value)}`
    } else {
      let out = '', op = node.is(or) ? '||' : '&&'
      for (let p of node.value as Expression[]) {
        out += op + dfs(p)
      }
      return '(' + out.slice(2) + ')'
    }
  }
  return dfs(ast)
}

export class Rule {
  constructor(
    readonly test: (scopes: string[]) => boolean,
    readonly space: Space,
  ) {}

  static define(selector: string, space: Space) {
    // Literals      ^: Escape the next character
    //               /: Child scope selector
    //
    // Selector operators (in precedence high to low):
    //              (): Grouping
    //               -: Logical NOT
    // & or just space: Logical AND
    //          | or ,: Logical OR
    //
    // Example: ^{, ^( - ForSpec, foo & (-bar | buzz), Number/BigNumber

    let code = `
      function match(a) {
        if (a.length == 1) return scopes.includes(a[0]);
        let i = -1
        for (let b of a) {
          i = scopes.indexOf(b, i + 1)
          if (i < 0) return false;
        }
        return true
      }
      return ` + render(parse(lex(selector)))

    let test = Function('scopes', code) as (scopes: string[]) => boolean

    return new Rule(test, space)
  }
}

export function definePrinter(options: {
  /** Collapse spaces between tokens, default is `1`. `0` means do not collapse. Can only be `0` or `1`. */
  collapseSpace?: number,
  /** Collapse newlines between tokens to max length of N, default is `2`. `0` means do not collapse. */
  collapseNewline?: number,
  /** Remove spaces at the end of the line, default is `true`. */
  trimTrailingSpace?: boolean,
  /** Control the printer behavior on each token. */
  spec?: {
    /** Example: `['Number, ^( - ForSpec, String/Escape']: space.after`. */
    [selector: string]: Space,
  },
  /** Example: `space.after`. */
  defaultSpec?: Space,
}): Printer {
  const {collapseSpace = 1, collapseNewline = 2, trimTrailingSpace = true,
         spec = {}, defaultSpec} = options

  const rules: Rule[] = []
  for (let selector in spec) {
    rules.push(Rule.define(selector, spec[selector]))
  }

  let enter = false, input: string | Input = '', output = '',
      scopes: string[] = [], last = { from: 0, to: 0 }

  let slice: (this: any, from: number, to: number) => string = String.prototype.slice

  function indentAt(at: number): string {
    let i = at - 1, k = ''
    while (i >= 0 && (k = slice.call(input, i, i + 1)) != '\n') {
      if (k != ' ') return '';
      i--
    }
    return ' '.repeat(at - i - 1)
  }

  const printer: Printer = {
    get input() { return input },
    set input(value) {
      input = value
      if (typeof input == 'string')
        slice = String.prototype.slice
      else
        slice = input.read
    },
    get output() { return output },
    enter(node) {
      enter = true
      scopes.push(node.name)
    },
    leave(node) {
      if (enter) {
        console.log(scopes.join('/'), [slice.call(input, node.from, node.to)])
        if (collapseNewline) {
          let gap = slice.call(input, last.to, node.from)
          let newline = gap.split('\n').length - 1
          if (newline)
            if (trimTrailingSpace)
              output = output.trimEnd() + '\n'.repeat(Math.min(newline, collapseNewline))
            else {
              let i = -1, k = 0
              for (let j = 0; j < collapseNewline; j++) {
                k = gap.indexOf('\n', i + 1)
                if (k >= 0) i = k;
                else break
              }
              gap = gap.slice(0, i + 1)
              output += gap
            }
        }

        output += indentAt(node.from)

        let rule = defaultSpec
        for (let i = rules.length - 1; i >= 0; i--) if (rules[i].test(scopes)) {
          rule = rules[i].space
          break
        }

        let s = slice.call(input, node.from, node.to)
        if (s && collapseSpace && (rule == space.before || rule == space.around)) {
          let end = output[output.length - 1]
          if (end == ' ' || end == '\n') {
            // skip this space
          } else {
            output += ' '
          }
        }

        output += s

        if (s && (rule == space.after || rule == space.around)) output += ' '

        last = { from: node.from, to: node.to }
      }
      scopes.pop()
      enter = false
    },
    done() {
      let gap = slice.call(input, last.to, input.length)
      if (gap.includes('\n')) output += '\n';
    },
    dispose() {
      enter = false
      input = ''
      output = ''
      scopes = []
      last = { from: 0, to: 0 }
    },
  }

  return printer
}
