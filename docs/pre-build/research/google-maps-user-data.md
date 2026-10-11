# Can "Sign in with Google" give access to a user's Maps saved places, reviews, photos and timeline for an MVP?

## Short answer
- It is possible to obtain many Google Maps-related signals for personalized recommendations, but access comes from several distinct Google APIs (and not a single "Maps user data" OAuth scope) and several required scopes and verification steps apply. The Google OAuth Scopes listing explicitly includes a scope that “allows moving a copy” of many Maps items (starred/saved places, your posted photos and videos on Maps, reviews and posts, Q&A, labeled/pinned trips, commute/vehicle profile and Maps activity) - but the findings do not provide the exact scope string inlined in the evidence and do not show a single unified read-only Maps-profile scope usable for arbitrary in-app reading of private Maps data [1]. Place details (including ratings and reviews) and place photos are available through the Maps/Places APIs (Place Details / Place Photo) for place metadata [2], user photos may be reachable via the Google Photos APIs under Photos-specific scopes [3], and People API scopes expose address/contact fields (not Maps saved places) [4]. Business Profile / My Business APIs provide programmatic access to business reviews for Business Profile owners but require an approval flow [5]. There is no public Timeline/location-history API; users must export Timeline/location history using Google Takeout as an alternative [6][7].

(References for the above paragraph: [1], [2], [3], [4], [5], [6], [7].)

## Which APIs and (candidate) scopes map to each data type
- Saved / Starred places, places a user labeled or pinned, posted Maps photos, reviews and posts: Google’s OAuth Scopes page documents a Maps-related “move a copy” scope that explicitly covers starred places, reviews, photos/videos posted on Maps, questions/answers and Maps activity; the exact scope string is not provided in the available evidence [1]. Place metadata (Place Details including ratings and place reviews, and Place Photo retrieval) is served by the Places API (New) endpoints (Place Details, Place Photo) [2].
- Photos tied to place listings: Google Photos APIs offer read and write patterns with distinct OAuth scopes (read-only, append-only, app-created) and require OAuth consent/verification for access; the Photos API is the official route to access user photos when granted [3].
- Reviews for businesses the user contributed to vs. Business owners’ reviews: Business Profile / My Business APIs let approved developers manage and read Business Profile reviews for locations they manage, but require project-level prerequisites and an access/approval request [5].
- Location history / Timeline: there is no public Timeline API; users can obtain their raw location-history via Google Takeout and supply it to the app (Takeout produces JSON position files and semantic analysis folders) [6][7].
- Contacts / address fields: the People API exposes contact and address scopes (e.g., contacts and UserAddressesRead) but those are separate from Maps saved-place data [4].

(References for this section: [1], [2], [3], [5], [4], [6], [7].)

## Verification, scope sensitivity, approvals, and timelines
- Scope classification: Google classifies requested scopes as non-sensitive, sensitive, or restricted; apps requesting sensitive or restricted user data must complete OAuth verification before general public use and must request the narrowest scopes possible [8][9]. Sensitive scope review typically takes business days to a few weeks per Google docs (examples in the evidence show sensitive reviews commonly taking on the order of 3-10 business days), and restricted scopes require an additional security assessment and longer review (restricted-scope verification and security assessment timelines are substantially longer - measured in many weeks) [8][10][11].
- Security assessment (CASA) and costs: restricted scopes trigger a Cloud Application Security Assessment (CASA) requirement (annual), which the evidence indicates can require an external audit and carries material costs; one source cites CASA cost ranges roughly $500-$4,500 and annual reassessment [11].
- Business Profile / My Business: access to Business Profile APIs requires creating a Cloud project, meeting Business Profile prerequisites and submitting an API access request; review times are typically non-instant and subject to approval (example guidance mentions review windows such as ~14 days in a third-party guide) [5].
- Billing and Maps usage: Places API usage is metered with per-method quotas; Maps Platform billing must be configured and SKU usage is charged per Google’s pricing and quota rules [12].

(References for this section: [8], [9], [10], [11], [5], [12].)

## Short-term developer/testing options (can an MVP start in one day?)
- Internal app (within a Google Workspace/Cloud Identity organization): using the Cloud Console, set OAuth Consent → User Type = Internal and restrict the app to your Workspace domain; internal apps can avoid full public brand verification and are usable immediately within the domain per community guidance and Google documentation on app types [13]. Exact console steps: create a Google Cloud project, enable required APIs, configure OAuth consent screen as Internal, add test users (if needed), create OAuth credentials.
- External app in Testing mode: put the OAuth consent screen into Testing (External) to use an allowlist of test users; official docs state a Testing-mode external app is limited to 100 test users and users will see testing/unverified warnings [8]. Third-party reporting indicates access tokens issued to test users in Testing mode may expire after 7 days, requiring re-authorization for continued testing [14].
- Bottom line for MVP in one day: immediate development and limited testing are possible (internal app or external Testing with up to 100 test users), but production use with non-allowlisted users or any restricted scopes will require Google verification and possible CASA audit - which typically takes weeks and can incur audit costs [13][8][11][14].

