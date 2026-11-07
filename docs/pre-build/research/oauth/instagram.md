# Instagram OAuth scopes, data access, and MVP setup - evidence-backed summary

## Executive summary

Meta’s Instagram OAuth surface now centers on Instagram Graph API scopes for professional (Business/Creator) accounts; the OAuth authorize flow requires either instagram_basic or instagram_business_basic and the response_type=code parameter. Scopes map to profile/media read access, insights, comments management, messaging, and publishing (with scope-specific endpoint requirements). The legacy Instagram Basic Display API (user_profile/user_media) is documented by some guides but is reported as fully deprecated by other sources - creating a direct conflict in the available evidence. Critical operational details frequently required for an MVP (token lifetimes/refresh flows, App Review timing and exact production checklist) are not specified in the provided sources and are listed under Evidence gaps. [Sources cited inline below.]

## 1) Official OAuth scopes (exact strings) and purpose

Meta’s recent Instagram Login documentation lists the new Instagram Login scope names, for example: instagram_business_basic, instagram_business_content_publish, instagram_business_manage_messages, instagram_business_manage_comments (these replace older business_* scopes). The OAuth authorize parameter must include either instagram_basic or instagram_business_basic and the OAuth response_type must be code; state is optional for CSRF protection. [1], [5]

Summary of scope names referenced in the official docs and developer guides (exact strings found in the evidence):

- instagram_basic
- instagram_business_basic
- instagram_business_content_publish
- instagram_business_manage_messages
- instagram_business_manage_comments
- instagram_content_publish
- instagram_manage_comments
- instagram_manage_insights
- instagram_manage_messages
- pages_read_engagement / pages_show_list (Facebook page-related)
- ads_management / ads_read
- (Legacy) user_profile, user_media - associated with Instagram Basic Display in secondary docs (see conflict below). [5], [9], [10], [6]

## 2) Scope → data / endpoint mapping (what each scope actually allows)

The following consolidated mappings are supported by the evidence:

- instagram_basic
  - Read basic Instagram account profile and media fields including id, username, name, biography, profile_picture_url, website, followers_count, follows_count, media_count; media-level fields such as id, caption, media_type, media_url, permalink, timestamp, like_count, comments_count. These fields are returned by the Graph API account and media endpoints (e.g., GET /{ig-user-id}?fields=... and GET /{ig-media-id}?fields=...). [10]

- instagram_manage_insights
  - Access to account and media insights: reach, impressions, profile views, follower count, media-level metrics, and some audience demographics. These are available from Insights endpoints in the Instagram Graph API. [9]

- instagram_manage_comments / instagram_business_manage_comments
  - Read and act on comments: list, reply, hide, delete, and access mention data. Comment objects return fields including from (id, username), hidden, id, like_count, legacy_instagram_comment_id, and related media metadata. [13]

- instagram_content_publish / instagram_business_content_publish
  - Create media containers and publish organic media (images, video, Reels, carousels) via POST /{ig-id}/media and related container → publish endpoints; also used with GET /{ig-id}/content_publishing_limit. Publishing is limited to content created by the app user who granted the permission (cannot publish to arbitrary other accounts). Captions, hashtags, alt text, user tags, and locations are parameters on POST /media. [12], [14]

- instagram_manage_messages / instagram_business_manage_messages
  - Read and send direct messages and retrieve conversations via the Messaging/Conversations APIs for the authorized professional account using endpoints such as /messages and conversation endpoints. [11], [15]

- pages_show_list / pages_read_engagement / ads_management / ads_read
  - Facebook Page and Ads related permissions enable reading linked Pages and certain engagement data; these appear alongside Instagram permissions where Facebook Page linkage or page data is involved. [10], [9]

Notes on personal-preferences-related data (liked/saved posts, followed accounts, ad interests, bio/categories):

- The documented Instagram Graph fields include profile biography and category-like profile fields and media like_count/comment counts; however, the API does not document returning a user’s saved posts, a list of accounts the user follows, or ad interest data in the provided evidence. One source explicitly states the Graph API does not provide access to personal account data or competitor/public account data after Basic Display deprecation; the evidence therefore does not support retrieving raw liked/saved posts or third-party follower lists via the official APIs. [10], [4]

## 3) Account and app constraints

- Instagram Graph API support is focused on Professional accounts (Business and Creator); after the Basic Display deprecation claim, there is reported to be no official API access to personal Instagram accounts. The instagram_business_basic scope is identified as required for many Business Login endpoints. The evidence therefore implies that owners typically must use (or convert to) a Professional account for full Graph API functionality, but the exact requirement to link a Facebook Page is not explicitly specified in the provided sources (evidence gap on mandatory Page-linking). [4], [9], [5]

## 4) Tokens, lifetimes, refresh, and rate limits (what the evidence shows)

