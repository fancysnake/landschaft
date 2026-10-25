import { defineMiddleware } from "astro:middleware";

import { getApp } from "./lib/inits";

/** Boots the DB, GitHub client and sync scheduler on the first request (idempotent). */
export const onRequest = defineMiddleware((context, next) => {
  context.locals.services = getApp().services;
  return next();
});
