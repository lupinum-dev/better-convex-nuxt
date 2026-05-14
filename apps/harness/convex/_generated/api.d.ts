/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as auth_actingFor from "../auth/actingFor.js";
import type * as auth_appIdentity from "../auth/appIdentity.js";
import type * as auth_caller from "../auth/caller.js";
import type * as auth_checks from "../auth/checks.js";
import type * as auth_permissions from "../auth/permissions.js";
import type * as auth_resource from "../auth/resource.js";
import type * as auth_scope from "../auth/scope.js";
import type * as comments from "../comments.js";
import type * as crossTenant from "../crossTenant.js";
import type * as expAtomicExecute from "../expAtomicExecute.js";
import type * as expAutoCompound from "../expAutoCompound.js";
import type * as expCrypto from "../expCrypto.js";
import type * as expEnvelopeBinding from "../expEnvelopeBinding.js";
import type * as expOperationsAsObjects from "../expOperationsAsObjects.js";
import type * as expPagination from "../expPagination.js";
import type * as expPerTableScope from "../expPerTableScope.js";
import type * as expRunAsService from "../expRunAsService.js";
import type * as expRunAsUser from "../expRunAsUser.js";
import type * as expScopedProxy from "../expScopedProxy.js";
import type * as expServicePrincipal from "../expServicePrincipal.js";
import type * as expThreeDoors from "../expThreeDoors.js";
import type * as expValueCtx from "../expValueCtx.js";
import type * as expWorkspaceInject from "../expWorkspaceInject.js";
import type * as functions from "../functions.js";
import type * as functionsProbe from "../functionsProbe.js";
import type * as http from "../http.js";
import type * as lib_user_row from "../lib/user_row.js";
import type * as mcpKeys from "../mcpKeys.js";
import type * as notes from "../notes.js";
import type * as organizations from "../organizations.js";
import type * as posts from "../posts.js";
import type * as tasks from "../tasks.js";
import type * as testing from "../testing.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "auth/actingFor": typeof auth_actingFor;
  "auth/appIdentity": typeof auth_appIdentity;
  "auth/caller": typeof auth_caller;
  "auth/checks": typeof auth_checks;
  "auth/permissions": typeof auth_permissions;
  "auth/resource": typeof auth_resource;
  "auth/scope": typeof auth_scope;
  comments: typeof comments;
  crossTenant: typeof crossTenant;
  expAtomicExecute: typeof expAtomicExecute;
  expAutoCompound: typeof expAutoCompound;
  expCrypto: typeof expCrypto;
  expEnvelopeBinding: typeof expEnvelopeBinding;
  expOperationsAsObjects: typeof expOperationsAsObjects;
  expPagination: typeof expPagination;
  expPerTableScope: typeof expPerTableScope;
  expRunAsService: typeof expRunAsService;
  expRunAsUser: typeof expRunAsUser;
  expScopedProxy: typeof expScopedProxy;
  expServicePrincipal: typeof expServicePrincipal;
  expThreeDoors: typeof expThreeDoors;
  expValueCtx: typeof expValueCtx;
  expWorkspaceInject: typeof expWorkspaceInject;
  functions: typeof functions;
  functionsProbe: typeof functionsProbe;
  http: typeof http;
  "lib/user_row": typeof lib_user_row;
  mcpKeys: typeof mcpKeys;
  notes: typeof notes;
  organizations: typeof organizations;
  posts: typeof posts;
  tasks: typeof tasks;
  testing: typeof testing;
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
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
