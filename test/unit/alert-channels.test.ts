import { describe, expect, it } from "vitest";
import { discordChannel, selectAlertChannel, slackChannel } from "@/utils";

describe("alert channel builders", () => {
  it("formats Slack payloads as { text }", () => {
    const channel = slackChannel("https://hooks.slack.example/x");
    expect(channel.name).toBe("slack");
    expect(channel.format("hello")).toEqual({ text: "hello" });
  });

  it("formats Discord payloads as { content }", () => {
    const channel = discordChannel("https://discord.example/webhooks/x");
    expect(channel.name).toBe("discord");
    expect(channel.format("hello")).toEqual({ content: "hello" });
  });
});

describe("selectAlertChannel", () => {
  const urls = { slackUrl: "https://s", discordUrl: "https://d" };

  it("selects Slack when chosen and its URL is set", () => {
    const channel = selectAlertChannel({ channel: "slack", ...urls });
    expect(channel?.name).toBe("slack");
    expect(channel?.url).toBe("https://s");
  });

  it("selects Discord when chosen and its URL is set", () => {
    const channel = selectAlertChannel({ channel: "discord", ...urls });
    expect(channel?.name).toBe("discord");
    expect(channel?.url).toBe("https://d");
  });

  it("returns null for 'none'", () => {
    expect(selectAlertChannel({ channel: "none", ...urls })).toBeNull();
  });

  it("returns null when the chosen channel has no URL", () => {
    expect(
      selectAlertChannel({ channel: "slack", slackUrl: "", discordUrl: "https://d" }),
    ).toBeNull();
    expect(
      selectAlertChannel({ channel: "discord", slackUrl: "https://s", discordUrl: "" }),
    ).toBeNull();
  });
});
