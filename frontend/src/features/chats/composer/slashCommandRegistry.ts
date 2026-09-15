import type { ReactNode } from "react";
import { createElement } from "react";
import {
  AlertTriangle,
  BarChart2,
  BellOff,
  BellRing,
  CalendarClock,
  CheckSquare,
  DollarSign,
  EyeOff,
  MapPin,
  Phone,
  Pin,
  Smile,
  StickyNote,
  Timer,
  Video,
  VolumeX
} from "lucide-react";

export interface SlashCommandDefinition {
  command: string;
  syntax: string;
  description: string;
  icon: ReactNode;
}

export const ALL_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    command: "poll",
    syntax: "/poll",
    description: "Create a poll",
    icon: createElement(BarChart2, { size: 16 })
  },
  {
    command: "schedule",
    syntax: "/schedule Title | Time | Duration",
    description: "Schedule a plan or event",
    icon: createElement(CalendarClock, { size: 16 })
  },
  {
    command: "canvas",
    syntax: "/canvas",
    description: "Create a shared canvas",
    icon: createElement(StickyNote, { size: 16 })
  },
  {
    command: "checklist",
    syntax: "/checklist",
    description: "Create a shared checklist",
    icon: createElement(CheckSquare, { size: 16 })
  },
  {
    command: "remind",
    syntax: "/remind [in 2h | 18:00] <task>",
    description: "Set a reminder (e.g. /remind in 2h Check oven)",
    icon: createElement(BellRing, { size: 16 })
  },
  {
    command: "todo",
    syntax: "/todo <task>",
    description: "Add a task to shared checklist",
    icon: createElement(CheckSquare, { size: 16 })
  },
  {
    command: "split",
    syntax: "/split <amount> <description>",
    description: "Split household expense (e.g. /split $60 Groceries)",
    icon: createElement(DollarSign, { size: 16 })
  },
  {
    command: "location",
    syntax: "/location",
    description: "Share current GPS location pin",
    icon: createElement(MapPin, { size: 16 })
  },
  {
    command: "call",
    syntax: "/call [audio | video]",
    description: "Start an audio or video call",
    icon: createElement(Phone, { size: 16 })
  },
  {
    command: "meet",
    syntax: "/meet [Topic]",
    description: "Create and share a guest meeting room",
    icon: createElement(Video, { size: 16 })
  },
  {
    command: "silent",
    syntax: "/silent <message>",
    description: "Send message without notification sounds",
    icon: createElement(BellOff, { size: 16 })
  },
  {
    command: "urgent",
    syntax: "/urgent <message>",
    description: "Highlight message with urgent priority",
    icon: createElement(AlertTriangle, { size: 16 })
  },
  {
    command: "spoiler",
    syntax: "/spoiler <text>",
    description: "Conceal text until clicked (||text||)",
    icon: createElement(EyeOff, { size: 16 })
  },
  {
    command: "disappear",
    syntax: "/disappear [1h | 24h | off]",
    description: "Set disappearing message notice",
    icon: createElement(Timer, { size: 16 })
  },
  {
    command: "pin",
    syntax: "/pin",
    description: "Pin replied message or current chat",
    icon: createElement(Pin, { size: 16 })
  },
  {
    command: "mute",
    syntax: "/mute",
    description: "Toggle mute alerts for this chat",
    icon: createElement(VolumeX, { size: 16 })
  },
  {
    command: "shrug",
    syntax: "/shrug [text]",
    description: "Append ¯\\_(ツ)_/¯ to message",
    icon: createElement(Smile, { size: 16 })
  },
  {
    command: "tableflip",
    syntax: "/tableflip [text]",
    description: "Append (╯°□°)╯︵ ┻━┻ to message",
    icon: createElement(Smile, { size: 16 })
  }
];

export interface ParsedRemindCommand {
  timeExpr: string;
  text: string;
  scheduledDate: Date;
}

/**
 * Parses relative time expressions:
 * - "in 15m" / "in 2h" / "in 1d" / "15m" / "2h"
 * - "tomorrow" / "tomorrow 15:00"
 * - "18:00" / "6pm"
 */
