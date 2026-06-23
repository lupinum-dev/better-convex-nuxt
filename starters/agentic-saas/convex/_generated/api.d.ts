/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agentRuns from "../agentRuns.js";
import type * as agentThreads from "../agentThreads.js";
import type * as agentTools from "../agentTools.js";
import type * as agentUsage from "../agentUsage.js";
import type * as auth from "../auth.js";
import type * as betterAuthPermissions from "../betterAuthPermissions.js";
import type * as http from "../http.js";
import type * as productRecords from "../productRecords.js";
import type * as projectDeletionRequests from "../projectDeletionRequests.js";
import type * as projectDrafts from "../projectDrafts.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agentRuns: typeof agentRuns;
  agentThreads: typeof agentThreads;
  agentTools: typeof agentTools;
  agentUsage: typeof agentUsage;
  auth: typeof auth;
  betterAuthPermissions: typeof betterAuthPermissions;
  http: typeof http;
  productRecords: typeof productRecords;
  projectDeletionRequests: typeof projectDeletionRequests;
  projectDrafts: typeof projectDrafts;
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
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
  betterAuth: import("../betterAuth/_generated/component.js").ComponentApi<"betterAuth">;
};
