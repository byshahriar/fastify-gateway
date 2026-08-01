# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes |

## Reporting a vulnerability

**Do not open a public issue.** Report suspected vulnerabilities privately
through GitHub's security advisories: **Security → Report a vulnerability**
on the repository.

Include what you can:

- A description of the issue and its impact
- Reproduction steps or a proof of concept
- Affected version or commit

You can expect an acknowledgment within a few days. Please allow maintainers
reasonable time to investigate and release a fix before any public
disclosure.

## Scope notes for deployers

The gateway's security posture and its deployment assumptions (trusted
proxy, credential handling, log redaction) are documented in
[Operations → Security posture](docs/operations.md#security-posture) and
[Authentication](docs/authentication.md). Misconfigurations covered there —
such as enabling `trustProxy` without a trusted load balancer — are
deployment concerns rather than vulnerabilities, but reports that identify
unsafe defaults are welcome.
