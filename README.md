# @hyrious/lezer-fmt

Code formatter based on [Lezer Parser](https://lezer.codemirror.net/).

> [!IMPORTANT]
> This package is still in experiment stage. It isn't published.\
> To play with it, clone this repo and do:
> 1. `pnpm install`
> 2. Edit [src/cli.ts](./src/cli.ts)
> 3. `npx @hyrious/esbuild-dev src/cli.ts`

## Usage

```js
import {definePrinter, format, space} from '@hyrious/lezer-fmt'

let code = await format('foo ( bar )', {
  parser: await import('@lezer/javascript').then(m => m.parser),
  spec: definePrinter({
    spec: {}
  })
})
```

### `definePrinter({ spec })`

The `spec` is a list of rules to match tokens and return the spaces rule.
For example,

```js
definePrinter({
  spec: {
    // If the token is '=', add spaces around.
    'Equals, ArithOp': space.around,
    // The `ArithOp` matched later takes higher precedence.
    'UnaryExpression/ArithOp': space.none,
  },
  // Default rule if none of the spec above matched.
  defaultSpec: space.after,
})
```

You can view each token's scope names in debug mode.

Plus it can be written with operators `-` `&` `|` `()`:

```js
'Equals' // match '='
'VariableName - ForStatement' // match a variable not in for-statement
'^-' // match '-', the '^' is used to escape the next character
```

## License

MIT @ [hyrious](https://github.com/hyrious)
