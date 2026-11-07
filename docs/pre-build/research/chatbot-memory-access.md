# Getting user “memory” and recent context from major AI chat providers - actionable synthesis

## Executive summary

Major AI chatbot vendors vary widely in whether and how an external product can programmatically obtain a user’s persistent memory and recent conversation/context. Anthropic (Claude) documents a first-class memory layer and organization export flows; Microsoft provides Copilot and Azure/OpenAI conversation endpoints and published OAuth scopes for Copilot; OpenAI’s public platform supports OAuth/OIDC for Sign-in with ChatGPT and Responses endpoints but does not publish a general read-only “memory” API today. Google/Vertex/Gemini and some other vendors lack supporting evidence in the collected findings. The following sections give per-provider feasibility, concrete integration patterns (OAuth scopes, endpoints, export alternatives), recommended safe architecture for mapping memories to a travel profile, and legal/security constraints supported by provider docs.

## Per-provider feasibility and concrete integration patterns

Anthropic / Claude

- Feasibility: Persistent “Claude Memory” exists and is exposed to developers via a memory tool and memory store primitives for Claude 4+ models; organization export is available for Team/Enterprise Primary Owners [9], [10]. Blog/announcements describe memory for preferences, projects, and team context [13].
- Technical methods: Integrate using the Claude memory tool declared in the tools array (tool type memory_20250818; beta header context-management-2025-06-27 required) and the /memories paths the tool expects [9]. Memory store limits and pagination constraints are published (per-memory 100 kB, up to 10,000 memories per store, path length limits, pagination limits) and must be respected when reading/writing [11].
- Account/linking/export: Team/Enterprise Primary Owners can request organization data exports (conversations and user data) via the admin export flow; individual users cannot self-serve org exports [10], [14].
- Practical notes: OAuth tokens exist but are restricted in usage scope for consumer tokens (tokens limited to Claude Code/Claude.ai) and missing required scopes (e.g., user:profile) can cause errors, so validate token scopes during integration [12].

OpenAI / ChatGPT

- Feasibility: ChatGPT supports Sign-in with ChatGPT (SIWC) using OIDC scopes openid, profile, email; ChatGPT requests advertised OIDC scopes by default during plugin OAuth flows [1], [2]. OpenAI provides Responses APIs that support stateful interactions and endpoints to retrieve conversation items, but there is community evidence that there is no general backend persistent memory API for third parties and proposals for a read-only conversation export API remain community requests, not a published product [4], [5].
- Technical methods: For identity and basic profile claims, use SIWC / OIDC (scopes openid/profile/email). For conversation context where available, use the Responses API and conversation input_items endpoint patterns (e.g., GET /v1/responses/{response_id}/input_items) to obtain prior inputs; note reported limitations retrieving some historic outputs and that Responses returns historical input items rather than always including the most recent model output [4], [6].
- Account/export: Users can request export of their ChatGPT data via the UI Data Controls → Export data flow; availability of the export button may vary by account [6]. OpenAI’s Data Processing Addendum documents GDPR/CCPA coverage and other contractual terms [3].
- Practical notes: OpenAI enforces rate limits (RPM/TPM etc.) and uses RBAC for resource permissions that can affect webhook/webhook-style ingestion and app permissions [7], [8].

Microsoft Copilot and Azure OpenAI / Foundry

- Feasibility: Microsoft publishes Copilot OAuth scopes and a Copilot Chat API that requires delegated Microsoft Graph permissions; Azure Foundry/OpenAI provides Conversations endpoints that return conversation items and responses input_items [15], [16], [17], [18].
- Technical methods: For Copilot, request the published delegated scopes (example scope names include AIInteraction.Read.All, Chat.Read, Files.Read.All, Sites.Read.All - Copilot requires specific delegated Graph permissions and a Copilot license per user) and call the Copilot chat endpoints (POST /copilot/conversation returning a conversation id; chatOverStream or chat endpoints described in Microsoft docs) to receive conversation messages and streaming events [17], [18]. For Azure Foundry/OpenAI, use GET /openai/v1/conversations/{conversation_id}/items or the Responses input_items endpoint to retrieve conversation context [15], [16].
- Account/export: Copilot transcript data can be exported from Dataverse tables via documented APIs for tenant admins when applicable [19].
- Practical notes: Copilot chat APIs require multiple delegated permissions and do not support application permissions for the Copilot Chat API; conversation IDs should not be assumed cacheable long-term [18].

Providers with no supported evidence (Google / Vertex / Gemini)

- Evidence gap: No provider documentation or primary evidence for programmatic read access to user memory or conversation exports was present in the collected findings. See “Evidence gaps” below.

## Typical fields useful for travel personalization and which providers expose them (synthesis)

Useful fields: name, email, time zone/locale, profile picture, stated preferences (seat class, hotel type), saved items / bookmarks (saved itineraries, destinations), travel history (past trips, dates), conversation history (recent messages), system/assistant personalization tokens (roles/prompts), uploaded files (documents, tickets), and organization context (team travel policies).

What the evidence shows:

- Identity claims (name, picture, email) - accessible via ChatGPT SIWC OIDC scopes (openid/profile/email) [2].
- Stated preferences, projects, and role-based personalization - Claude Memory explicitly targets preferences, team/project context, and can persist editable memories [13], [9].
- Conversation history / recent context - Azure Foundry and Azure OpenAI Responses endpoints and Copilot conversation endpoints can return conversation items/input_items [15], [16], [18]; OpenAI Responses returns historical input items but has reported gaps for recent model outputs and lacks a general read-only memory API for third parties in public docs [4], [5], [6].
- Saved files and files-backed memory - Copilot’s file memory persists in OneDrive/Dataverse and Files.Read.All scope would enable access if permitted by tenant licensing [15], [17].