- OAuth authorize must use response_type=code (authorization code flow), but the evidence does not specify token types (short vs long), standard lifetimes, or refresh token flow details - this is an evidence gap. [1]
- Rate limits and content-publishing quotas are described in multiple sources but with some contradictions:
  - A commonly cited platform limit is ~200 API calls per hour per app per user (standard per-user rate limit). [3], [4]
  - Content publishing limits are reported differently: one source states 25 posts per 24-hour period per Instagram account; another source reports tiered publishing limits based on follower counts (25-250 per 24h). These two statements conflict in the evidence. [3], [4]
  - Action-specific limits (likes/follows) are reported in a historical Q&A: e.g., ~100 likes/hour and ~60 follow/unfollow actions/hour per token - this is secondary-source Q&A evidence and should be treated cautiously. [16]

## 5) Practical developer setup for an MVP and timeline constraints (evidence-backed steps and gaps)

Required technical steps documented in the OAuth authorize and Instagram Login docs (supporting a testing OAuth flow):

- Create a Meta developer app and configure an OAuth authorize URL using the scope parameter that includes either instagram_basic or instagram_business_basic; set response_type=code and configure redirect URIs per the OAuth authorize documentation. [1]
- Request the specific Instagram scopes your app needs during the OAuth flow (e.g., instagram_basic, instagram_manage_insights, instagram_content_publish, instagram_manage_comments, instagram_manage_messages) - each scope unlocks the endpoint types listed above. [5], [9], [12], [11], [13]

What the evidence does not specify (important MVP timelines and gating items):

- The provided sources do not list time estimates for setting up or waiting for App Review, nor the exact App Review deliverables (privacy policy, data deletion callbacks, business verification, screencasts, demo accounts) in the evidence set. The documentation excerpts used do not state whether development/test-mode usage without App Review is sufficient for onboarding initial users, nor the timeline for App Review or Advanced Access. These are significant evidence gaps and must be checked directly in Meta’s App Review and Business Verification docs before budgeting timeline or launch plans. [Evidence gaps below]

Practical consequence from the evidence:

- Because some documentation still references Instagram Basic Display scopes (user_profile, user_media) while a separate source reports that Basic Display was fully deprecated, the feasible short-term approach for an MVP is unclear from the provided materials; the Basic Display fallback may not be available. This conflict must be resolved by consulting Meta’s live developer documentation. [6], [4]

## 6) Production requirements, App Review, Advanced Access (evidence gaps)

The provided evidence does not supply a complete, authoritative checklist of mandatory items required to move an app to public Live mode, nor does it define the triggering conditions and timelines for Standard vs Advanced Access. These items are absent from the supplied sources and should be validated against Meta’s App Review and Business Verification pages. (See Evidence gaps below.)

## Evidence gaps (items not specified in the provided findings)

- OAuth token types returned by flows (short-lived vs long-lived), exact lifetimes, refresh token mechanics.
- Definitive, up-to-date statement in Meta docs on whether Instagram Basic Display is still available or has been deprecated (conflicting evidence present).
- Exact App Review deliverables, timelines, Advanced Access triggers, and which scopes require App Review or Business Verification before public use.
- Whether linking a Facebook Page is strictly required for particular Instagram Graph API paths (the evidence mentions page-related scopes but does not state a mandatory Page-linking rule).
- Clear, consistent content-publishing rate limits (conflicting reports in sources).

## Conclusion / recommendation

For an MVP: implement the OAuth authorize flow using response_type=code and request only the instagram_basic or instagram_business_basic scopes required for your feature set; map scope usage to endpoints as above (profile/media → instagram_basic; insights → instagram_manage_insights; comments → instagram_manage_comments; publishing → instagram_content_publish/business variant; messaging → instagram_manage_messages/business variant). Confirm whether target accounts are Professional (Business/Creator). Before scheduling public launch or estimating App Review timelines, consult Meta’s live App Review, Business Verification, and token/OAuth docs to resolve the evidence gaps noted above and the Basic Display deprecation conflict. [1], [5], [10], [9], [13], [12], [11], [14], [4], [3], [16], [6]

## Works Cited

[1] https://developers.facebook.com/documentation/instagram-platform/reference/oauth-authorize
[2] https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login
[3] https://zernio.com/blog/instagram-graph-api
[4] https://shadowphone.io/blog/instagram-api-changes-2026
[5] https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login
[6] https://nango.dev/docs/api-integrations/instagram/how-to-register-your-own-instagram-api-oauth-app
[7] https://stackoverflow.com/questions/68339271/instagram-api-getting-access-tokens-with-permissions-and-scope-not-working-as-ex
[8] https://stackoverflow.com/questions/71801228/how-to-inspect-debug-an-instagram-basic-display-api-token
[9] https://developers.facebook.com/documentation/instagram-platform/insights
[10] https://getphyllo.com/post/instagram-api-permissions-scopes
[11] https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api
[12] https://developers.facebook.com/documentation/instagram-platform/content-publishing
[13] https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-comment
[14] https://adaptlypost.com/blog/instagram-business-content-publish-scope
[15] https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/conversations-api
[16] https://stackoverflow.com/questions/19905970/instagram-api-posting-likes-rate-limit
