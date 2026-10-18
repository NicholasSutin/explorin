/// <reference types="google.maps" />
import type { Sql } from 'postgres';
import type { AuthUser, Session } from '#lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			/** Owner key for per-user data: the signed-in account id ('' for guests, who only reach public pages). */
			uid: string;
			/** Signed-in account, or null. */
			user: AuthUser | null;
			session: Session['session'] | null;
			/** Workers only: this request's database connection, opened lazily by `requestSql()`. */
			sql?: Sql;
			/** Promises started by `background()`; usage is flushed (and on Workers `sql` closed) once they settle. */
			background?: Promise<void>[];
			/** Billed upstream calls made for this request, written by hooks.server.ts after the response. */
			usage?: import('#lib/server/usage').UsageEvent[];
		}
	}
}

export {};
