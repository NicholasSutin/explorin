# LinkedIn OAuth for an MVP: scopes, retrievable user data, preferences, and setup timeline

## Executive summary

For a current LinkedIn MVP, the self-serve sign-in path is centered on OpenID Connect scopes rather than the older LinkedIn-specific profile scopes. The current self-serve identity scopes are `openid`, `profile`, and `email`; LinkedIn’s self-serve docs describe these as the scopes for “Sign In with LinkedIn.” `openid` enables OpenID Connect authentication and ID token issuance, `profile` allows retrieval of the member’s lite profile, and `email` allows retrieval of the member’s primary email address [1], [2]. LinkedIn also still documents older “open permissions” such as `r_liteprofile` and `r_emailaddress`, but multiple sources state these classic scopes were deprecated for newly created apps as of August 1, 2023, so new apps should expect to use `openid profile email` instead [3], [4], [5].

For basic user data, the evidence supports access to: a stable user identifier (`sub` via OpenID Connect userinfo, and LinkedIn profile `id` in lite-profile contexts), name fields, profile photo, locale, primary email address, and `email_verified` through the OIDC userinfo flow [1], [6]. More profile-adjacent fields such as headline and vanity name are associated with `r_basicprofile`, which is not shown as a self-serve open permission in the current official “getting access” material and appears to require more limited access [7], [8]. Full profile access (`r_fullprofile`) is closed and no longer available to developers [9].

On “personal preferences,” the provided evidence does not show any self-serve LinkedIn OAuth/API scope that exposes a user’s personal preferences. No official source in the evidence set lists preference categories available through the self-serve sign-in APIs. The practical limitation is that LinkedIn’s current self-serve identity access is narrow, while many broader datasets require product approval or partner programs [2], [10], [11].

For setup speed, the evidence supports a fast self-serve start for an MVP: a developer can create an app, obtain client credentials, configure redirect URIs, request self-serve scopes/products, and begin authenticating users without a documented mandatory waiting period for the basic self-serve products. However, scope availability depends on the products enabled for the app, and partner-gated APIs require application/approval before use [12], [10], [11]. The evidence does not provide an official fixed SLA for approval timing.

## Current LinkedIn OAuth scopes relevant to sign-in and user data

### Self-serve sign-in scopes for new apps

LinkedIn’s current self-serve “Sign In with LinkedIn” documentation says the authorization request must include `openid` to receive an ID token. It also introduces `profile` and `email` as the scopes for sign-in: `profile` is required to retrieve the member’s lite profile, including id, name, and profile picture; `email` is required to retrieve the member’s email address [1]. Another LinkedIn/Microsoft doc classifies the open permissions available to all developers as `profile`, `email`, and `w_member_social` [2].

A practical implication for an MVP is that `openid profile email` is the current baseline for authentication plus basic identity retrieval for new apps [1], [3], [4].

### Older profile scopes still documented, but with a transition caveat

LinkedIn’s broader authentication documentation still mentions open permissions `r_liteprofile`, `r_emailaddress`, and `w_member_social` [5]. Official profile references also describe `r_liteprofile` as granting access to lite profile fields, and older implementations used `r_emailaddress` for email retrieval [13], [14]. However, multiple non-official but consistent sources report that `r_liteprofile` and `r_emailaddress` are deprecated for newly created apps and cause authorization errors in many modern integrations unless replaced by `openid profile email` [3], [4], [15].

Because of this mixed evidence, the safest reading is:

- For new MVP apps: use `openid profile email`.
- For legacy apps or legacy docs: `r_liteprofile` and `r_emailaddress` may still appear in documentation and code examples, but should not be assumed available to new apps [1], [3], [4], [5].

### Other commonly encountered scopes

`w_member_social` is a self-serve open permission for posting, commenting, and liking on behalf of a member; it is commonly enabled alongside sign-in if the MVP needs publishing rather than just authentication [2], [5]. Beyond that, many other APIs are partner-gated. The evidence specifically points to marketing, sales, recruiting, and other specialized APIs requiring product access or partner program approval rather than being generally available by default [10], [11], [16].

## What data can actually be retrieved about a user

### Data available in the self-serve sign-in flow

The strongest evidence for current self-serve user data comes from the OIDC-based sign-in materials. With `openid profile email`, the OpenID Connect userinfo endpoint returns:

- `sub`
- `name`
- `given_name`
- `family_name`
- `picture`
- `locale`
- `email`
- `email_verified` [6]

LinkedIn’s official sign-in page also states that `profile` is required to retrieve the member’s lite profile, including id, name, and profile picture, while `email` is required for the member’s email address [1].

