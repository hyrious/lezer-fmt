import {definePrinter, format, space} from './src/index.js'

const $ = document.querySelector.bind(document)

let printer = definePrinter({
  spec: {
    '^(, ^), ^[, ^]': space.none,
    '^}': space.before,
    'Label, Number, PropertyDefinition, VariableName, String': space.none,
    'ArithOp, CompareOp, Equals, Arrow': space.around,
    'PostfixExpression/ArithOp, UnaryExpression/ArithOp': space.none,
    // Rules at the bottom have higher precedence.
  },
  defaultSpec: space.after,
  debug: true,
})

$('#input').oninput = async function update() {
  sessionStorage.setItem('mem', this.value)

  let out = await format(this.value, {
    parser: await import('@lezer/javascript').then(m => m.parser),
    spec: printer
  })

  $('#output').value = out
}

var mem: string | null
if (mem = sessionStorage.getItem('mem')) {
  $('#input').value = mem
}
$('#input').dispatchEvent(new InputEvent('input', { bubbles: true }))

document.onselectionchange = () => {
  if (printer.query && document.activeElement == $('#output')) {
    let {selectionStart} = document.activeElement as HTMLTextAreaElement
    let response = printer.query(selectionStart)
    if (response) {
      const [, token, scopes] = response
      $('#scopes').textContent = `Token: ${token}\nScopes: ${scopes.join('/')}`
    }
  }
}
