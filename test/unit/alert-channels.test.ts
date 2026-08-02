import { describe, expect, it } from "vitest";
import { buildAlertChannels, discordChannel, slackChannel } from "@/utils";

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

describe("buildAlertChannels", () => {
  it("returns no channels when both URLs are empty", () => {
    expect(buildAlertChannels({ slackUrl: "", discordUrl: "" })).toEqual([]);
  });

  it("returns only the configured channels", () => {
    expect(
      buildAlertChannels({ slackUrl: "https://s", discordUrl: "" }).map((c) => c.name),
    ).toEqual(["slack"]);
    expect(
      buildAlertChannels({ slackUrl: "", discordUrl: "https://d" }).map((c) => c.name),
    ).toEqual(["discord"]);
  });

  it("returns both channels in a stable order", () => {
    const channels = buildAlertChannels({ slackUrl: "https://s", discordUrl: "https://d" });
    expect(channels.map((c) => c.name)).toEqual(["slack", "discord"]);
  });
});
