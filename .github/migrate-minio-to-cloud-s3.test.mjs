import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'deploy/scripts/copy-minio-to-cloud-s3.sh');
const source = existsSync(script) ? readFileSync(script, 'utf8') : '';

test('MinIO to Cloud.ru copy defaults to dry-run and never removes destination objects', () => {
  assert.match(source, /--dry-run/);
  assert.match(source, /--apply/);
  assert.doesNotMatch(source, /mc mirror[^\n]*--remove/);
});

test('MinIO to Cloud.ru copy discovers every bucket and verifies object checksums', () => {
  assert.match(source, /mc ls --json minio\//);
  assert.match(source, /item\.get\("type"\) == "folder"/);
  assert.match(source, /mc mirror --overwrite --md5 --summary/);
});

test('MinIO to Cloud.ru copy consumes source and target settings from environment', () => {
  assert.match(source, /MINIO_ROOT_USER/);
  assert.match(source, /MINIO_ROOT_PASSWORD/);
  assert.match(source, /MINIO_ACCESS_KEY/);
  assert.match(source, /MINIO_SECRET_KEY/);
  assert.match(source, /S3_ENDPOINT/);
  assert.match(source, /S3_SECURE/);
});
