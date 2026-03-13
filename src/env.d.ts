/// <reference types="astro/client" />

type CloudflareRuntime = import('@astrojs/cloudflare').Runtime<import('./lib/db/schema.js').Env>;

declare namespace App {
  interface Locals extends CloudflareRuntime {}
}
