import { validateArchive, type ChatArchiveMessage } from "../archive";
import { adapterError, emptyArchive, parseTimestamp } from "./shared";
import { CHAT_ADAPTER_LIMITS } from "./types";

const EXPECTED_HEADER = [
  "Post Creation Time",
  "User Id",
  "User Email",
  "User Type",
  "User Name",
  "Post Id",
  "Parent Post Id",
  "Post Message",
  "Post Type"
];

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) return adapterError("unrecognized_format", "Mattermost CSV has an unterminated quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((cell) => cell !== "")) rows.push(row);
  }
  return rows;
}

function mattermostTimestamp(value: string): string {
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d+))? ([+-]\d{4}) UTC$/);
  if (match) {
    const offset = `${match[4].slice(0, 3)}:${match[4].slice(3)}`;
    return parseTimestamp(`${match[1]}T${match[2]}${match[3] ? `.${match[3]}` : ""}${offset}`, "Mattermost CSV");
  }
  return parseTimestamp(value, "Mattermost CSV");
}

export async function parseMattermostCSV(csv: string) {
  if (new TextEncoder().encode(csv).byteLength > CHAT_ADAPTER_LIMITS.maxInputBytes) {
    return adapterError("archive_too_large", "Mattermost CSV exceeds the input size limit");
  }
  const rows = parseCSV(csv.replace(/^\uFEFF/, ""));
  const header = rows[0];
  if (!header || header.length !== EXPECTED_HEADER.length || EXPECTED_HEADER.some((column, index) => header[index] !== column)) {
    return adapterError("unrecognized_format", "File does not have the Mattermost Channel Export CSV header");
  }
  const records = rows.slice(1);
  if (records.length > CHAT_ADAPTER_LIMITS.maxMessages) {
    return adapterError("message_limit_exceeded", "Mattermost CSV exceeds the message count limit");
  }
  if (records.some((record) => record.length !== EXPECTED_HEADER.length)) {
    return adapterError("unrecognized_format", "Mattermost CSV contains a row with an invalid number of columns");
  }

  const archive = emptyArchive("mattermost", "mattermost-channel-csv", "Mattermost channel");
  const participantNames = new Map<string, string>();
  const messages: ChatArchiveMessage[] = [];
  const sourceIds = new Set(records.map((record) => record[5]));
  const pendingParents: Array<{ message: ChatArchiveMessage; parentId: string }> = [];
  for (const [index, record] of records.entries()) {
    const [createdAt, rawUserID, _email, _userType, rawUsername, rawPostID, parentID, body, postType] = record;
    const sourceId = rawUserID.trim() || rawUsername.trim() || "mattermost-system";
    const displayName = rawUsername.trim() || sourceId;
    participantNames.set(sourceId, displayName);
    const message: ChatArchiveMessage = {
      sourceId: rawPostID.trim() || `mattermost-post-${index + 1}`,
      authorId: sourceId,
      timestamp: mattermostTimestamp(createdAt),
      kind: postType === "message" || postType === "" ? "text" : "system",
      text: body,
      attachmentIds: [],
      metadata: {}
    };
    if (parentID.trim()) pendingParents.push({ message, parentId: parentID.trim() });
    messages.push(message);
  }
  let missingParentCount = 0;
  for (const pending of pendingParents) {
    if (sourceIds.has(pending.parentId)) pending.message.replyToSourceId = pending.parentId;
    else missingParentCount += 1;
  }
  archive.participants = [...participantNames].map(([sourceId, displayName]) => ({ sourceId, displayName }));
  archive.messages = messages;
  if (missingParentCount > 0) {
    archive.warnings.push({ code: "reply_target_missing", message: `${missingParentCount} reply reference(s) were not present in the CSV and were flattened` });
  }
  return validateArchive(archive);
}
