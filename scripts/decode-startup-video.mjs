import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const sourcePath = path.join(repoRoot, 'public', 'nocturpod-intro.mp4.b64');
const targetPath = path.join(repoRoot, 'public', 'nocturpod-intro.mp4');

try {
  const base64 = (await readFile(sourcePath, 'utf8')).trim();
  if (!base64 || !/^[A-Za-z0-9+/]+=*$/.test(base64) || base64.length % 4 !== 0) {
    throw new Error('The bundled startup-video base64 source is invalid.');
  }

  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length < 1000 || bytes.subarray(4, 8).toString('ascii') !== 'ftyp') {
    throw new Error('Decoded startup asset is not a valid MP4 container.');
  }

  await writeFile(targetPath, bytes);
  console.log(`Prepared NocturPod startup video (${bytes.length} bytes).`);
} catch (error) {
  console.error('Failed to prepare the NocturPod startup video:', error.message);
  process.exitCode = 1;
}
