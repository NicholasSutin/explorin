import { fail } from "@sveltejs/kit";
import { appUrl, email, join, waitlistEnabled } from "#lib/server/waitlist";
import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = () => ({ appUrl: appUrl() });

export const actions: Actions = {
  /** Progressive form: works without JavaScript, enhanced with it. */
  join: async ({ request }) => {
    const form = await request.formData();
    // Honeypot: real people never fill a field they cannot see.
    if (form.get("website")) return { status: "added" as const };
    const parsed = email.safeParse(form.get("email"));
    if (!parsed.success)
      return fail(400, {
        error: parsed.error.issues[0]?.message ?? "Please enter your email.",
      });
    if (!waitlistEnabled())
      return fail(503, { error: "The waitlist is not available right now." });
    try {
      const source =
        (form.get("source") as string | null)?.slice(0, 80) ?? null;
      return { status: await join(parsed.data, source) };
    } catch (e) {
      console.error("[waitlist] insert failed", e);
      return fail(500, { error: "Something went wrong. Please try again." });
    }
  },
};