(References for this section: [13], [8], [14], [11].)

## Data that is not available via official APIs and alternatives
- Location history / Timeline: no public Timeline API exists; the supported alternative is asking users to export and share their Google Takeout location-history JSON or to permit the app to accept uploads from Takeout [6][7]. Tradeoffs: Takeout sharing is manual and increases UX friction and data-handling responsibilities.
- Some Maps personal items: while the OAuth scope page documents a scope that “moves a copy” of many Maps items, the evidence does not show a simple, documented read-only scope and exact scope string for free-form programmatic reading of all private Maps content; where APIs don’t provide direct access, alternatives include requesting Google Photos access (for user photos) or asking users to share exported lists or to permit device-collected location data (explicit consent) [1][3][6].
- Third-party scraping services that surface contributor reviews exist (e.g., a contributor-reviews API from a scraping provider), but these are not official Google APIs and carry compliance and data-quality tradeoffs [15].

(References for this section: [6], [7], [1], [3], [15].)

## Legal, privacy and policy constraints (high level)
- All access to Google user data must comply with the Google API Services User Data Policy, Maps Platform Terms of Service, and Google APIs Terms; apps must accurately represent use, request minimal scopes, provide a public privacy policy that explains access/use/storage of Google user data, and honor deletion/retention requests [12][16][17]. Maps Platform Terms require appropriate attribution and user agreements that acknowledge Google’s additional terms [17]. Restricted-scope apps must provide demonstrable secure handling and deletion practices as part of verification and security assessment [9][11].

(References for this section: [16], [17], [9], [11].)

## Practical checklist to get an MVP testable
- Create Google Cloud project and enable APIs you plan to use (Places API (New), Google Photos Library, People API, Business Profile API if needed). Configure Maps Platform billing and set API restrictions for SDKs/keys [12].
- Configure OAuth Consent Screen (set Internal for Workspace or External→Testing for up to 100 test users) and create OAuth credentials [13][8].
- Request only minimal scopes; prepare privacy policy and branding assets for verification [9][16].
- If requesting restricted scopes or production external access to sensitive user data, plan for OAuth verification and CASA/security assessment (timeline: weeks; cost: hundreds to low thousands per year in reported examples) [9][11].
- If Timeline/location-history is required, request users to export and upload Google Takeout data or to grant Google Photos access where appropriate [6][3].

(References for this section: [12], [13], [9], [11], [6], [3].)

## Evidence gaps
- The exact OAuth scope strings (literal scope names) for the Maps “move a copy” capability and for the My Business/Business Profile OAuth scope strings are not provided in the available findings; the documents assert existence and coverage but the string values are not shown [1][5].
- Precise, official turnaround windows and guaranteed timing for every step of verification (sensitive vs. restricted vs. Business Profile) show some variation across sources; the evidence contains multiple timeline estimates and third-party reports rather than a single precise schedule [8][9][11].

## Recommendation (concise)
For a one-day MVP proof-of-concept: implement Google Sign-in (openid/email/profile), test as an Internal app inside a Workspace domain or as External→Testing with up to 100 allowlisted testers, and integrate Places API / Google Photos scopes only for test users while keeping requested scopes minimal; do not expect location-history/timeline to be available programmatically - request Takeout uploads or explicit device location sharing instead. Plan verification and CASA if expanding beyond test users or requesting restricted scopes.

## Works Cited
[1] https://developers.google.com/identity/protocols/oauth2/scopes
[2] https://developers.google.com/maps/documentation/places/web-service
[3] https://developers.google.com/photos/overview/authorization
[4] https://googleapis.dev/dotnet/Google.Apis.PeopleService.v1/latest/api/Google.Apis.PeopleService.v1.PeopleServiceService.Scope.html
[5] https://localith.ai/blog/google-business-profile-api-guide
[6] https://support.google.com/maps/thread/340941030/i-m-curious-if-google-timeline-api-is-available?hl=en
[7] https://github.com/electricitymaps/bloom-contrib/issues/350
[8] https://developers.google.com/identity/protocols/oauth2/production-readiness/overview
[9] https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification
[10] https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
[11] https://deepstrike.io/blog/google-casa-security-assessment-2025
[12] https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
[13] https://support.google.com/cloud/answer/13463073?hl=en
[14] https://unipile.com/google-oauth-consent-screen
[15] https://serpapi.com/google-maps-contributor-reviews-api
[16] https://developers.google.com/terms/api-services-user-data-policy
[17] https://developers.google.com/maps/terms-20180207
