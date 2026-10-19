import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const hashFile = file => sha256(readFileSync(file));
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export function localFile(root, relative) {
  if (!nonempty(relative) || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('path must be repository-relative without traversal');
  const base = realpathSync(root), file = realpathSync(path.resolve(base, relative));
  if (file === base || !file.startsWith(base + path.sep)) throw new Error('path escapes checkout');
  return file;
}
export function main(meta, action) {
  if (!process.argv[1] || meta !== pathToFileURL(path.resolve(process.argv[1])).href) return;
  try { const result = action(process.argv.slice(2)); console.log(JSON.stringify(result,null,2)); process.exitCode = result.ok === false ? 1 : 0; }
  catch (e) { console.error(e.message); process.exitCode=1; }
}
export function argumentsOf(args) {
  const options = { _: [] };
  for (let i=0;i<args.length;i++) {
    if (!args[i].startsWith('--')) { options._.push(args[i]); continue; }
    const name=args[i].slice(2);
    options[name]=args[i+1] && !args[i+1].startsWith('--') ? args[++i] : true;
  }
  return options;
}
export const readJson = file => JSON.parse(readFileSync(file,'utf8'));
