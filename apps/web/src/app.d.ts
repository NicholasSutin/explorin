import type { Sql } from 'postgres';
import type { AuthUser, Session } from '#lib/server/auth';

declare global {
	namespace App {
		interface Locals {
			/**
			 * Owner key for per-user data: the account id when signed in, otherwise an anonymous
			 * 30-day cookie so the demo and discovery work without an account.
			 */
			uid: string;
			/** Signed-in account, or null. */
			user: AuthUser | null;
			session: Session['session'] | null;
			/** Workers only: this request's database connection, opened lazily by `requestSql()`. */
			sql?: Sql;
		}
	}
}

export {};