For an MVP, this supports the following reliable user-data set for self-serve sign-in: user identifier, full/given/family name, profile image, locale, primary email, and email verification flag [1], [6].

### Exact lite-profile fields in legacy profile scope documentation

Where `r_liteprofile` is available, LinkedIn’s lite-profile reference lists these fields:

- `id`
- `firstName`
- `localizedFirstName`
- `lastName`
- `localizedLastName`
- `profilePicture` [13]

This aligns closely with the OIDC `profile` outcome, although the field names differ between endpoints and the evidence does not explicitly map every field one-to-one across both response formats [1], [6], [13].

### Data that is more restricted

Official profile API documentation states that by default the Profile API returns only Lite Profile fields. To retrieve more for the authenticated user, `r_basicprofile` is described as enabling name, photo, headline, and vanity name [7]. A secondary source confirms `vanityName` and `localizedHeadline` under `r_basicprofile` [8]. But the current self-serve access docs do not list `r_basicprofile` as an open permission available to all developers [2]. That suggests headline and vanity URL are not part of the standard self-serve sign-in package for a new MVP unless LinkedIn separately grants access.

Full profile access is not a current option for general developers: `r_fullprofile` is closed and no longer available [9].

## Personal preferences and sensitive/profile-adjacent data

The evidence provided does not show LinkedIn exposing user “personal preferences” data through the self-serve OAuth scopes or the standard sign-in/userinfo flow. No official source in the evidence set lists categories such as notification preferences, content preferences, privacy settings, or other personal preferences as retrievable via OAuth/API.

The practical limitation is that LinkedIn’s self-serve identity access is intentionally narrow, and broader data access is segmented into products and partner programs. Many APIs require separate approval, and some data access is constrained by privacy settings or limited-access APIs [7], [10], [11]. There is also evidence that developers may never store profile data for members other than the authenticated user, which reinforces LinkedIn’s restrictive handling of personal/profile-related data [6].

## MVP setup process, likely speed, and whether publishing requires a waiting period

## Self-serve development setup

The evidence supports this flow for a private MVP integration:

1. Create a LinkedIn app in the Developer Portal.
2. Obtain client credentials.
3. Configure redirect URIs.
4. Enable/request the relevant products/scopes shown in the app’s Auth tab.
5. Run the authorization code flow and authenticate users [12].

The authorization docs say the scopes available to an app depend on the products or partner programs it has access to, and approved products add new scopes to the app [12]. For basic sign-in, the self-serve/open products are the relevant path: Sign In with LinkedIn (`openid`, `profile`, `email`) and Share on LinkedIn (`w_member_social`) are described as open permissions that do not require approval [2], [10].

### Waiting period and publishing

For a private MVP using self-serve sign-in, the evidence does not identify any mandatory waiting period, app review, verification, or “publishing” gate before the app can be used for development or private testing with those open permissions [2], [10]. In other words, the evidence supports immediate use once the app is created and configured, assuming only self-serve products are needed.

By contrast, partner-gated products do require an application and approval. This includes at least marketing-related access, sales-related integrations, and other specialized APIs [2], [10], [11], [16]. The evidence does not provide an official timeline or SLA for those approvals, only that approval is required and LinkedIn retains discretion [16].

## Evidence gaps

The provided evidence does not specify:

- an official end-to-end time estimate in minutes or hours for creating the app and enabling self-serve sign-in;
- an official distinction between private/internal testers and broader external testers beyond the absence of documented mandatory publishing gates in the cited materials;
- any official API or scope exposing user personal-preferences categories.

## References

[1] https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2  
[2] https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access  
[3] https://connectsafely.ai/articles/linkedin-api-complete-guide-2026  
[4] https://community.n8n.io/t/support-linkedin-openid-connect-scopes-profile-email-openid/112573?tl=en  
[5] https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication  
[6] https://swarmhit.com/blog/linkedin-profile-api  
[7] https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api  
[8] https://dev.to/martinratinaud/retrieve-vanity-url-and-headline-from-linkedin-with-nextauth-using-rbasicprofile-26o3  
[9] https://learn.microsoft.com/en-us/linkedin/shared/references/v2/profile/full-profile  
[10] https://elfsight.com/blog/linkedin-api-access-and-pricing  
[11] https://trykondo.com/blog/fix-linkedin-permissions-error  
[12] https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow  
[13] https://learn.microsoft.com/en-us/linkedin/shared/references/v2/profile/lite-profile  
[14] https://forum.bubble.io/t/linkedin-oauth-profile-data/54422  
[15] https://github.com/strapi/strapi/issues/19641  
[16] https://learn.microsoft.com/en-us/linkedin/marketing/increasing-access?view=li-lms-2026-09
