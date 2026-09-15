import { describe, expect, it } from "vitest";
import {
  ALL_SLASH_COMMANDS,
  formatMacroCommand,
  parseRemindCommand,
  parseSplitCommand,
  parseTodoCommand
} from "./slashCommandRegistry";

describe("slashCommandRegistry", () => {
  it("contains all expected slash commands", () => {
    const commands = ALL_SLASH_COMMANDS.map((c) => c.command);
    expect(commands).toContain("poll");
    expect(commands).toContain("schedule");
    expect(commands).toContain("canvas");
    expect(commands).toContain("checklist");
    expect(commands).toContain("remind");
    expect(commands).toContain("todo");
    expect(commands).toContain("split");
    expect(commands).toContain("location");
    expect(commands).toContain("call");
    expect(commands).toContain("meet");
    expect(commands).toContain("silent");
    expect(commands).toContain("urgent");
    expect(commands).toContain("spoiler");
    expect(commands).toContain("disappear");
    expect(commands).toContain("pin");
    expect(commands).toContain("mute");
    expect(commands).toContain("shrug");
    expect(commands).toContain("tableflip");
  });

  describe("parseRemindCommand", () => {
    const baseDate = new Date(2026, 8, 15, 12, 0, 0); // 12:00:00

    it("parses relative minutes", () => {
      const parsed = parseRemindCommand("/remind in 15m Check oven", baseDate);
      expect(parsed).not.toBeNull();
      expect(parsed?.text).toBe("Check oven");
      expect(parsed?.scheduledDate.getTime()).toBe(baseDate.getTime() + 15 * 60 * 1000);
    });

    it("parses relative hours", () => {
      const parsed = parseRemindCommand("/remind 2h Dinner", baseDate);
      expect(parsed).not.toBeNull();
      expect(parsed?.text).toBe("Dinner");
      expect(parsed?.scheduledDate.getTime()).toBe(baseDate.getTime() + 2 * 60 * 60 * 1000);
    });

    it("parses relative days", () => {
      const parsed = parseRemindCommand("/remind in 3d Water plants", baseDate);
      expect(parsed).not.toBeNull();
      expect(parsed?.text).toBe("Water plants");
      expect(parsed?.scheduledDate.getDate()).toBe(baseDate.getDate() + 3);
    });

    it("parses tomorrow with time", () => {
      const parsed = parseRemindCommand("/remind tomorrow 15:30 Doctor appointment", baseDate);
      expect(parsed).not.toBeNull();
      expect(parsed?.text).toBe("Doctor appointment");
      expect(parsed?.scheduledDate.getDate()).toBe(baseDate.getDate() + 1);
      expect(parsed?.scheduledDate.getHours()).toBe(15);
      expect(parsed?.scheduledDate.getMinutes()).toBe(30);
    });

    it("returns null for non-matching or empty commands", () => {
      expect(parseRemindCommand("/schedule")).toBeNull();
      expect(parseRemindCommand("/remind")).toBeNull();
    });
  });

  describe("parseSplitCommand", () => {
    it("parses amount with currency symbol and description", () => {
      const parsed = parseSplitCommand("/split $60 Groceries");
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe("$60");
      expect(parsed?.description).toBe("Groceries");
      expect(parsed?.formattedMessage).toContain("Expense Split: Groceries");
      expect(parsed?.formattedMessage).toContain("$60");
    });

    it("parses /expense synonym", () => {
      const parsed = parseSplitCommand("/expense 45.50 Pizza night");
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe("45.50");
      expect(parsed?.description).toBe("Pizza night");
    });

    it("returns null for invalid inputs", () => {
      expect(parseSplitCommand("/split")).toBeNull();
      expect(parseSplitCommand("/split Groceries")).toBeNull();
    });
  });

  describe("parseTodoCommand", () => {
    it("parses task text", () => {
      expect(parseTodoCommand("/todo Buy almond milk")).toBe("Buy almond milk");
      expect(parseTodoCommand("/task Call doctor")).toBe("Call doctor");
      expect(parseTodoCommand("/todo")).toBeNull();
    });
  });

  describe("formatMacroCommand", () => {
    it("formats shrug", () => {
      expect(formatMacroCommand("shrug", "")).toBe("¯\\_(ツ)_/¯");
      expect(formatMacroCommand("shrug", "I do not know")).toBe("I do not know ¯\\_(ツ)_/¯");
    });

    it("formats tableflip", () => {
      expect(formatMacroCommand("tableflip", "")).toBe("(╯°□°)╯︵ ┻━┻");
      expect(formatMacroCommand("tableflip", "rage")).toBe("rage (╯°□°)╯︵ ┻━┻");
    });

    it("formats spoiler", () => {
      expect(formatMacroCommand("spoiler", "Snape kills Dumbledore")).toBe("||Snape kills Dumbledore||");
    });

    it("formats silent", () => {
      expect(formatMacroCommand("silent", "Sleep well")).toBe("🔕 *[Silent]* Sleep well");
    });

    it("formats urgent", () => {
      expect(formatMacroCommand("urgent", "Call me ASAP")).toBe("🚨 **[URGENT]** Call me ASAP");
    });

    it("formats disappear", () => {
      expect(formatMacroCommand("disappear", "")).toBe("⏳ *Disappearing messages set to 24h*");
      expect(formatMacroCommand("disappear", "1h")).toBe("⏳ *Disappearing messages set to 1h*");
    });
  });
});
