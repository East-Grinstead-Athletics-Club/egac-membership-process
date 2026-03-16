/// <reference path="../.astro/types.d.ts" />
import '../.astro/types.d.ts';
import 'astro/client';

type CloudflareRuntime = import('@astrojs/cloudflare').Runtime<import('./lib/db/schema.js').Env>;

declare global {
  namespace App {
    interface Locals extends CloudflareRuntime {}
  }
}

export {};
