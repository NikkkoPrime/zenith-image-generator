/**
 * Vercel Edge Functions - API Handler
 *
 * This file handles all /api/* routes when deployed to Vercel.
 * Uses Vercel's Edge Runtime for optimal performance.
 */

import { handle } from 'hono/vercel'
import { createApp } from '../../api/src/app'

// Use Edge Runtime for better performance
export const config = {
  runtime: 'edge',
}

// Parse CORS origins from environment variable
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

const app = createApp({ corsOrigins })

export default handle(app)
