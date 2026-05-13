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
import type * as auth_actor from "../auth/appIdentity.js";
import type * as auth_guards from "../auth/guards.js";
import type * as features_articles_access from "../features/articles/access.js";
import type * as features_articles_domain from "../features/articles/domain.js";
import type * as features_articles_feature from "../features/articles/feature.js";
import type * as features_articles_index from "../features/articles/index.js";
import type * as features_articles_operations from "../features/articles/operations.js";
import type * as features_articles_permissions from "../features/articles/permissions.js";
import type * as features_articles_redaction from "../features/articles/redaction.js";
import type * as features_articles_shareTokens from "../features/articles/shareTokens.js";
import type * as features_articles_visibility from "../features/articles/visibility.js";
import type * as features_index from "../features/index.js";
import type * as features_knowledgeBases_access from "../features/knowledgeBases/access.js";
import type * as features_knowledgeBases_domain from "../features/knowledgeBases/domain.js";
import type * as features_knowledgeBases_feature from "../features/knowledgeBases/feature.js";
import type * as features_knowledgeBases_index from "../features/knowledgeBases/index.js";
import type * as features_knowledgeBases_permissions from "../features/knowledgeBases/permissions.js";
import type * as features_users_feature from "../features/users/feature.js";
import type * as features_users_index from "../features/users/index.js";
import type * as features_workspaces_domain from "../features/workspaces/domain.js";
import type * as features_workspaces_feature from "../features/workspaces/feature.js";
import type * as features_workspaces_index from "../features/workspaces/index.js";
import type * as functions from "../functions.js";
import type * as http from "../http.js";
import type * as permissions_context from "../permissions/context.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "auth/appIdentity": typeof auth_actor;
  "auth/guards": typeof auth_guards;
  "features/articles/access": typeof features_articles_access;
  "features/articles/domain": typeof features_articles_domain;
  "features/articles/feature": typeof features_articles_feature;
  "features/articles/index": typeof features_articles_index;
  "features/articles/operations": typeof features_articles_operations;
  "features/articles/permissions": typeof features_articles_permissions;
  "features/articles/redaction": typeof features_articles_redaction;
  "features/articles/shareTokens": typeof features_articles_shareTokens;
  "features/articles/visibility": typeof features_articles_visibility;
  "features/index": typeof features_index;
  "features/knowledgeBases/access": typeof features_knowledgeBases_access;
  "features/knowledgeBases/domain": typeof features_knowledgeBases_domain;
  "features/knowledgeBases/feature": typeof features_knowledgeBases_feature;
  "features/knowledgeBases/index": typeof features_knowledgeBases_index;
  "features/knowledgeBases/permissions": typeof features_knowledgeBases_permissions;
  "features/users/feature": typeof features_users_feature;
  "features/users/index": typeof features_users_index;
  "features/workspaces/domain": typeof features_workspaces_domain;
  "features/workspaces/feature": typeof features_workspaces_feature;
  "features/workspaces/index": typeof features_workspaces_index;
  functions: typeof functions;
  http: typeof http;
  "permissions/context": typeof permissions_context;
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
  betterAuth: {
    adapter: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                data: {
                  createdAt: number;
                  displayUsername?: null | string;
                  email: string;
                  emailVerified: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt: number;
                  userId?: null | string;
                  username?: null | string;
                };
                model: "user";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  ipAddress?: null | string;
                  token: string;
                  updatedAt: number;
                  userAgent?: null | string;
                  userId: string;
                };
                model: "session";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId: string;
                  createdAt: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt: number;
                  userId: string;
                };
                model: "account";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt: number;
                  identifier: string;
                  updatedAt: number;
                  value: string;
                };
                model: "verification";
              }
            | {
                data: { backupCodes: string; secret: string; userId: string };
                model: "twoFactor";
              }
            | {
                data: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectUrls?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthApplication";
              }
            | {
                data: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthAccessToken";
              }
            | {
                data: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                model: "oauthConsent";
              }
            | {
                data: {
                  createdAt: number;
                  expiresAt?: null | number;
                  privateKey: string;
                  publicKey: string;
                };
                model: "jwks";
              }
            | {
                data: { count: number; key: string; lastRequest: number };
                model: "rateLimit";
              };
          onCreateHandle?: string;
          select?: Array<string>;
        },
        any
      >;
      deleteMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectUrls"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      deleteOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectUrls"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onDeleteHandle?: string;
        },
        any
      >;
      findMany: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          limit?: number;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "twoFactor"
            | "oauthApplication"
            | "oauthAccessToken"
            | "oauthConsent"
            | "jwks"
            | "rateLimit";
          offset?: number;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
          select?: Array<string>;
          sortBy?: { direction: "asc" | "desc"; field: string };
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      findOne: FunctionReference<
        "query",
        "internal",
        {
          join?: any;
          model:
            | "user"
            | "session"
            | "account"
            | "verification"
            | "twoFactor"
            | "oauthApplication"
            | "oauthAccessToken"
            | "oauthConsent"
            | "jwks"
            | "rateLimit";
          select?: Array<string>;
          where?: Array<{
            connector?: "AND" | "OR";
            field: string;
            operator?:
              | "lt"
              | "lte"
              | "gt"
              | "gte"
              | "eq"
              | "in"
              | "not_in"
              | "ne"
              | "contains"
              | "starts_with"
              | "ends_with";
            value:
              | string
              | number
              | boolean
              | Array<string>
              | Array<number>
              | null;
          }>;
        },
        any
      >;
      updateMany: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name?: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                update: {
                  backupCodes?: string;
                  secret?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                update: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectUrls?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectUrls"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                update: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  expiresAt?: null | number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: { count?: number; key?: string; lastRequest?: number };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
          paginationOpts: {
            cursor: string | null;
            endCursor?: string | null;
            id?: number;
            maximumBytesRead?: number;
            maximumRowsRead?: number;
            numItems: number;
          };
        },
        any
      >;
      updateOne: FunctionReference<
        "mutation",
        "internal",
        {
          input:
            | {
                model: "user";
                update: {
                  createdAt?: number;
                  displayUsername?: null | string;
                  email?: string;
                  emailVerified?: boolean;
                  image?: null | string;
                  isAnonymous?: null | boolean;
                  name?: string;
                  phoneNumber?: null | string;
                  phoneNumberVerified?: null | boolean;
                  twoFactorEnabled?: null | boolean;
                  updatedAt?: number;
                  userId?: null | string;
                  username?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "email"
                    | "emailVerified"
                    | "image"
                    | "createdAt"
                    | "updatedAt"
                    | "twoFactorEnabled"
                    | "isAnonymous"
                    | "username"
                    | "displayUsername"
                    | "phoneNumber"
                    | "phoneNumberVerified"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "session";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  ipAddress?: null | string;
                  token?: string;
                  updatedAt?: number;
                  userAgent?: null | string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "expiresAt"
                    | "token"
                    | "createdAt"
                    | "updatedAt"
                    | "ipAddress"
                    | "userAgent"
                    | "userId"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "account";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  accountId?: string;
                  createdAt?: number;
                  idToken?: null | string;
                  password?: null | string;
                  providerId?: string;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scope?: null | string;
                  updatedAt?: number;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accountId"
                    | "providerId"
                    | "userId"
                    | "accessToken"
                    | "refreshToken"
                    | "idToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "scope"
                    | "password"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "verification";
                update: {
                  createdAt?: number;
                  expiresAt?: number;
                  identifier?: string;
                  updatedAt?: number;
                  value?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "identifier"
                    | "value"
                    | "expiresAt"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "twoFactor";
                update: {
                  backupCodes?: string;
                  secret?: string;
                  userId?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "secret" | "backupCodes" | "userId" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthApplication";
                update: {
                  clientId?: null | string;
                  clientSecret?: null | string;
                  createdAt?: null | number;
                  disabled?: null | boolean;
                  icon?: null | string;
                  metadata?: null | string;
                  name?: null | string;
                  redirectUrls?: null | string;
                  type?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "name"
                    | "icon"
                    | "metadata"
                    | "clientId"
                    | "clientSecret"
                    | "redirectUrls"
                    | "type"
                    | "disabled"
                    | "userId"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthAccessToken";
                update: {
                  accessToken?: null | string;
                  accessTokenExpiresAt?: null | number;
                  clientId?: null | string;
                  createdAt?: null | number;
                  refreshToken?: null | string;
                  refreshTokenExpiresAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "accessToken"
                    | "refreshToken"
                    | "accessTokenExpiresAt"
                    | "refreshTokenExpiresAt"
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "oauthConsent";
                update: {
                  clientId?: null | string;
                  consentGiven?: null | boolean;
                  createdAt?: null | number;
                  scopes?: null | string;
                  updatedAt?: null | number;
                  userId?: null | string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "clientId"
                    | "userId"
                    | "scopes"
                    | "createdAt"
                    | "updatedAt"
                    | "consentGiven"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "jwks";
                update: {
                  createdAt?: number;
                  expiresAt?: null | number;
                  privateKey?: string;
                  publicKey?: string;
                };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field:
                    | "publicKey"
                    | "privateKey"
                    | "createdAt"
                    | "expiresAt"
                    | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              }
            | {
                model: "rateLimit";
                update: { count?: number; key?: string; lastRequest?: number };
                where?: Array<{
                  connector?: "AND" | "OR";
                  field: "key" | "count" | "lastRequest" | "_id";
                  operator?:
                    | "lt"
                    | "lte"
                    | "gt"
                    | "gte"
                    | "eq"
                    | "in"
                    | "not_in"
                    | "ne"
                    | "contains"
                    | "starts_with"
                    | "ends_with";
                  value:
                    | string
                    | number
                    | boolean
                    | Array<string>
                    | Array<number>
                    | null;
                }>;
              };
          onUpdateHandle?: string;
        },
        any
      >;
    };
    adapterTest: {
      runTests: FunctionReference<"action", "internal", any, any>;
    };
    testProfiles: {
      adapterAdditionalFields: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email: string;
                    emailVerified: boolean;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    ipAddress?: null | string;
                    token: string;
                    updatedAt: number;
                    userAgent?: null | string;
                    userId: string;
                  };
                  model: "session";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId: string;
                    createdAt: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt: number;
                    userId: string;
                  };
                  model: "account";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    identifier: string;
                    updatedAt: number;
                    value: string;
                  };
                  model: "verification";
                }
              | {
                  data: { backupCodes: string; secret: string; userId: string };
                  model: "twoFactor";
                }
              | {
                  data: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthApplication";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthAccessToken";
                }
              | {
                  data: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthConsent";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt?: null | number;
                    privateKey: string;
                    publicKey: string;
                  };
                  model: "jwks";
                }
              | {
                  data: { count: number; key: string; lastRequest: number };
                  model: "rateLimit";
                };
            onCreateHandle?: string;
            select?: Array<string>;
          },
          any
        >;
        deleteMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "customField"
                      | "numericField"
                      | "testField"
                      | "cbDefaultValueField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        deleteOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "customField"
                      | "numericField"
                      | "testField"
                      | "cbDefaultValueField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
          },
          any
        >;
        findMany: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            limit?: number;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit";
            offset?: number;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            select?: Array<string>;
            sortBy?: { direction: "asc" | "desc"; field: string };
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        findOne: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit";
            select?: Array<string>;
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        updateMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: string;
                    emailVerified?: boolean;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "customField"
                      | "numericField"
                      | "testField"
                      | "cbDefaultValueField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        updateOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: string;
                    emailVerified?: boolean;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "customField"
                      | "numericField"
                      | "testField"
                      | "cbDefaultValueField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
          },
          any
        >;
      };
      adapterOrganizationJoins: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    ipAddress?: null | string;
                    token: string;
                    updatedAt: number;
                    userAgent?: null | string;
                    userId: string;
                  };
                  model: "session";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId: string;
                    createdAt: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt: number;
                    userId: string;
                  };
                  model: "account";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    identifier: string;
                    updatedAt: number;
                    value: string;
                  };
                  model: "verification";
                }
              | {
                  data: { backupCodes: string; secret: string; userId: string };
                  model: "twoFactor";
                }
              | {
                  data: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthApplication";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthAccessToken";
                }
              | {
                  data: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthConsent";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt?: null | number;
                    privateKey: string;
                    publicKey: string;
                  };
                  model: "jwks";
                }
              | {
                  data: { count: number; key: string; lastRequest: number };
                  model: "rateLimit";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_custom";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_table";
                }
              | { data: { oneToOne: string }; model: "oneToOneTable" }
              | {
                  data: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  model: "one_to_one_table";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  model: "testModel";
                }
              | {
                  data: {
                    createdAt: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name: string;
                    slug: string;
                    updatedAt?: null | number;
                  };
                  model: "organization";
                }
              | {
                  data: {
                    createdAt: number;
                    organizationId: string;
                    role: string;
                    updatedAt?: null | number;
                    userId: string;
                  };
                  model: "member";
                }
              | {
                  data: {
                    createdAt: number;
                    name: string;
                    organizationId: string;
                    updatedAt?: null | number;
                  };
                  model: "team";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    teamId: string;
                    userId: string;
                  };
                  model: "teamMember";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  model: "invitation";
                };
            onCreateHandle?: string;
            select?: Array<string>;
          },
          any
        >;
        deleteMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        deleteOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
          },
          any
        >;
        findMany: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            limit?: number;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            offset?: number;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            select?: Array<string>;
            sortBy?: { direction: "asc" | "desc"; field: string };
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        findOne: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            select?: Array<string>;
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        updateMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        updateOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
          },
          any
        >;
      };
      adapterPluginTable: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    ipAddress?: null | string;
                    token: string;
                    updatedAt: number;
                    userAgent?: null | string;
                    userId: string;
                  };
                  model: "session";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId: string;
                    createdAt: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt: number;
                    userId: string;
                  };
                  model: "account";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    identifier: string;
                    updatedAt: number;
                    value: string;
                  };
                  model: "verification";
                }
              | {
                  data: { backupCodes: string; secret: string; userId: string };
                  model: "twoFactor";
                }
              | {
                  data: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthApplication";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthAccessToken";
                }
              | {
                  data: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthConsent";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt?: null | number;
                    privateKey: string;
                    publicKey: string;
                  };
                  model: "jwks";
                }
              | {
                  data: { count: number; key: string; lastRequest: number };
                  model: "rateLimit";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_custom";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_table";
                }
              | { data: { oneToOne: string }; model: "oneToOneTable" }
              | {
                  data: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  model: "one_to_one_table";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  model: "testModel";
                }
              | {
                  data: {
                    createdAt: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name: string;
                    slug: string;
                    updatedAt?: null | number;
                  };
                  model: "organization";
                }
              | {
                  data: {
                    createdAt: number;
                    organizationId: string;
                    role: string;
                    updatedAt?: null | number;
                    userId: string;
                  };
                  model: "member";
                }
              | {
                  data: {
                    createdAt: number;
                    name: string;
                    organizationId: string;
                    updatedAt?: null | number;
                  };
                  model: "team";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    teamId: string;
                    userId: string;
                  };
                  model: "teamMember";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  model: "invitation";
                };
            onCreateHandle?: string;
            select?: Array<string>;
          },
          any
        >;
        deleteMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        deleteOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
          },
          any
        >;
        findMany: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            limit?: number;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            offset?: number;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            select?: Array<string>;
            sortBy?: { direction: "asc" | "desc"; field: string };
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        findOne: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            select?: Array<string>;
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        updateMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        updateOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
          },
          any
        >;
      };
      adapterRenameField: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    ipAddress?: null | string;
                    token: string;
                    updatedAt: number;
                    userAgent?: null | string;
                    userId: string;
                  };
                  model: "session";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId: string;
                    createdAt: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt: number;
                    userId: string;
                  };
                  model: "account";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    identifier: string;
                    updatedAt: number;
                    value: string;
                  };
                  model: "verification";
                }
              | {
                  data: { backupCodes: string; secret: string; userId: string };
                  model: "twoFactor";
                }
              | {
                  data: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthApplication";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthAccessToken";
                }
              | {
                  data: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthConsent";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt?: null | number;
                    privateKey: string;
                    publicKey: string;
                  };
                  model: "jwks";
                }
              | {
                  data: { count: number; key: string; lastRequest: number };
                  model: "rateLimit";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_custom";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_table";
                }
              | { data: { oneToOne: string }; model: "oneToOneTable" }
              | {
                  data: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  model: "one_to_one_table";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  model: "testModel";
                }
              | {
                  data: {
                    createdAt: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name: string;
                    slug: string;
                    updatedAt?: null | number;
                  };
                  model: "organization";
                }
              | {
                  data: {
                    createdAt: number;
                    organizationId: string;
                    role: string;
                    updatedAt?: null | number;
                    userId: string;
                  };
                  model: "member";
                }
              | {
                  data: {
                    createdAt: number;
                    name: string;
                    organizationId: string;
                    updatedAt?: null | number;
                  };
                  model: "team";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    teamId: string;
                    userId: string;
                  };
                  model: "teamMember";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  model: "invitation";
                };
            onCreateHandle?: string;
            select?: Array<string>;
          },
          any
        >;
        deleteMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        deleteOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
          },
          any
        >;
        findMany: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            limit?: number;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            offset?: number;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            select?: Array<string>;
            sortBy?: { direction: "asc" | "desc"; field: string };
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        findOne: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            select?: Array<string>;
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        updateMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        updateOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
          },
          any
        >;
      };
      adapterRenameUserCustom: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    ipAddress?: null | string;
                    token: string;
                    updatedAt: number;
                    userAgent?: null | string;
                    userId: string;
                  };
                  model: "session";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId: string;
                    createdAt: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt: number;
                    userId: string;
                  };
                  model: "account";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    identifier: string;
                    updatedAt: number;
                    value: string;
                  };
                  model: "verification";
                }
              | {
                  data: { backupCodes: string; secret: string; userId: string };
                  model: "twoFactor";
                }
              | {
                  data: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthApplication";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthAccessToken";
                }
              | {
                  data: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthConsent";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt?: null | number;
                    privateKey: string;
                    publicKey: string;
                  };
                  model: "jwks";
                }
              | {
                  data: { count: number; key: string; lastRequest: number };
                  model: "rateLimit";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_custom";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_table";
                }
              | { data: { oneToOne: string }; model: "oneToOneTable" }
              | {
                  data: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  model: "one_to_one_table";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  model: "testModel";
                }
              | {
                  data: {
                    createdAt: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name: string;
                    slug: string;
                    updatedAt?: null | number;
                  };
                  model: "organization";
                }
              | {
                  data: {
                    createdAt: number;
                    organizationId: string;
                    role: string;
                    updatedAt?: null | number;
                    userId: string;
                  };
                  model: "member";
                }
              | {
                  data: {
                    createdAt: number;
                    name: string;
                    organizationId: string;
                    updatedAt?: null | number;
                  };
                  model: "team";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    teamId: string;
                    userId: string;
                  };
                  model: "teamMember";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  model: "invitation";
                };
            onCreateHandle?: string;
            select?: Array<string>;
          },
          any
        >;
        deleteMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        deleteOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
          },
          any
        >;
        findMany: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            limit?: number;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            offset?: number;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            select?: Array<string>;
            sortBy?: { direction: "asc" | "desc"; field: string };
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        findOne: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            select?: Array<string>;
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        updateMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        updateOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
          },
          any
        >;
      };
      adapterRenameUserTable: {
        create: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    ipAddress?: null | string;
                    token: string;
                    updatedAt: number;
                    userAgent?: null | string;
                    userId: string;
                  };
                  model: "session";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId: string;
                    createdAt: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt: number;
                    userId: string;
                  };
                  model: "account";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt: number;
                    identifier: string;
                    updatedAt: number;
                    value: string;
                  };
                  model: "verification";
                }
              | {
                  data: { backupCodes: string; secret: string; userId: string };
                  model: "twoFactor";
                }
              | {
                  data: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthApplication";
                }
              | {
                  data: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthAccessToken";
                }
              | {
                  data: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  model: "oauthConsent";
                }
              | {
                  data: {
                    createdAt: number;
                    expiresAt?: null | number;
                    privateKey: string;
                    publicKey: string;
                  };
                  model: "jwks";
                }
              | {
                  data: { count: number; key: string; lastRequest: number };
                  model: "rateLimit";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_custom";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    createdAt: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  model: "user_table";
                }
              | { data: { oneToOne: string }; model: "oneToOneTable" }
              | {
                  data: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  model: "one_to_one_table";
                }
              | {
                  data: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  model: "testModel";
                }
              | {
                  data: {
                    createdAt: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name: string;
                    slug: string;
                    updatedAt?: null | number;
                  };
                  model: "organization";
                }
              | {
                  data: {
                    createdAt: number;
                    organizationId: string;
                    role: string;
                    updatedAt?: null | number;
                    userId: string;
                  };
                  model: "member";
                }
              | {
                  data: {
                    createdAt: number;
                    name: string;
                    organizationId: string;
                    updatedAt?: null | number;
                  };
                  model: "team";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    teamId: string;
                    userId: string;
                  };
                  model: "teamMember";
                }
              | {
                  data: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  model: "invitation";
                };
            onCreateHandle?: string;
            select?: Array<string>;
          },
          any
        >;
        deleteMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        deleteOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onDeleteHandle?: string;
          },
          any
        >;
        findMany: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            limit?: number;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            offset?: number;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
            select?: Array<string>;
            sortBy?: { direction: "asc" | "desc"; field: string };
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        findOne: FunctionReference<
          "query",
          "internal",
          {
            join?: any;
            model:
              | "user"
              | "session"
              | "account"
              | "verification"
              | "twoFactor"
              | "oauthApplication"
              | "oauthAccessToken"
              | "oauthConsent"
              | "jwks"
              | "rateLimit"
              | "user_custom"
              | "user_table"
              | "oneToOneTable"
              | "one_to_one_table"
              | "testModel"
              | "organization"
              | "member"
              | "team"
              | "teamMember"
              | "invitation";
            select?: Array<string>;
            where?: Array<{
              connector?: "AND" | "OR";
              field: string;
              operator?:
                | "lt"
                | "lte"
                | "gt"
                | "gte"
                | "eq"
                | "in"
                | "not_in"
                | "ne"
                | "contains"
                | "starts_with"
                | "ends_with";
              value:
                | string
                | number
                | boolean
                | Array<string>
                | Array<number>
                | null;
            }>;
          },
          any
        >;
        updateMany: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
            paginationOpts: {
              cursor: string | null;
              endCursor?: string | null;
              id?: number;
              maximumBytesRead?: number;
              maximumRowsRead?: number;
              numItems: number;
            };
          },
          any
        >;
        updateOne: FunctionReference<
          "mutation",
          "internal",
          {
            input:
              | {
                  model: "user";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "session";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    ipAddress?: null | string;
                    token?: string;
                    updatedAt?: number;
                    userAgent?: null | string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "expiresAt"
                      | "token"
                      | "createdAt"
                      | "updatedAt"
                      | "ipAddress"
                      | "userAgent"
                      | "userId"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "account";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    accountId?: string;
                    createdAt?: number;
                    idToken?: null | string;
                    password?: null | string;
                    providerId?: string;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scope?: null | string;
                    updatedAt?: number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accountId"
                      | "providerId"
                      | "userId"
                      | "accessToken"
                      | "refreshToken"
                      | "idToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "scope"
                      | "password"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "verification";
                  update: {
                    createdAt?: number;
                    expiresAt?: number;
                    identifier?: string;
                    updatedAt?: number;
                    value?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "identifier"
                      | "value"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "twoFactor";
                  update: {
                    backupCodes?: string;
                    secret?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "secret" | "backupCodes" | "userId" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthApplication";
                  update: {
                    clientId?: null | string;
                    clientSecret?: null | string;
                    createdAt?: null | number;
                    disabled?: null | boolean;
                    icon?: null | string;
                    metadata?: null | string;
                    name?: null | string;
                    redirectUrls?: null | string;
                    type?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "icon"
                      | "metadata"
                      | "clientId"
                      | "clientSecret"
                      | "redirectUrls"
                      | "type"
                      | "disabled"
                      | "userId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthAccessToken";
                  update: {
                    accessToken?: null | string;
                    accessTokenExpiresAt?: null | number;
                    clientId?: null | string;
                    createdAt?: null | number;
                    refreshToken?: null | string;
                    refreshTokenExpiresAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "accessToken"
                      | "refreshToken"
                      | "accessTokenExpiresAt"
                      | "refreshTokenExpiresAt"
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oauthConsent";
                  update: {
                    clientId?: null | string;
                    consentGiven?: null | boolean;
                    createdAt?: null | number;
                    scopes?: null | string;
                    updatedAt?: null | number;
                    userId?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "clientId"
                      | "userId"
                      | "scopes"
                      | "createdAt"
                      | "updatedAt"
                      | "consentGiven"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "jwks";
                  update: {
                    createdAt?: number;
                    expiresAt?: null | number;
                    privateKey?: string;
                    publicKey?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "publicKey"
                      | "privateKey"
                      | "createdAt"
                      | "expiresAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "rateLimit";
                  update: {
                    count?: number;
                    key?: string;
                    lastRequest?: number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "key" | "count" | "lastRequest" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_custom";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "user_table";
                  update: {
                    cbDefaultValueField?: null | string;
                    createdAt?: number;
                    customField?: null | string;
                    dateField?: null | number;
                    displayUsername?: null | string;
                    email?: null | string;
                    emailVerified?: boolean;
                    email_address?: null | string;
                    image?: null | string;
                    isAnonymous?: null | boolean;
                    name?: string;
                    numericField?: null | number;
                    phoneNumber?: null | string;
                    phoneNumberVerified?: null | boolean;
                    testField?: null | string;
                    twoFactorEnabled?: null | boolean;
                    updatedAt?: number;
                    userId?: null | string;
                    username?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "email"
                      | "email_address"
                      | "emailVerified"
                      | "image"
                      | "createdAt"
                      | "updatedAt"
                      | "twoFactorEnabled"
                      | "isAnonymous"
                      | "username"
                      | "displayUsername"
                      | "phoneNumber"
                      | "phoneNumberVerified"
                      | "userId"
                      | "testField"
                      | "cbDefaultValueField"
                      | "customField"
                      | "numericField"
                      | "dateField"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "oneToOneTable";
                  update: { oneToOne?: string };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "one_to_one_table";
                  update: {
                    oneToOne?: null | string;
                    one_to_one?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "oneToOne" | "one_to_one" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "testModel";
                  update: {
                    cbDefaultValueField?: null | string;
                    json?: any;
                    nullableReference?: null | string;
                    numberArray?: null | Array<number>;
                    stringArray?: null | Array<string>;
                    testField?: null | string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "nullableReference"
                      | "testField"
                      | "cbDefaultValueField"
                      | "stringArray"
                      | "numberArray"
                      | "json"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "organization";
                  update: {
                    createdAt?: number;
                    logo?: null | string;
                    metadata?: null | string;
                    name?: string;
                    slug?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "slug"
                      | "logo"
                      | "metadata"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "member";
                  update: {
                    createdAt?: number;
                    organizationId?: string;
                    role?: string;
                    updatedAt?: null | number;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "organizationId"
                      | "userId"
                      | "role"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "team";
                  update: {
                    createdAt?: number;
                    name?: string;
                    organizationId?: string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "name"
                      | "organizationId"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "teamMember";
                  update: {
                    createdAt?: null | number;
                    teamId?: string;
                    userId?: string;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field: "teamId" | "userId" | "createdAt" | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                }
              | {
                  model: "invitation";
                  update: {
                    createdAt?: null | number;
                    email?: null | string;
                    expiresAt?: null | number;
                    inviterId?: null | string;
                    organizationId?: null | string;
                    role?: null | string;
                    status?: null | string;
                    teamId?: null | string;
                    updatedAt?: null | number;
                  };
                  where?: Array<{
                    connector?: "AND" | "OR";
                    field:
                      | "email"
                      | "role"
                      | "status"
                      | "organizationId"
                      | "teamId"
                      | "inviterId"
                      | "expiresAt"
                      | "createdAt"
                      | "updatedAt"
                      | "_id";
                    operator?:
                      | "lt"
                      | "lte"
                      | "gt"
                      | "gte"
                      | "eq"
                      | "in"
                      | "not_in"
                      | "ne"
                      | "contains"
                      | "starts_with"
                      | "ends_with";
                    value:
                      | string
                      | number
                      | boolean
                      | Array<string>
                      | Array<number>
                      | null;
                  }>;
                };
            onUpdateHandle?: string;
          },
          any
        >;
      };
    };
  };
};
