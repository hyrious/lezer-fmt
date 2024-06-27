import {definePrinter, format, space} from './src/index.js'

const $ = document.querySelector.bind(document)

let printer = definePrinter({
  spec: {
    '^(, ^)': space.none,
    '^}': space.before,
    'Number, VariableName': space.none,
    'ArithOp, CompareOp, Equals, Arrow': space.around,
    'PostfixExpression/ArithOp, UnaryExpression/ArithOp': space.none,
    // Rules at the bottom have higher precedence.
  },
  defaultSpec: space.after,
})

$('#input').oninput = async function update() {
  sessionStorage.setItem('mem', this.value)

  let out = await format(this.value, {
    parser: await import('@lezer/javascript').then(m => m.parser),
    spec: printer
  })

  $('#output').value = out
}

if ($('#input').value = sessionStorage.getItem('mem') || '') {
  $('#input').dispatchEvent(new InputEvent('input', { bubbles: true }))
}
