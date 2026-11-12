import { describe, expect, it } from 'vitest';
import { downloadWithProgress } from './runtime';

/** A response whose body arrives in chunks. */
function chunked(sizes: number[], withLength = true): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const n of sizes) controller.enqueue(new Uint8Array(n));
      controller.close();
    },
  });
  const total = sizes.reduce((a, b) => a + b, 0);
  return new Response(body, { headers: withLength ? { 'content-length': String(total) } : {} });
}

describe('downloadWithProgress', () => {
  it('reports bytes across files until everything has arrived', async () => {
    const files: Record<string, number[]> = { '/a': [100, 200, 300], '/b': [50, 50] };
    const seen: [number, number][] = [];
    await downloadWithProgress(Object.keys(files), (loaded, total) => seen.push([loaded, total]), async (url) => chunked(files[String(url)]));
    const last = seen.at(-1)!;
    expect(last).toEqual([700, 700]);
    // Never goes backwards, and never claims more than the total.
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
    for (const [loaded, total] of seen) expect(loaded).toBeLessThanOrEqual(total);
  });

  it('still finishes when the server sends no length', async () => {
    const seen: [number, number][] = [];
    await downloadWithProgress(['/x'], (l, t) => seen.push([l, t]), async () => chunked([10, 20], false));
    expect(seen.at(-1)).toEqual([30, 30]);
  });

  it('fails with the file name when a download fails', async () => {
    await expect(downloadWithProgress(['https://x/vendor/pyodide/pyodide.asm.wasm'], () => {}, async () => new Response('nope', { status: 404 }))).rejects.toThrow(
      "Couldn't download pyodide.asm.wasm (404)",
    );
  });
});
