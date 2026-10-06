// Vercel Function entry point (Node.js runtime, Web-standard fetch handler).
// All /api/* requests are rewritten here (see vercel.json); src/server/app.js routes them.
import app from '../src/server/app.js';
export default app;
