/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as access from "../access.js";
import type * as agentCredentials from "../agentCredentials.js";
import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as memberships from "../memberships.js";
import type * as organizations from "../organizations.js";
import type * as projects from "../projects.js";
import type * as rateLimits from "../rateLimits.js";
import type * as serviceActors from "../serviceActors.js";
import type * as users from "../users.js";
import type * as validation from "../validation.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  access: typeof access;
  agentCredentials: typeof agentCredentials;
  approvals: typeof approvals;
  auth: typeof auth;
  http: typeof http;
  memberships: typeof memberships;
  organizations: typeof organizations;
  projects: typeof projects;
  rateLimits: typeof rateLimits;
  serviceActors: typeof serviceActors;
  users: typeof users;
  validation: typeof validation;
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
  betterAuth: import("better-convex-nuxt/convex-auth/_generated/component.js").ComponentApi<"betterAuth">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
