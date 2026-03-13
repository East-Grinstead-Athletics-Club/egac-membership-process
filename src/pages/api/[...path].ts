// src/pages/api/[...path].ts
// Catch-all API route — delegates every /api/* request to the router.
import type { APIRoute } from 'astro';
import { handleRequest } from '../../api/router.js';

export const ALL: APIRoute = ({ request, locals }) => {
  return handleRequest(request, locals.runtime.env);
};
