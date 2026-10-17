import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sampleMap } from '../../src/content/maps';
import { runCs2Adapter } from '../../src/integrations/cs2';

describe('CS2 adapter', () => {
  it('runs argv hooks without a shell and writes a versioned manifest', async () => {
    const out = mkdtempSync(join(tmpdir(), 'cs-map-adapter-'));
    const manifest = await runCs2Adapter(
      sampleMap(),
      {
        steps: [
          {
            name: 'compile',
            command: {
              executable: process.execPath,
              args: ['-e', 'process.stdout.write(process.argv[1])', '{map}'],
              timeoutMs: 5000,
            },
          },
        ],
      },
      out,
    );
    expect(manifest.status).toBe('complete');
    expect(manifest.steps[0].stdout).toContain('hammer-blockout.txt');
    expect(JSON.parse(readFileSync(join(out, 'run-manifest.json'), 'utf8')).mapHash).toBe(
      manifest.mapHash,
    );
  });
});
