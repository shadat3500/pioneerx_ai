export interface AiSuggestedTool {
  name: string;
  description: string;
  url: string;
}

export const ADVISORY_RESPONSE_SCHEMA = `{
  "action_steps": [
    { "text": "Task Title", "description": "Short explanation of the step" }
  ],
  "tools_features": [],
  "ai_suggested_tools": [
    { "name": "Tool name", "description": "What it helps with", "url": "https://example.com" }
  ],
  "suggested_links": [
    { "label": "Link label", "targetSectionKey": "target_section_key_or_null", "externalUrl": "external_url_or_null" }
  ],
  "ai_tip": "A valuable AI advisory tip/insight"
}`;