export function parseRemindCommand(input: string, baseDate = new Date()): ParsedRemindCommand | null {
  const match = input.trim().match(/^\/remind(?:\s+([\s\S]+))?$/i);
  if (!match || !match[1]) return null;

  const rawArgs = match[1].trim();

  // Pattern 1: /remind in <num><m|h|d> <text>
  const relativeMatch = rawArgs.match(/^in\s+(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)\b(?:\s+([\s\S]+))?$/i)
    || rawArgs.match(/^(\d+)\s*(m|min|mins|minutes|h|hr|hrs|hours|d|day|days)\b(?:\s+([\s\S]+))?$/i);

  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1], 10);
    const unit = relativeMatch[2].toLowerCase();
    const text = (relativeMatch[3] || "").trim();

    const scheduledDate = new Date(baseDate.getTime());
    if (unit.startsWith("m")) {
      scheduledDate.setMinutes(scheduledDate.getMinutes() + amount);
    } else if (unit.startsWith("h")) {
      scheduledDate.setHours(scheduledDate.getHours() + amount);
    } else if (unit.startsWith("d")) {
      scheduledDate.setDate(scheduledDate.getDate() + amount);
    }

    return {
      timeExpr: `in ${amount}${unit[0]}`,
      text: text || "Reminder",
      scheduledDate
    };
  }

  // Pattern 2: /remind HH:mm <text>
  const timeOnlyMatch = rawArgs.match(/^(\d{1,2}):(\d{2})(?:\s+([\s\S]+))?$/i);
  if (timeOnlyMatch) {
    const hours = parseInt(timeOnlyMatch[1], 10);
    const minutes = parseInt(timeOnlyMatch[2], 10);
    const text = (timeOnlyMatch[3] || "").trim();

    const scheduledDate = new Date(baseDate.getTime());
    scheduledDate.setHours(hours, minutes, 0, 0);
    if (scheduledDate.getTime() <= baseDate.getTime()) {
      scheduledDate.setDate(scheduledDate.getDate() + 1); // scheduled for tomorrow at this time
    }

    return {
      timeExpr: `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`,
      text: text || "Reminder",
      scheduledDate
    };
  }

  // Pattern 3: /remind tomorrow [HH:mm] <text>
  const tomorrowMatch = rawArgs.match(/^tomorrow(?:\s+(\d{1,2}):(\d{2}))?(?:\s+([\s\S]+))?$/i);
  if (tomorrowMatch) {
    const hours = tomorrowMatch[1] ? parseInt(tomorrowMatch[1], 10) : 9;
    const minutes = tomorrowMatch[2] ? parseInt(tomorrowMatch[2], 10) : 0;
    const text = (tomorrowMatch[3] || "").trim();

    const scheduledDate = new Date(baseDate.getTime());
    scheduledDate.setDate(scheduledDate.getDate() + 1);
    scheduledDate.setHours(hours, minutes, 0, 0);

    return {
      timeExpr: `tomorrow at ${hours}:${minutes.toString().padStart(2, "0")}`,
      text: text || "Reminder",
      scheduledDate
    };
  }

  // Fallback: Default to 1 hour if arbitrary text without explicit time
  const fallbackDate = new Date(baseDate.getTime() + 60 * 60 * 1000);
  return {
    timeExpr: "in 1h",
    text: rawArgs,
    scheduledDate: fallbackDate
  };
}

export interface ParsedSplitCommand {
  amount: string;
  description: string;
  formattedMessage: string;
}

/**
 * Parses /split or /expense:
 * - "/split $60 Groceries"
 * - "/split 50 Dinner with kids"
 */
export function parseSplitCommand(input: string): ParsedSplitCommand | null {
  const match = input.trim().match(/^\/(?:split|expense)\s+([$€£¥]?\d+(?:[.,]\d{1,2})?)\s*(.*)$/i);
  if (!match) return null;

  const rawAmount = match[1].trim();
  const description = match[2].trim() || "Shared Expense";

  const formattedMessage = [
    `💰 **Expense Split: ${description}**`,
    `Total: **${rawAmount}**`,
    `Tap below or react once paid!`
  ].join("\n");

  return {
    amount: rawAmount,
    description,
    formattedMessage
  };
}

export function parseTodoCommand(input: string): string | null {
  const match = input.trim().match(/^\/(?:todo|task)\s+(.+)$/i);
  if (!match) return null;
  return match[1].trim();
}

export function formatMacroCommand(command: string, rawArgs: string): string {
  const trimmed = rawArgs.trim();
  switch (command.toLowerCase()) {
    case "shrug":
      return trimmed ? `${trimmed} ¯\\_(ツ)_/¯` : "¯\\_(ツ)_/¯";
    case "tableflip":
      return trimmed ? `${trimmed} (╯°□°)╯︵ ┻━┻` : "(╯°□°)╯︵ ┻━┻";
    case "spoiler":
      return `||${trimmed}||`;
    case "silent":
      return `🔕 *[Silent]* ${trimmed}`;
    case "urgent":
      return `🚨 **[URGENT]** ${trimmed}`;
    case "disappear": {
      const mode = trimmed || "24h";
      return `⏳ *Disappearing messages set to ${mode}*`;
    }
    default:
      return trimmed;
  }
}
