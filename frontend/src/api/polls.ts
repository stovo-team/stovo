import { apiRequest } from "./client";
import type { FamilyFile } from "./files";

export interface PollOption {
  id: string;
  text: string;
  optionIndex: number;
  voteCount: number;
  voted: boolean;
  voterIds?: string[];
}

export interface Poll {
  id: string;
  chatId: string;
  messageId: string;
  question: string;
  isAnonymous: boolean;
  allowMultiple: boolean;
  isQuiz: boolean;
  correctOptionId?: string | null;
  explanation?: string | null;
  isClosed: boolean;
  totalVoters: number;
  createdAt: string;
  closedAt?: string | null;
  options: PollOption[];
}

export interface CreatePollPayload {
  question: string;
  options: { text: string }[];
  isAnonymous: boolean;
  allowMultiple: boolean;
  isQuiz: boolean;
  correctOptionIndex?: number;
  explanation?: string;
  replyToMessageId?: string;
}

export interface PollVoterSummary {
  id: string;
  displayName: string;
  username: string;
  profilePhoto?: FamilyFile | null;
  avatarMode?: "photo" | "symbol";
  avatarSymbolId?: string | null;
  avatarColorId?: string | null;
}

export function createPoll(accessToken: string, chatId: string, payload: CreatePollPayload) {
  return apiRequest<any>(`/api/chats/${chatId}/polls`, {
    method: "POST",
    accessToken,
    body: payload
  });
}

export function votePoll(accessToken: string, pollId: string, optionIds: string[]) {
  return apiRequest<Poll>(`/api/polls/${pollId}/vote`, {
    method: "POST",
    accessToken,
    body: { optionIds }
  });
}

export function closePoll(accessToken: string, pollId: string) {
  return apiRequest<Poll>(`/api/polls/${pollId}/close`, {
    method: "POST",
    accessToken
  });
}

export function getPollVoters(accessToken: string, pollId: string) {
  return apiRequest<Record<string, PollVoterSummary[]>>(`/api/polls/${pollId}/voters`, {
    accessToken
  });
}
