import { defineMiddleware } from "astro:middleware";

import { getApp } from "./lib/server/app";

/** Boots the DB, GitHub client and sync scheduler on the first request (idempotent). */
export const onRequest = defineMiddleware((_context, next) => {
  getApp();
  return next();
});
