/** Typographer's quotes: "x" → “x”, it's → it’s. Display only; the stored text is untouched. */
export function smart(text: string) {
  return text
    .replace(/(^|[\s([{—-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(\w)'(\w)/g, '$1’$2')
    .replace(/(^|[\s([{—-])'/g, '$1‘')
    .replace(/'/g, '’')
}
