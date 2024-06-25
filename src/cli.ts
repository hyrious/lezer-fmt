import {definePrinter, format, space} from './index.js'

let input = `
  let a=1   , b    =  2
  for(a=1 ;a< 10;++ a)
    foo ( bar( () =>42))
`
let out = await format(input, {
  parser: await import('@lezer/javascript').then(m => m.parser),
  spec: definePrinter({
    spec: {
      '^(, ^)': space.none,
      'Number, VariableName': space.none,
      'ArithOp, CompareOp, Equals, Arrow': space.around,
      'PostfixExpression/ArithOp, UnaryExpression/ArithOp': space.none,
      // Rules at the bottom have higher precedence.
    },
    defaultSpec: space.after,
  })
})

console.log('======='.repeat(10))
console.log(input)
console.log('-------'.repeat(10))
console.log(out)
console.log('======='.repeat(10))
