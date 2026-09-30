// Request validation with Ajv, driven by the JSON Schemas in schemas.js.
//
// validate({ query, body, check }) returns middleware that checks the query string and/or body and, when
// both are fine, runs `check(req)` for rules a schema cannot express (e.g. "min must not be above max").
// All problems are collected into ONE 400 VALIDATION_ERROR with one detail per field.

import express from 'express';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { ApiError, validationError } from './errors.js';
import { UUID_PATTERN } from './schemas.js';

const OPTIONS = { allErrors: true, allowUnionTypes: true, useDefaults: true, verbose: true };
// Bodies: no type coercion, so a number sent as "0.5" is an error.
const bodyAjv = addFormats(new Ajv2020(OPTIONS));
// Query strings are always text, so "2" is coerced to 2 (and defaults such as page=1 are filled in).
const queryAjv = addFormats(new Ajv2020({ ...OPTIONS, coerceTypes: true }));

const ATTRIBUTE_KEY_PATTERN = '^[a-z][a-zA-Z0-9]{0,29}$';
const EXAMPLE_UUID = 'c0000000-0000-4000-8000-000000000001';

// When one field breaks several rules, report only the most useful one.
const PRIORITY = ['required', 'additionalProperties', 'singleValue', 'type', 'propertyNames', 'enum', 'const', 'pattern', 'format',
  'minLength', 'maxLength', 'minimum', 'exclusiveMinimum', 'maximum', 'exclusiveMaximum', 'minItems', 'maxItems', 'maxProperties'];
const rank = (rule) => (PRIORITY.includes(rule) ? PRIORITY.indexOf(rule) : PRIORITY.length);

/** '/cards/1/quantity' -> '.cards[1].quantity' */
function pointerToPath(pointer) {
  return pointer.split('/').slice(1)
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((p) => (/^\d+$/.test(p) ? `[${p}]` : `.${p}`))
    .join('');
}

function friendlyMessage(e, where) {
  switch (e.keyword) {
    case 'required':
      return 'is required';
    case 'additionalProperties': {
      const allowed = Object.keys(e.parentSchema.properties ?? {});
      if (where === 'query') {
        return allowed.length ? `is not an allowed query parameter (allowed: ${allowed.join(', ')})` : 'is not allowed: this endpoint takes no query parameters';
      }
      return `is not an allowed field (allowed: ${allowed.join(', ')})`;
    }
    case 'enum':
      return `must be one of: ${e.params.allowedValues.join(', ')}`;
    case 'pattern':
      if (e.params.pattern === UUID_PATTERN) return `must be a lowercase UUID such as ${EXAMPLE_UUID}`;
      if (e.params.pattern === '^https?://') return 'must start with http:// or https://';
      if (e.params.pattern === ATTRIBUTE_KEY_PATTERN) return 'attribute names must start with a lowercase letter and contain only letters and digits (max 30)';
      return e.message;
    case 'format':
      if (e.params.format === 'uuid') return `must be a lowercase UUID such as ${EXAMPLE_UUID}`;
      if (e.params.format === 'uri') return 'must be a valid absolute URL, e.g. https://images.glyphwild.example/cards/x.png';
      if (e.params.format === 'date-time') return 'must be an ISO 8601 date-time such as 2026-01-01T00:00:00.000Z';
      return e.message;
    default:
      return e.message;
  }
}

/** Turns Ajv errors into [{ field, rule, message }]. `where` is 'query', 'body' or 'header'. */
export function toDetails(errors, where) {
  const details = [];
  for (const e of errors) {
    // A bad attribute NAME produces two errors; the inner one (with propertyName) is the useful one.
    if (e.keyword === 'propertyNames') continue;
    let field = where + pointerToPath(e.instancePath);
    let rule = e.keyword;
    let message = friendlyMessage(e, where);
    if (e.propertyName != null) {
      field += `.${e.propertyName}`;
      rule = 'propertyNames';
    } else if (e.keyword === 'required') {
      field += `.${e.params.missingProperty}`;
    } else if (e.keyword === 'additionalProperties') {
      field += `.${e.params.additionalProperty}`;
    } else if (where === 'query' && e.keyword === 'type' && Array.isArray(e.data)) {
      rule = 'singleValue';
      message = new Set(e.data).size === 1
        ? `was given ${e.data.length} times with the same value; the URL already contains it (e.g. from the Location header), so don't also pass it in params`
        : 'must be given only once';
    }
    details.push({ field, rule, message });
  }
  return details;
}

/** Keeps one detail per field (the highest-priority rule) and sorts by field, then rule. */
export function finalizeDetails(details) {
  const byField = new Map();
  for (const d of details) {
    const current = byField.get(d.field);
    if (!current || rank(d.rule) < rank(current.rule)) byField.set(d.field, d);
  }
  // numeric: true sorts body.cards[2] before body.cards[11].
  return [...byField.values()].sort((a, b) => a.field.localeCompare(b.field, 'en', { numeric: true }) || a.rule.localeCompare(b.rule));
}

/** Middleware factory. The validated (coerced, defaulted) query is stored in req.validQuery. */
export function validate({ query, body, check } = {}) {
  const checkQuery = query && queryAjv.compile(query);
  const checkBody = body && bodyAjv.compile(body);
  return (req, res, next) => {
    const details = [];
    if (checkQuery) {
      // Express 5 makes req.query a getter that returns a fresh object each time, so validate a copy.
      const q = { ...req.query };
      if (!checkQuery(q)) details.push(...toDetails(checkQuery.errors, 'query'));
      req.validQuery = q;
    }
    if (checkBody && !checkBody(req.body)) details.push(...toDetails(checkBody.errors, 'body'));
    if (details.length === 0 && check) details.push(...check(req));
    if (details.length) throw validationError(finalizeDetails(details));
    next();
  };
}

/** Rejects a missing or non-JSON body with 415, with a message that says what was actually received. */
function requireParsedBody(req, res, next) {
  if (req.body !== undefined) return next();
  const contentType = req.get('Content-Type');
  const hasBody = Number(req.get('Content-Length') ?? 0) > 0 || req.get('Transfer-Encoding') !== undefined;
  const message = hasBody
    ? `Content-Type was '${contentType ?? 'missing'}'; send the body as JSON with 'Content-Type: application/json'. `
      + 'In Playwright pass a plain object as data (a JSON.stringify(...) string is sent as application/octet-stream).'
    : 'No request body was sent. This endpoint needs a JSON object; in Playwright pass data: { ... }.';
  throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', message, {
    details: [{ field: 'header.content-type', rule: 'mediaType', message: `received ${contentType ?? 'no Content-Type'}${hasBody ? '' : ' and no body'}` }],
  });
}

/** JSON body parsing for routes that take a body. Listed per route, after the auth checks. */
export const jsonBody = [express.json({ limit: '100kb' }), requireParsedBody];
