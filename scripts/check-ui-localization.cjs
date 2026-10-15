const fs = require('node:fs');
const path = require('node:path');
const ts = require('../frontend/node_modules/typescript');

const UI_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt']);
const UI_METHODS = new Set(['setError', 'setSuccess', 'setMessage', 'error', 'success', 'warning', 'info', 'alert']);
const SOURCE_EXTENSIONS = new Set(['.tsx', '.ts', '.jsx', '.js']);

function isUiCopy(value) {
  const text = value.trim();
  if (!text || /^https?:\/\//i.test(text) || text.startsWith('/') || text.includes('://')) return false;
  if (/^[a-z][\w.-]*$/.test(text)) return false;
  if (/^[A-Z0-9_.-]+$/.test(text) && !/\s/.test(text)) return false;
  return /\s/.test(text) || /^[A-ZА-ЯЁ][\p{L}\p{N}'’!?.,:()-]*$/u.test(text);
}

function literalValue(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isTemplateExpression(node)) {
    let result = node.head.text;
    for (const span of node.templateSpans) result += `\${${span.expression.getText()}}${span.literal.text}`;
    return result;
  }
  return null;
}

function listSourceFiles(root) {
  if (!fs.existsSync(root)) return [];
  const stat = fs.statSync(root);
  if (stat.isFile()) return [root];
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...listSourceFiles(full));
    else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name)) &&
      !/\.(test|spec)\.[^.]+$/.test(entry.name)
    ) result.push(full);
  }
  return result;
}

function collectUiStringViolations(sourceRoot) {
  const root = path.resolve(sourceRoot);
  const violations = [];
  for (const filePath of listSourceFiles(root)) {
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, filePath.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const add = (node, kind, value) => {
      if (value !== null && isUiCopy(value)) {
        const relative = path.relative(root, filePath).split(path.sep).join('/');
        violations.push({ file: relative, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1, kind, value: value.trim() });
      }
    };
    const visit = (node) => {
      if (ts.isJsxText(node)) add(node, 'jsx-text', node.text);
      if (ts.isJsxAttribute(node) && UI_ATTRIBUTES.has(node.name.getText(source)) && node.initializer) {
        if (ts.isStringLiteral(node.initializer)) add(node.initializer, 'jsx-attribute', node.initializer.text);
        else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
          const value = literalValue(node.initializer.expression);
          if (value !== null) add(node.initializer.expression, 'jsx-attribute', value);
        }
      }
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const method = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isIdentifier(callee) ? callee.text : '';
        const receiver = ts.isPropertyAccessExpression(callee) ? callee.expression : null;
        const isToastMethod = ts.isPropertyAccessExpression(callee) && ts.isIdentifier(receiver) && receiver.text === 'toast' && UI_METHODS.has(method);
        const isMessageSetter = ts.isIdentifier(callee) && UI_METHODS.has(method) && method.startsWith('set');
        if (isToastMethod || isMessageSetter) for (const argument of node.arguments) {
          const value = literalValue(argument);
          if (value !== null) add(argument, 'ui-message', value);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

if (require.main === module && process.argv.includes('--check')) {
  const sourceRoot = path.resolve(__dirname, '../frontend/src');
  const violations = collectUiStringViolations(sourceRoot);
  if (violations.length) {
    for (const item of violations) console.error(`${item.file}:${item.line}: ${item.kind}: ${item.value}`);
    console.error(`Found ${violations.length} untranslated UI string candidate(s).`);
    process.exitCode = 1;
  } else {
    console.log('No untranslated UI string candidates found.');
  }
}

module.exports = { collectUiStringViolations };
