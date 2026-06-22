/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeyExperiments from "../apiKeyExperiments.js";
import type * as auth from "../auth.js";
import type * as billingPlans from "../billingPlans.js";
import type * as experiments from "../experiments.js";
import type * as http from "../http.js";
import type * as memberProfileExperiments from "../memberProfileExperiments.js";
import type * as oauthTokenExperiments from "../oauthTokenExperiments.js";
import type * as productAuthExperiments from "../productAuthExperiments.js";
import type * as projects from "../projects.js";
import type * as stripeEntitlementExperiments from "../stripeEntitlementExperiments.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeyExperiments: typeof apiKeyExperiments;
  auth: typeof auth;
  billingPlans: typeof billingPlans;
  experiments: typeof experiments;
  http: typeof http;
  memberProfileExperiments: typeof memberProfileExperiments;
  oauthTokenExperiments: typeof oauthTokenExperiments;
  productAuthExperiments: typeof productAuthExperiments;
  projects: typeof projects;
  stripeEntitlementExperiments: typeof stripeEntitlementExperiments;
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
};
