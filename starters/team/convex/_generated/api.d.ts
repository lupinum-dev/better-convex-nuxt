/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_authEmail from "../lib/authEmail.js";
import type * as lib_authz from "../lib/authz.js";
import type * as lib_betterAuthRows from "../lib/betterAuthRows.js";
import type * as lib_rateLimits from "../lib/rateLimits.js";
import type * as lib_validation from "../lib/validation.js";
import type * as organizations from "../organizations.js";
import type * as projects from "../projects.js";
import type * as teams from "../teams.js";
import type * as testHelpers from "../testHelpers.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  invitations: typeof invitations;
  "lib/audit": typeof lib_audit;
  "lib/authEmail": typeof lib_authEmail;
  "lib/authz": typeof lib_authz;
  "lib/betterAuthRows": typeof lib_betterAuthRows;
  "lib/rateLimits": typeof lib_rateLimits;
  "lib/validation": typeof lib_validation;
  organizations: typeof organizations;
  projects: typeof projects;
  teams: typeof teams;
  testHelpers: typeof testHelpers;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
