export const CHAT_REPLY_SCHEMA = `{
  "reply": "Your helpful conversational response as plain text"
}`;

export const GENERATE_FROM_CHAT_SCHEMA = `{
  "action_steps": [
    { "text": "Task Title", "description": "Short explanation of the step" }
  ],
  "suggested_links": [
    { "label": "Link label", "targetSectionKey": "target_section_key_or_null", "externalUrl": "external_url_or_null" }
  ]
}`;
