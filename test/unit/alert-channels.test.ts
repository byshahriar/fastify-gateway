import { describe, expect, it } from "vitest";
import { AlertChannelKind } from "@/enums";
import { discordChannel, selectAlertChannel, slackChannel } from "@/utils";

describe("alert channel builders", () => {
  it("formats Slack payloads as { text }", () => {
    const channel = slackChannel("https://hooks.slack.example/x");
    expect(channel.name).toBe(AlertChannelKind.Slack);
    expect(channel.format("hello")).toEqual({ text: "hello" });
  });

  it("formats Discord payloads as { content }", () => {
    const channel = discordChannel("https://discord.example/webhooks/x");
    expect(channel.name).toBe(AlertChannelKind.Discord);
    expect(channel.format("hello")).toEqual({ content: "hello" });
  });
});

describe("selectAlertChannel", () => {
  const urls = { slackUrl: "https://s", discordUrl: "https://d" };

  it("selects Slack when chosen and its URL is set", () => {
    const channel = selectAlertChannel({ channel: AlertChannelKind.Slack, ...urls });
    expect(channel?.name).toBe(AlertChannelKind.Slack);
    expect(channel?.url).toBe("https://s");
  });

  it("selects Discord when chosen and its URL is set", () => {
    const channel = selectAlertChannel({ channel: AlertChannelKind.Discord, ...urls });
    expect(channel?.name).toBe(AlertChannelKind.Discord);
    expect(channel?.url).toBe("https://d");
  });

  it("returns null for 'none'", () => {
    expect(selectAlertChannel({ channel: AlertChannelKind.None, ...urls })).toBeNull();
  });

  it("returns null when the chosen channel has no URL", () => {
    expect(
      selectAlertChannel({
        channel: AlertChannelKind.Slack,
        slackUrl: "",
        discordUrl: "https://d",
      }),
    ).toBeNull();
    expect(
      selectAlertChannel({
        channel: AlertChannelKind.Discord,
        slackUrl: "https://s",
        discordUrl: "",
      }),
    ).toBeNull();
  });
});
