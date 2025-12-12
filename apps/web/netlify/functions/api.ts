/**
 * Netlify Edge Functions - API Handler
 */

import { handle } from 'hono/netlify'
import { createApp } from '../../../api/src/app'

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map((origin: string) => origin.trim())
  : ['http://localhost:5173', 'http://localhost:3000']

const app = createApp({ corsOrigins })

export default handle(app)

export const config = {
  path: '/api/*',
}
