# Facebook Login (OAuth / Graph API) - practical summary for an MVP

## Overview
When a person logs into an app using Facebook Login, the app receives only the subset of that person’s Facebook data corresponding to the permissions (scopes) the person granted; some permissions are treated as defaults while others require explicit consent and platform review before they can be used by non-developer accounts [1].

## 1) Permissions (what they allow an app to read)
The available permission model and examples supported by the current Graph API/login documentation (as represented in the available evidence) can be summarized as follows:

- Default permission
  - public_profile - included in every login request and returned by default; apps cannot request to omit it [2].

- Common explicit-consent permissions (examples from the evidence)
  - email - grants access to the person’s primary email address (added to /me/permissions after the user grants it) [2], [3].
  - user_likes (pages liked) - access to the pages a person has liked; data is returned via the Graph endpoint /{user-id}/likes (GET) rather than as a single flat profile field [4].
  - user_photos - allows an app to retrieve a person’s published photos [5].
  - app_friends (friends who use the app) - returns the list of the person’s friends who also use the app; friend data is limited to other app users [2].
  - Extended profile/sensitive properties (examples) - certain profile properties (labelled “extended” or “sensitive”) require extra scrutiny (and display separately in the login flow); user_gender and user_age_range have been referenced as advanced-access examples in platform guidance [2], [12].

- Removed / deprecated capabilities
  - publish_actions (ability to publish to a person’s timeline on their behalf) has been deprecated and is no longer available; apps are encouraged to use client-side Share dialogs instead [6].

Note: the evidence does not contain a complete enumerated current permission list; the above items are those explicitly mentioned in the available documents. All permission requests and the ability to re-request declined permissions are surfaced via the Login Dialog and can be checked programmatically via /me/permissions after login [3].

## 2) Review, verification, restricted access, and special conditions
- App Review and scope use: Any permission beyond public_profile and email requires App Review before the app may be used by people who are not listed as developers, testers, or admins of the app [2].
- Business Verification: advanced access around certain permissions is subject to Business Verification and a rollout policy (apps created after Feb 1, 2023 or apps that become eligible for advanced access are subject to verification) [7], [8].
- Restricted or limited access and friend-data rules: “friends” data is limited to friends who also use the app; extended profile fields are treated as sensitive and shown on a separate screen in login flows [2].
- Deprecations/changes: publish_actions was deprecated and removed for posting-as-user use cases [6].
- Re-ask behavior and permission state: the Login Dialog supports re-asking for a previously declined permission; /me/permissions reflects which permissions are currently granted [3].

## 3) Personal-preferences (likes / interests / pages / media)
- Pages liked and similar “likes” data are exposed via the user_likes permission and retrieved from the Graph endpoint /{user-id}/likes (GET); this is structured as the likes edge rather than a single profile field [4].
- Other personal-preference categories (e.g., music/movies/books/interests) are not described in the provided evidence; therefore it is not possible from these sources to list the exact permission names or endpoints for those categories or to state whether they are returned as structured fields or endpoints.
- For MVP testing: permissions beyond public_profile/email (including user_likes) require App Review for non-role users, but developer/tester/admin roles can be used to test without review [2].

## 4) Practical minimal setup and testing workflow for an MVP
What the evidence documents support as minimal, testable actions:
- Use developer/test roles: apps can be used by developers, admins, and testers for functional testing without completing App Review; App Review is required to move beyond those roles [2].
- Login flow behavior to validate locally: FB.login must be invoked from a user action (e.g., a button handler) to avoid popup blockers, and after granting permissions the app can confirm granted scopes via /me/permissions [3].
- App Review submission checklist (what Meta expects when moving to non-role users): when preparing for review, populate App Settings (app icon, Privacy Policy URL, app purpose/category, primary contact), select permissions/features to request, complete Business Verification when required, and answer data-handling questions per the submission guide [9].

Tools and speed-ups mentioned in platform guidance and submission materials: use developer/test roles and the Login Dialog to re-request declined permissions; use /me/permissions to verify granted scopes during testing [3], [9].

Time estimates from the evidence:
- Initial developer app and role-based testing: the evidence does not provide explicit minute/hour timings for creating an app and adding test roles; the documentation implies developer testing can proceed immediately once an app and roles exist but exact setup duration is not specified in the provided sources (see Evidence Gaps).
- App Review and Business Verification: reviewers and Meta communications indicate App Review can take multiple weeks; an industry report cites an average of roughly 20 days for first-time approvals, and Business Verification windows/rollouts give at least 30 days to submit when notified [7], [11]. Exact timelines vary by permission sensitivity and completeness of the submission.

## 5) Limitations and common gotchas for an MVP
- Rate limits: all Graph API requests are subject to platform rate limits and may be throttled; rate limits may differ by token type and app activity level and can include CPU/time-based caps. Exceeding limits returns specific error codes and headers that indicate throttling and estimated time to regain access [10].
- Friend lists: friend data is limited to friends who also use the app (app-scoped) - apps cannot retrieve a full friend list of non-app users [2].
- Deprecated publish capabilities: apps can no longer use publish_actions to post as the user; client-side share dialogs are the replacement for shareable content [6].
- Review rejections: common causes include incomplete documentation or demo steps, broken test environments, missing screen recordings, or insufficient explanation of why a permission is needed; reviewers expect clear demo steps and data-handling answers [11], [9].
- Privacy / data handling requirements: App Review requires completing data-handling questions and App Settings such as Privacy Policy URL; apps should expect to explain how data is collected, stored, and deleted [9].

## Evidence gaps (material items not present in the supplied sources)
- A complete, current enumerated list of all Facebook Login permission names and the exact fields each returns (the sources above provide examples but not a full list).
- Token lifecycle details (short-lived vs long-lived token durations and refresh flows) and explicit guidance on generating test access tokens or system users.
- Platform-specific step-by-step instructions (e.g., exact UI clicks to set redirect URIs, how to create test users) are not present in the evidence provided.

## References
[1] https://developers.facebook.com/documentation/facebook-login/guides/permissions  
[2] https://developers.facebook.com/documentation/facebook-login/guides/permissions/review  
[3] https://developers.facebook.com/documentation/facebook-login/web/permissions  
[4] https://developers.facebook.com/docs/graph-api/reference/user/likes  
[5] https://developers.facebook.com/documentation/facebook-login/guides/permissions.md  
[6] https://zdnet.com/article/facebook-updates-developer-platform-shuts-down-some-apis  
[7] https://developers.facebook.com/blog/post/2023/02/01/developer-platform-requiring-business-verification-for-advanced-access  
[8] https://developers.facebook.com/documentation/development/release/business-verification  
[9] https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide  
[10] https://developers.facebook.com/docs/graph-api/overview/rate-limiting  
[11] https://bundle.social/blog/meta-app-review-20-days  
[12] https://developers.facebook.com/blog/post/2018/05/01/facebook-login-updates-further-protect-privacy
