// Swagger UI at /docs/, the OpenAPI document at /openapi.json, and standalone JSON Schemas at /schemas.

import swaggerUi from 'swagger-ui-express';
import { ApiError } from './errors.js';
import { PUBLIC_SCHEMAS } from './schemas.js';

// Runs in the BROWSER after every "Try it out" response. After a successful POST /auth/login it puts the
// token into the "Authorize" dialog, so the padlocks close and later calls send "Authorization: Bearer <token>".
// KEEP THIS A PLAIN `function (...) {}` THAT ONLY USES BROWSER GLOBALS: swagger-ui-express copies the
// function's SOURCE TEXT into /docs/swagger-ui-init.js, so variables from this module do not exist there.
const responseInterceptor = function (res) {
  try {
    var ui = window.ui;
    if (ui && res && res.ok && /\/auth\/login(\?|$)/.test(res.url) && res.body && res.body.token) {
      ui.preauthorizeApiKey('bearerAuth', res.body.token); // the raw token, without "Bearer "
    }
  } catch (e) {
    console.warn('[glyphwild] could not apply the login token automatically', e);
  }
  return res;
};

/** Mounts the docs routes on the app. */
export function mountDocs(app) {
  // swagger-ui-dist also ships a stock demo page; hide it so nobody lands on the Petstore example.
  app.get('/docs/index.html', (req, res) => res.redirect(301, '/docs/'));
  // Static Swagger UI assets and the generated init script. /docs redirects to /docs/.
  app.use('/docs', swaggerUi.serve);
  // The page itself, only for GET/HEAD on /docs/ (anything else under /docs falls through to the JSON 404/405).
  app.get('/docs/', swaggerUi.setup(null, {
    customSiteTitle: 'Glyphwild TCG API - docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      url: '/openapi.json', // the same document you can download
      tryItOutEnabled: true, // "Try it out" is already switched on
      displayRequestDuration: true, // makes LATENCY_MS / X-Delay-Ms visible
      persistAuthorization: false, // tokens die on restart, so do not keep stale ones after a page refresh
      validatorUrl: null, // no calls to swagger.io; works offline
      docExpansion: 'list',
      defaultModelsExpandDepth: 1,
      responseInterceptor,
    },
  }));

  app.get('/openapi.json', (req, res) => {
    // Absolute server URL, so Postman/Bruno imports point at this host and port.
    res.json({ ...req.app.locals.openapi, servers: [{ url: `${req.protocol}://${req.get('host')}`, description: 'This server' }] });
  });

  app.get('/schemas', (req, res) => {
    res.json({
      items: Object.entries(PUBLIC_SCHEMAS).map(([name, schema]) => ({ name, url: `/schemas/${name}.json`, description: schema.description })),
    });
  });

  app.get('/schemas/:file', (req, res) => {
    const name = /^([A-Za-z]+)\.json$/.exec(req.params.file)?.[1];
    const schema = name && Object.hasOwn(PUBLIC_SCHEMAS, name) ? PUBLIC_SCHEMAS[name] : undefined;
    if (!schema) {
      throw new ApiError(404, 'NOT_FOUND', `No schema named '${req.params.file}'. See /schemas for the list.`);
    }
    res.json(schema);
  });
}
