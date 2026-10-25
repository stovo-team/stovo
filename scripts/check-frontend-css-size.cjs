const fs = require('node:fs');
const path = require('node:path');

const WARNING_LINES = 1500;
const NEW_FILE_LIMIT = 2500;

function countLines(content) {
  if (content.length === 0) return 0;
  const lines = content.split(/\r\n|\n|\r/);
  return lines.at(-1) === '' ? lines.length - 1 : lines.length;
}

function normalizeRelativePath(relativePath) {
  return relativePath.split(path.sep).join('/');
}

function isIgnoredPath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  return /(^|\/)(?:node_modules|dist|build|generated|vendor|test|tests|fixtures|__tests__|__fixtures__)(\/|$)/i.test(normalizedPath)
    || /(^|\/)(?:generated|vendor)(?:[-.]|$)/i.test(normalizedPath)
    || /\.(?:generated|min)\.css$/i.test(normalizedPath);
}

function isAuthoredPartial(relativePath) {
  return normalizeRelativePath(relativePath).endsWith('.css') && !isIgnoredPath(relativePath);
}

function findAuthoredPartials(stylesDir) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(stylesDir, absolutePath);
      if (entry.isDirectory()) {
        if (!isIgnoredPath(relativePath)) visit(absolutePath);
      } else if (entry.isFile() && isAuthoredPartial(relativePath)) {
        files.push(relativePath);
      }
    }
  }
  visit(stylesDir);
  return files.sort();
}

function checkCssSizes({
  stylesDir = path.join(__dirname, '..', 'frontend', 'src', 'styles'),
  baselinePath = path.join(__dirname, '..', 'frontend', 'css-size-baseline.json'),
} = {}) {
  const errors = [];
  const warnings = [];
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    return { errors: [`Cannot read CSS size baseline: ${error.message}`], warnings };
  }

  if (!baseline || typeof baseline.files !== 'object' || baseline.files === null
      || Array.isArray(baseline.files)) {
    return { errors: ['CSS size baseline must contain a "files" object.'], warnings };
  }
  const exceptions = baseline.exceptions ?? {};
  if (typeof exceptions !== 'object' || exceptions === null || Array.isArray(exceptions)) {
    return { errors: ['CSS size baseline "exceptions" must be an object.'], warnings };
  }
  for (const [name, exception] of Object.entries(exceptions)) {
    if (!exception || !Number.isInteger(exception.maxLines) || exception.maxLines < 0
        || typeof exception.reason !== 'string' || exception.reason.trim() === '') {
      errors.push(`Exception for ${name} must include an integer maxLines and a non-empty reason.`);
    }
  }

  let names;
  try {
    names = findAuthoredPartials(stylesDir);
  } catch (error) {
    return { errors: [`Cannot read authored CSS directory: ${error.message}`], warnings };
  }

  for (const name of names) {
    const actual = countLines(fs.readFileSync(path.join(stylesDir, name), 'utf8'));
    const existed = Object.hasOwn(baseline.files, name);
    if (!existed && actual > NEW_FILE_LIMIT) {
      errors.push(`${name} has ${actual} lines; new CSS partials must stay at or below ${NEW_FILE_LIMIT}.`);
    }
    if (actual > WARNING_LINES) {
      warnings.push(`${name} has ${actual} lines; keep authored CSS partials at or below ${WARNING_LINES} where practical.`);
    }
    if (!existed) continue;

    const previous = baseline.files[name];
    if (!Number.isInteger(previous) || previous < 0) {
      errors.push(`Baseline line count for ${name} must be a non-negative integer.`);
      continue;
    }
    if (actual > WARNING_LINES && actual > previous) {
      const exception = exceptions[name];
      if (!exception || !Number.isInteger(exception.maxLines)
          || typeof exception.reason !== 'string' || exception.reason.trim() === '') {
        errors.push(`${name} grew from ${previous} to ${actual} lines; add a documented exception to permit growth.`);
      } else if (exception.maxLines < previous || actual > exception.maxLines) {
        errors.push(`${name} grew to ${actual} lines, beyond its documented exception cap of ${exception.maxLines}.`);
      }
    }
  }

  return { errors, warnings };
}

if (require.main === module) {
  const { errors, warnings } = checkCssSizes();
  for (const warning of warnings) console.warn(`WARN: ${warning}`);
  for (const error of errors) console.error(`ERROR: ${error}`);
  if (errors.length > 0) process.exitCode = 1;
  else if (warnings.length === 0) console.log('Frontend CSS size policy passed.');
}

module.exports = { checkCssSizes, countLines, isAuthoredPartial };
