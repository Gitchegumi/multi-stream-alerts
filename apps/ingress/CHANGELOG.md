# Changelog

## [0.1.1](https://github.com/Gitchegumi/multi-stream-alerts/compare/alerts-ingress-v0.1.0...alerts-ingress-v0.1.1) (2026-06-05)


### Features

* add self-hosted alerts suite ([4f8974f](https://github.com/Gitchegumi/multi-stream-alerts/commit/4f8974fd4c06872fa6517553e2a0743a78a3df69))
* **alerts:** add alert catalog and reusable layouts ([effb657](https://github.com/Gitchegumi/multi-stream-alerts/commit/effb65725d1a0480c550756594ffc43efee14302))
* **ingress:** implement Twitch EventSub normalization and alert pipeline ([d48acf2](https://github.com/Gitchegumi/multi-stream-alerts/commit/d48acf2a97fbb2789e0d3522de78db026377d4d0))
* **ingress:** implement YouTube PubSub normalization and wire into webhook ([437a3a4](https://github.com/Gitchegumi/multi-stream-alerts/commit/437a3a4d0c9cafb4ab2880995bcb61e5f2254fe4))
* **ingress:** Ko-fi webhook resolves channel from URL and uses stored token ([0d35dd2](https://github.com/Gitchegumi/multi-stream-alerts/commit/0d35dd23fdab0e864c24ed8aadb139ff41228c9f))
* **ingress:** Twitch EventSub HMAC matched against every configured channel ([05f1219](https://github.com/Gitchegumi/multi-stream-alerts/commit/05f12194d97c5bfc0be8cd4cd03a3f1568221a19))
* **ingress:** YouTube webhook resolves channel from URL and uses stored credentials ([fee10d8](https://github.com/Gitchegumi/multi-stream-alerts/commit/fee10d826a1f85a9c8bbb9b900c5cb5acd38fc02))
* **overlay:** complete alert pipeline for Twitch/YouTube + display key rotation + diagnostics ([c43eff4](https://github.com/Gitchegumi/multi-stream-alerts/commit/c43eff4c29ed37c4c558c0f15d735d67acaa973c))
* per-workspace platform credentials in web UI ([3a84a1c](https://github.com/Gitchegumi/multi-stream-alerts/commit/3a84a1c42feef39f41729b34e6ed039771d329ef))
* **shared,ingress:** require INSTANCE_ENCRYPTION_KEY; drop platform env vars ([75b7bb2](https://github.com/Gitchegumi/multi-stream-alerts/commit/75b7bb2c4d166ba28c255f5a283f1fac7710bd9d))


### Bug Fixes

* address alert suite review findings ([54e452d](https://github.com/Gitchegumi/multi-stream-alerts/commit/54e452dc278d5c4755bb66d61931530fa308182e))
