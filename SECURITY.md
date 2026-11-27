# Security policy

## 📌 Summary

Security is a first-class goal of Pulseboard. Please report vulnerabilities privately, and give us a chance to fix them before they are made public.

## 🛡️ Supported versions

Security fixes are released for the **latest minor version**. While the project is before 1.0, please upgrade to the latest release to receive fixes.

## 📬 Reporting a vulnerability

Use GitHub's **Report a vulnerability** option on the repository's Security tab, which opens a private advisory. Please do not open a public issue for a security problem.

Helpful details: the version (shown on the sign-in page and at `/health`), what you did, what you expected, what happened, and the impact you think it has. We aim to acknowledge reports within 3 working days and to say what we plan to do within 10.

## 🔍 What the project already does

See the Security notes in the [README](README.md): encrypted secrets, signed-in sessions that react to changes at once, sign-in throttling, least-privilege containers, audited dependencies, and read-only, key-restricted SSH collection with host key pinning.