Fields not clearly exposed or provider-restricted:

- Vendor training-use flags, internal personalization tokens, and full persistent per-user memory for ChatGPT are not documented as generally available to third-party apps in the gathered evidence; OpenAI community discussions indicate GPT is not designed to retain persistent memory across sessions for third-party access [5].

## Recommended integration & safe ingestion architecture (high level)

- Use delegated OAuth/OIDC (authorization code) where supported: request OIDC profile/email scopes for identity, then request provider-specific scopes (e.g., Copilot Graph scopes) for conversation/files access; validate tokens and enforce least privilege. Example scopes: openid profile email for ChatGPT SIWC [2]; AIInteraction.Read.All, Chat.Read, Files.Read.All for Copilot [17].
- Data flow: (1) Obtain user consent via provider OAuth; (2) call provider conversation/memory endpoints (Responses input_items, Copilot conversation endpoints, Anthropic memory tool/store) to fetch allowed artifacts; (3) map into a canonical travel profile: identity, preferences, saved items, travel history, recent conversation snippets (with timestamps and provenance fields); (4) store encrypted at rest, support user revocation flows by deleting provider-linked data on token revocation or export requests.
- Rate-limit and RBAC handling: backoff and token refresh; respect provider rate limits and RBAC permissions when polling large memory stores [7], [8], [11].
- Fallbacks when provider memory is unavailable: (a) prompt user to upload or export data (OpenAI/Claude export ZIPs); (b) client-side capture (browser extension) or session-level copy/paste; (c) let users manually enter preferences in the app. Evidence shows OpenAI and Anthropic support exports (OpenAI UI export, Anthropic org export for owners) which can be used as user-provided data imports [6], [10], [14].

## Legal, security, and operational constraints (synthesis)

- Consent & revocation: OAuth consent required where OAuth is supported; organization export flows are restricted (Anthropic org exports only for Primary Owners) [10], [14]. Implement user revocation and deletion triggered by provider token revocation or by user request.
- Data protection & contractual terms: OpenAI’s DPA covers GDPR and CCPA obligations and defines “Personal Data” and data breach reporting terms [3]. Anthropic’s published memory options include opt-out settings and deletion semantics for memories [13], [14].
- Rate limits, RBAC, and tenant licensing: OpenAI enforces organization/project rate limits and RBAC for resources [7], [8]; Copilot requires specific delegated Graph permissions and user Copilot licensing [17], [18].
- Provider-specific reuse restrictions: Anthropic restricts OAuth token usage to certain product channels; OpenAI’s Terms/Service Terms govern third-party app behavior and may permit review/removal of apps [12], [1].

## Evidence gaps

- No primary evidence in the collected findings documenting Google (Vertex/Gemini) programmatic memory exports or OAuth scopes for conversational memory.
- No vendor-published universal read-only “third-party memory” API for ChatGPT (only community feature requests and limited Responses endpoints were documented) [5], [4].
- Field-level lists (exact JSON schemas of saved memories across providers) are not fully documented in the gathered sources; implementers must inspect each provider’s API responses or contact enterprise account teams for schema detail.

## Recommended next steps

- For production travel personalization, prioritize integrations with Anthropic (if Team/Enterprise access is available) and Microsoft Copilot/Azure Foundry where conversation and memory endpoints plus explicit scopes are documented [9], [15], [16], [17], [18]; use OpenAI SIWC to obtain identity and the Responses API where acceptable but verify conversation completeness and export availability per account [2], [4], [6].
- Build consented import pipelines (OAuth + explicit user approval + secure storage + deletion on revoke) and a fallback user upload/import flow relying on provider export ZIPs or manual entry [6], [10], [14].

## Works Cited

[1] https://developers.openai.com/plugins/build/auth
[2] https://developers.openai.com/siwc/website
[3] https://openai.com/policies/data-processing-addendum
[4] https://developers.openai.com/api/reference/responses/overview
[5] https://community.openai.com/t/backend-memory-api-availability/1327871
[6] https://reddit.com/r/YouShouldKnow/comments/1rh2zzc/ysk_you_can_export_the_memory_and_data_openai_has
[7] https://developers.openai.com/api/docs/guides/rate-limits
[8] https://developers.openai.com/api/docs/guides/rbac
[9] https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
[10] https://privacy.claude.com/en/articles/13346720-export-your-organization-s-data
[11] https://mnemoverse.com/docs/library/anthropic-memory-api-no-ranked-retrieval
[12] https://docs.moltis.org/anthropic-oauth.html
[13] https://skywork.ai/blog/ai-agent/claude-memory-a-deep-dive-into-anthropics-persistent-context-solution
[14] https://sawinyh.com/blog/claude-export-no-import
[15] https://learn.microsoft.com/en-us/rest/api/microsoft-foundry/azureopenai/conversations
[16] https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/responses
[17] https://apis.io/scopes/microsoft-copilot/microsoft-copilot-scopes
[18] https://learn.microsoft.com/en-us/microsoft-365/copilot/extensibility/api/ai-services/chat/copilotconversation-chat
[19] https://learn.microsoft.com/en-us/dynamics365/customer-service/develop/download-copilot-transcript-data
