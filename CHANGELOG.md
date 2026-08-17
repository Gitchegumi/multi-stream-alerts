# Changelog

## [0.10.11](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.10...v0.10.11) (2026-08-17)


### Bug Fixes

* **homepage:** clarify app identity and purpose ([0bee620](https://github.com/Gitchegumi/multi-stream-alerts/commit/0bee6200b14066ae6f5d01fc368c7b81cc661392))
* **homepage:** clarify GitchAlerts identity and purpose ([35d2bdd](https://github.com/Gitchegumi/multi-stream-alerts/commit/35d2bdd6b6276517ae5c80459200f6eb7823f20b))

## [0.10.10](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.9...v0.10.10) (2026-08-17)


### Features

* **integrations:** add friendly identities and legal pages ([b0c8ff1](https://github.com/Gitchegumi/multi-stream-alerts/commit/b0c8ff10cd867e702a6cfddc5ec124c559512e9b))
* **integrations:** show account names and add legal pages ([64196b0](https://github.com/Gitchegumi/multi-stream-alerts/commit/64196b0724ac5a8a6f9ea688667f7361ce715e46))


### Bug Fixes

* **auth:** serialize Twitch account limit checks ([a47992f](https://github.com/Gitchegumi/multi-stream-alerts/commit/a47992f15a4e38fea26980cfe499212a9432c69f))
* **twitch:** preserve channels on partial disconnect ([931ba23](https://github.com/Gitchegumi/multi-stream-alerts/commit/931ba23d2db24bee6592c2d0f2a085c1bea14b50))
* **twitch:** serialize account disconnects ([9a4ba80](https://github.com/Gitchegumi/multi-stream-alerts/commit/9a4ba80f14e5f740516b6c33511bca45b7e9555a))
* **twitch:** serialize shared secret provisioning ([e6cbab6](https://github.com/Gitchegumi/multi-stream-alerts/commit/e6cbab698bfb128ec01b82745e740a283f2af1d1))

## [0.10.9](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.8...v0.10.9) (2026-07-09)


### Features

* OAuth-first Twitch/YouTube integrations with backend auto-provisioning ([#128](https://github.com/Gitchegumi/multi-stream-alerts/issues/128)) ([#133](https://github.com/Gitchegumi/multi-stream-alerts/issues/133)) ([ba5007b](https://github.com/Gitchegumi/multi-stream-alerts/commit/ba5007be3681b3273362bc9bef410a9a23f533c0))


### Bug Fixes

* **docs:** serve dashboard guide from image and scrub user/dev guides ([#131](https://github.com/Gitchegumi/multi-stream-alerts/issues/131)) ([dc27641](https://github.com/Gitchegumi/multi-stream-alerts/commit/dc276418d7540ed89a28341e32921079b0727493)), closes [#61](https://github.com/Gitchegumi/multi-stream-alerts/issues/61)

## [0.10.8](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.7...v0.10.8) (2026-07-09)


### Bug Fixes

* **web:** match browser source to editor stage and hot-swap saved settings ([7f1d0ec](https://github.com/Gitchegumi/multi-stream-alerts/commit/7f1d0ec01965c0cddc457d426557e00113db9109))
* **web:** match browser source to editor stage and hot-swap saved settings ([7d12e6b](https://github.com/Gitchegumi/multi-stream-alerts/commit/7d12e6b1af147ae5b99519f7b07c5f289b629c99))

## [0.10.7](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.6...v0.10.7) (2026-07-08)


### Features

* **overlay:** add "none" image animation option ([#122](https://github.com/Gitchegumi/multi-stream-alerts/issues/122)) ([f60a42d](https://github.com/Gitchegumi/multi-stream-alerts/commit/f60a42d2c6bac2436f77f945d78228695fbff25b))


### Bug Fixes

* changed css for the canvas editor toolbar so that it is placed o… ([4f40dce](https://github.com/Gitchegumi/multi-stream-alerts/commit/4f40dce5bb081a6cec662d147f47b0e70062f096))
* changed css for the canvas editor toolbar so that it is placed outside the canvas area. ([a08551b](https://github.com/Gitchegumi/multi-stream-alerts/commit/a08551bbe4cfe43d470d6ef649c4dcf6ef1a0e27))
* **overlay:** scale browser source to viewport and harden alert delivery ([#124](https://github.com/Gitchegumi/multi-stream-alerts/issues/124)) ([7e3ab37](https://github.com/Gitchegumi/multi-stream-alerts/commit/7e3ab3712a6d0383f1f051ad19a4cf518c13f115))

## [0.10.6](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.5...v0.10.6) (2026-07-08)


### Bug Fixes

* gate linked-account connect buttons on OAuth availability ([#115](https://github.com/Gitchegumi/multi-stream-alerts/issues/115)) ([01e9514](https://github.com/Gitchegumi/multi-stream-alerts/commit/01e9514c9327c8eef78e08658b681fe145394816))
* gate linked-account connect buttons on OAuth availability ([#115](https://github.com/Gitchegumi/multi-stream-alerts/issues/115)) ([da27728](https://github.com/Gitchegumi/multi-stream-alerts/commit/da2772891d7db655e4c81fb75256f85c3c414998))
* render configured/animated assets in test alert preview ([#117](https://github.com/Gitchegumi/multi-stream-alerts/issues/117)) ([35ea066](https://github.com/Gitchegumi/multi-stream-alerts/commit/35ea0666ac4daf0ec3ffa8bc47e6bd6dd335ca1c))
* render configured/animated assets in test alert preview ([#117](https://github.com/Gitchegumi/multi-stream-alerts/issues/117)) ([b1b731e](https://github.com/Gitchegumi/multi-stream-alerts/commit/b1b731eb255d85a527998eae0458c7ea1853b2ca))

## [0.10.5](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.4...v0.10.5) (2026-07-07)


### Bug Fixes

* address PR [#114](https://github.com/Gitchegumi/multi-stream-alerts/issues/114) review feedback ([d2ba427](https://github.com/Gitchegumi/multi-stream-alerts/commit/d2ba42775d703f7167c5d3424c0fc6235b2a06f3))
* bypass account targeting for test alerts and add sample data ([dcfbe72](https://github.com/Gitchegumi/multi-stream-alerts/commit/dcfbe729a3ff0a6df14a7f14180e7c69cfbf3bab))
* bypass account targeting for test alerts so overlay receives them ([8621b06](https://github.com/Gitchegumi/multi-stream-alerts/commit/8621b062366449e1d4c243b1da2453a9913fd674))
* make Test alert play configured animations in the editor canvas ([a84e340](https://github.com/Gitchegumi/multi-stream-alerts/commit/a84e340033badee408c3627f20c34c01aef40e2f))
* make Test alert play configured animations in the editor canvas ([ebcdef5](https://github.com/Gitchegumi/multi-stream-alerts/commit/ebcdef59bbec2d56a546a5c7200e5c1b2aa9dc78)), closes [#110](https://github.com/Gitchegumi/multi-stream-alerts/issues/110)
* move visual styling to animated wrapper so shape/text layers animate ([d9ae937](https://github.com/Gitchegumi/multi-stream-alerts/commit/d9ae93750c5f89e601ddac47ed2fdf92bfa7dc74))
* remove token overlay causing placeholder/text overlap in inspector Content field ([80dbbe3](https://github.com/Gitchegumi/multi-stream-alerts/commit/80dbbe3c18fc577936dc01c205985a82d5587fdc))
* remove token overlay causing placeholder/text overlap in inspector Content field ([991d7df](https://github.com/Gitchegumi/multi-stream-alerts/commit/991d7df6fce3be55ddf6c7605b9b1219c1c0ce3b)), closes [#109](https://github.com/Gitchegumi/multi-stream-alerts/issues/109)

## [0.10.4](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.3...v0.10.4) (2026-07-06)


### Bug Fixes

* address Alerts editor layout and test-alert issues ([90a3f80](https://github.com/Gitchegumi/multi-stream-alerts/commit/90a3f80dcb928b46dd519cbcf73d4e6121f7ad2c))
* Alerts editor layout, collapsible linked accounts, and test alert ([173fdb6](https://github.com/Gitchegumi/multi-stream-alerts/commit/173fdb6a83f0d68e9e7b73028b648768aa687280))

## [0.10.3](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.2...v0.10.3) (2026-07-03)


### Features

* redesign alerts editor into Studio layout ([144193d](https://github.com/Gitchegumi/multi-stream-alerts/commit/144193d62f8589920fe2d01c14a0949337f3f33b))


### Bug Fixes

* address Studio editor review (drag scaling, audio button, alignment, logo) ([778bd7f](https://github.com/Gitchegumi/multi-stream-alerts/commit/778bd7f5ce02e3d5409b89ddd95cde071df9c82b))

## [0.10.2](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.10.1...v0.10.2) (2026-07-03)


### Features

* **auth:** OAuth account linking for Twitch and YouTube integrations ([#69](https://github.com/Gitchegumi/multi-stream-alerts/issues/69)) ([9c9d921](https://github.com/Gitchegumi/multi-stream-alerts/commit/9c9d92174f8b6805b3a8030d8049f3220b6b7bbb))
* consolidate integrations into workspace Settings page ([463c4e6](https://github.com/Gitchegumi/multi-stream-alerts/commit/463c4e62ce0c11bf271e4fa23ff1d9e1510d0c96)), closes [#95](https://github.com/Gitchegumi/multi-stream-alerts/issues/95)
* expose Twitch/YouTube OAuth linking from Alerts page ([#90](https://github.com/Gitchegumi/multi-stream-alerts/issues/90)) ([aa9241d](https://github.com/Gitchegumi/multi-stream-alerts/commit/aa9241d709ccf54922bf398dc1687d1954d129d2))
* move Integrations into Settings nav, remove redundant button ([#91](https://github.com/Gitchegumi/multi-stream-alerts/issues/91)) ([ad74a4c](https://github.com/Gitchegumi/multi-stream-alerts/commit/ad74a4cee326db407ca330b0068ff48900751732))
* support multiple authenticated accounts per alert ([96debd7](https://github.com/Gitchegumi/multi-stream-alerts/commit/96debd7b10a132d01d7064a381c673bd57face3b)), closes [#97](https://github.com/Gitchegumi/multi-stream-alerts/issues/97)


### Bug Fixes

* add pull-request-title-pattern to release-please config ([142cd7d](https://github.com/Gitchegumi/multi-stream-alerts/commit/142cd7d1c72d7e66cb303e86f885d71302eb5f35))
* add pull-request-title-pattern to release-please config ([6eed859](https://github.com/Gitchegumi/multi-stream-alerts/commit/6eed8598c755ef2eb641a95a56db289de7c46e2a))
* address PR [#98](https://github.com/Gitchegumi/multi-stream-alerts/issues/98) review — account targeting correctness ([8e4e5a5](https://github.com/Gitchegumi/multi-stream-alerts/commit/8e4e5a500a31364d0215c19c70f375eee3209bf3))
* **auth:** address PR [#70](https://github.com/Gitchegumi/multi-stream-alerts/issues/70) review — cookie handling, shared crypto, seamless signIn ([a958e33](https://github.com/Gitchegumi/multi-stream-alerts/commit/a958e333a38f3898d498ce3adeeb01e0ba935e78))
* gate account targeting to Twitch/YouTube, fix DB tests ([3f42da8](https://github.com/Gitchegumi/multi-stream-alerts/commit/3f42da8bb149d0c4133b227032afce3f9e288552))
* make Integrations nav link channel-scoped, add buildNavLinks tests ([#91](https://github.com/Gitchegumi/multi-stream-alerts/issues/91)) ([3d95fbe](https://github.com/Gitchegumi/multi-stream-alerts/commit/3d95fbed01d2582b493004d6f5d0cc4eb63dcee0))
* **release:** independent per-service tags + single root release ([04d9b0a](https://github.com/Gitchegumi/multi-stream-alerts/commit/04d9b0a9e0b8c361901173f1d55740e3d88d4d33))
* remove .ts extension from test imports, fix noUncheckedIndexedAccess on buffer tamper ([01a315c](https://github.com/Gitchegumi/multi-stream-alerts/commit/01a315cfcbd125cba1fd369233edbcd9d1c8e2ff))
* remove dead routes and scope linked accounts to workspace ([138a644](https://github.com/Gitchegumi/multi-stream-alerts/commit/138a644f210585a0bb632c62bb2406a2ba1ff2e1))
* remove unused PROVIDERS import from IntegrationsSection ([254115e](https://github.com/Gitchegumi/multi-stream-alerts/commit/254115e00ad1ad1feafd1577910e47d39a2d03e7))

## [0.1.10](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.9...v0.1.10) (2026-06-08)


### Features

* **admin:** add admin workspace overview page and API ([2cb63cc](https://github.com/Gitchegumi/multi-stream-alerts/commit/2cb63cc36c1325533c0d9100aabd1617a37239e3)), closes [#56](https://github.com/Gitchegumi/multi-stream-alerts/issues/56)
* **admin:** workspace overview for admin panel ([#56](https://github.com/Gitchegumi/multi-stream-alerts/issues/56)) ([d6344fd](https://github.com/Gitchegumi/multi-stream-alerts/commit/d6344fd52002ad27ffebd56018e189017ba696a1))


### Bug Fixes

* **admin-workspaces:** use direct Prisma call instead of internal fetch ([5493dc3](https://github.com/Gitchegumi/multi-stream-alerts/commit/5493dc33425f880d62fb498a12c129caa6e3d159))

## [0.1.9](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.8...v0.1.9) (2026-06-07)


### Features

* add self-hosted alerts suite ([4f8974f](https://github.com/Gitchegumi/multi-stream-alerts/commit/4f8974fd4c06872fa6517553e2a0743a78a3df69))
* adding logo and favicon ([d8828da](https://github.com/Gitchegumi/multi-stream-alerts/commit/d8828dada60ec4306778fc40077333f3a7987237))
* **admin:** purge revoked invite codes ([37476b0](https://github.com/Gitchegumi/multi-stream-alerts/commit/37476b032ef24839718771633b601278a0866897))
* **alerts:** add alert catalog and reusable layouts ([effb657](https://github.com/Gitchegumi/multi-stream-alerts/commit/effb65725d1a0480c550756594ffc43efee14302))
* **alerts:** add canvas workspace and docs site ([431c479](https://github.com/Gitchegumi/multi-stream-alerts/commit/431c479cba765ad03ef425ec85868371581e3b96))
* **api:** add overlay profile list and display-key rotation APIs with tests ([722dea7](https://github.com/Gitchegumi/multi-stream-alerts/commit/722dea75f14e74422aeffe71bbb88ba5d19a341b))
* **assets:** add workspace asset library ([ee2271d](https://github.com/Gitchegumi/multi-stream-alerts/commit/ee2271df4fbbf7324f88c07ebfd0d17a5fc35d0b))
* **assets:** add workspace asset library ([59bfbef](https://github.com/Gitchegumi/multi-stream-alerts/commit/59bfbefbf321e438a6d8d6344826b019b9da6862))
* **auth,ui:** email/password auth, shared nav, dedicated dashboard pages, responsive layout ([1978182](https://github.com/Gitchegumi/multi-stream-alerts/commit/19781825f7c0584753ace2c0b3bfd2d2c39a334a))
* **auth:** add external enrollment invite links ([26b80aa](https://github.com/Gitchegumi/multi-stream-alerts/commit/26b80aac87ed41577e21f7155eade8bb9275042e))
* **auth:** add invite codes and local password storage ([3c33623](https://github.com/Gitchegumi/multi-stream-alerts/commit/3c33623abc6fe7cf6e9daca949e9508f4538c911))
* **auth:** add local email/password signup with invite codes ([b085be8](https://github.com/Gitchegumi/multi-stream-alerts/commit/b085be806a80a957681ed6d1684300f70901f9fb))
* **dashboard:** pass release status to nav ([8cbca39](https://github.com/Gitchegumi/multi-stream-alerts/commit/8cbca39dbaca097aba90ab30b97dc4b5ceebb9c4))
* **dashboard:** show release and update status in nav ([884ce5b](https://github.com/Gitchegumi/multi-stream-alerts/commit/884ce5ba67df7183a3c0ddb4780ab041ec98e3cd))
* **dashboard:** surface release status in dashboard shell ([4edb8a1](https://github.com/Gitchegumi/multi-stream-alerts/commit/4edb8a1e536f5162ac979231a4168c541ef8ec79))
* **database:** AES-256-GCM secrets helper with round-trip and tamper tests ([1ae7caf](https://github.com/Gitchegumi/multi-stream-alerts/commit/1ae7cafbdbf9891aa22c8fbee9eecdadd2502f1c))
* **database:** canManageChannelCredentials — owner-or-admin only ([8dc3709](https://github.com/Gitchegumi/multi-stream-alerts/commit/8dc3709b1b249be58faa384d9b5e34d1b3ac3c43))
* **database:** integration-credentials service with encrypted read/write/clear ([a029958](https://github.com/Gitchegumi/multi-stream-alerts/commit/a029958787b52c954f0e257bcdda39e9d5e0f0a6))
* **database:** per-workspace IntegrationCredential tables ([7002e7b](https://github.com/Gitchegumi/multi-stream-alerts/commit/7002e7bd781f406fb8ce9158af60deeee4738fef))
* **ingress:** implement Twitch EventSub normalization and alert pipeline ([d48acf2](https://github.com/Gitchegumi/multi-stream-alerts/commit/d48acf2a97fbb2789e0d3522de78db026377d4d0))
* **ingress:** implement YouTube PubSub normalization and wire into webhook ([437a3a4](https://github.com/Gitchegumi/multi-stream-alerts/commit/437a3a4d0c9cafb4ab2880995bcb61e5f2254fe4))
* **ingress:** Ko-fi webhook resolves channel from URL and uses stored token ([0d35dd2](https://github.com/Gitchegumi/multi-stream-alerts/commit/0d35dd23fdab0e864c24ed8aadb139ff41228c9f))
* **ingress:** Twitch EventSub HMAC matched against every configured channel ([05f1219](https://github.com/Gitchegumi/multi-stream-alerts/commit/05f12194d97c5bfc0be8cd4cd03a3f1568221a19))
* **ingress:** YouTube webhook resolves channel from URL and uses stored credentials ([fee10d8](https://github.com/Gitchegumi/multi-stream-alerts/commit/fee10d826a1f85a9c8bbb9b900c5cb5acd38fc02))
* **overlay:** complete alert pipeline for Twitch/YouTube + display key rotation + diagnostics ([c43eff4](https://github.com/Gitchegumi/multi-stream-alerts/commit/c43eff4c29ed37c4c558c0f15d735d67acaa973c))
* **overlays:** add browser layout editor ([b914380](https://github.com/Gitchegumi/multi-stream-alerts/commit/b914380fd0dfe16be439b7440f0c3cfae352f438))
* **overlays:** add browser layout editor ([adeb9c7](https://github.com/Gitchegumi/multi-stream-alerts/commit/adeb9c7fe3b1cd9f9fa0ac6b90f8130ff05f4660))
* **overlays:** add canvas runtime schema editor ([c35abb5](https://github.com/Gitchegumi/multi-stream-alerts/commit/c35abb54eee8b559fcef05375c17b345e67cb9dc)), closes [#60](https://github.com/Gitchegumi/multi-stream-alerts/issues/60)
* **overlays:** make canvas editor interactive ([848e0fc](https://github.com/Gitchegumi/multi-stream-alerts/commit/848e0fc6acf37bbfe4d8317dc8fd43546f654737))
* per-workspace platform credentials in web UI ([3a84a1c](https://github.com/Gitchegumi/multi-stream-alerts/commit/3a84a1c42feef39f41729b34e6ed039771d329ef))
* **rate-limit:** shared MemoryRateLimiter + getClientIp ([7e21eae](https://github.com/Gitchegumi/multi-stream-alerts/commit/7e21eae4eff074b5f8eb5dee617b3febb42bd6ae))
* **rate-limit:** shared MemoryRateLimiter + getClientIp, apply to stream route ([83a0e73](https://github.com/Gitchegumi/multi-stream-alerts/commit/83a0e7340a22f9a3ae926d5ec1394a215b72a39d))
* **release:** add version metadata and update status ([e68a26b](https://github.com/Gitchegumi/multi-stream-alerts/commit/e68a26ba46c9b2f69c44a86bed3ed5e37d3d0bcb))
* **shared,ingress:** require INSTANCE_ENCRYPTION_KEY; drop platform env vars ([75b7bb2](https://github.com/Gitchegumi/multi-stream-alerts/commit/75b7bb2c4d166ba28c255f5a283f1fac7710bd9d))
* **ui:** cleanup pass — shared nav, dedicated pages, responsive layout, email/password auth ([f60b4e3](https://github.com/Gitchegumi/multi-stream-alerts/commit/f60b4e3748678ed89e261ea58e30b213f98d5d95))
* **web:** add recent alert feed pills ([eee76ea](https://github.com/Gitchegumi/multi-stream-alerts/commit/eee76ea5f5a124829c9ec10e267b5f6ab27da288))
* **web:** add shared NavBar, DashboardShell, and responsive mobile styles ([5414f85](https://github.com/Gitchegumi/multi-stream-alerts/commit/5414f8538bc02ae6647158bf187476d5439f5050))
* **web:** align UI with brand palette ([7790aab](https://github.com/Gitchegumi/multi-stream-alerts/commit/7790aabd05a2fdd0f73f3b70188a8dd29d830e78))
* **web:** align UI with brand palette ([1e65c59](https://github.com/Gitchegumi/multi-stream-alerts/commit/1e65c5956de67ecce737dbb3dcd360798fcef57f))
* **web:** embed guide in dashboard ([8f54619](https://github.com/Gitchegumi/multi-stream-alerts/commit/8f54619b91d11b29f171589e85aaff4d1a605c5d))
* **web:** per-channel integrations API (GET/PUT/DELETE) with credential authz ([d294fac](https://github.com/Gitchegumi/multi-stream-alerts/commit/d294fac1389af54419906b83fc8594bfdf329c82))
* **web:** per-channel integrations settings page with masked forms ([8159a4c](https://github.com/Gitchegumi/multi-stream-alerts/commit/8159a4caa958728b8aee3e86c16499b5ac005979))
* **web:** polish branded dashboard surfaces ([fbb4645](https://github.com/Gitchegumi/multi-stream-alerts/commit/fbb464592dfcdb71586c7eb2972da3a212ea9387))


### Bug Fixes

* add user to Dockerfile ([2b0ca78](https://github.com/Gitchegumi/multi-stream-alerts/commit/2b0ca78a097f2dccc1e6e24118feedc65b91cc10))
* added USER and HEALTHCHECK to Dockerfile ([40f64b0](https://github.com/Gitchegumi/multi-stream-alerts/commit/40f64b027aedb6487fb20c47b5be3ae2af0194f7))
* address alert suite review findings ([54e452d](https://github.com/Gitchegumi/multi-stream-alerts/commit/54e452dc278d5c4755bb66d61931530fa308182e))
* adjusted height restriction for .component-alert-bindings ([2511c2e](https://github.com/Gitchegumi/multi-stream-alerts/commit/2511c2e92f4a0da108a6490b93ee8ab9447c5a40))
* **assets:** serialize bigint fields and improve upload success/error UI ([576d2b5](https://github.com/Gitchegumi/multi-stream-alerts/commit/576d2b533bb30576bc1f5376fa55e4cdb50a440f)), closes [#36](https://github.com/Gitchegumi/multi-stream-alerts/issues/36)
* **assets:** serialize bigint fields and improve upload success/error UI ([#36](https://github.com/Gitchegumi/multi-stream-alerts/issues/36)) ([e16a521](https://github.com/Gitchegumi/multi-stream-alerts/commit/e16a521762c3534d127e95764f4919cc4ca71430))
* **auth:** address PR [#4](https://github.com/Gitchegumi/multi-stream-alerts/issues/4) review feedback ([04fd0d1](https://github.com/Gitchegumi/multi-stream-alerts/commit/04fd0d11473dec8ec99039f564dee45d62f8c4d9))
* **auth:** address PR [#7](https://github.com/Gitchegumi/multi-stream-alerts/issues/7) review feedback ([b14c2b6](https://github.com/Gitchegumi/multi-stream-alerts/commit/b14c2b612998466b0f4adc717da11c7229a7fc17))
* **auth:** correct OIDC callback URL and secure invite cookies for reverse-proxy deployments ([f2a2fb3](https://github.com/Gitchegumi/multi-stream-alerts/commit/f2a2fb34af75478d07affa83e4634ca2963dd910))
* **auth:** correct OIDC callback URL and secure invite cookies for reverse-proxy deployments ([#39](https://github.com/Gitchegumi/multi-stream-alerts/issues/39)) ([50ab3de](https://github.com/Gitchegumi/multi-stream-alerts/commit/50ab3deee34ba4a0d1f12f8f8e9a8987a9a60b95))
* **auth:** harden external enrollment invites ([0501a54](https://github.com/Gitchegumi/multi-stream-alerts/commit/0501a5452358833b41da640e4d1e83ec7ea652fd))
* **auth:** normalize OIDC issuer discovery ([fc570f4](https://github.com/Gitchegumi/multi-stream-alerts/commit/fc570f490470b13f11cfb10ccf821f073be6d0b1))
* **auth:** remove stale User.passwordHash; add LocalCredential model, gate auth by env ([6826c46](https://github.com/Gitchegumi/multi-stream-alerts/commit/6826c469d2d7d6513311678d69169f0a53aa0ea3))
* **auth:** remove stale User.passwordHash; add LocalCredential model, gate auth by env ([79159de](https://github.com/Gitchegumi/multi-stream-alerts/commit/79159deebbf004f1df9bb556738eb3e214f57ffc))
* **auth:** restore OIDC invite onboarding ([a02e1e1](https://github.com/Gitchegumi/multi-stream-alerts/commit/a02e1e11980181cc8161046cce8a8655550bbd4f))
* **auth:** restore OIDC invite onboarding ([c9e675e](https://github.com/Gitchegumi/multi-stream-alerts/commit/c9e675e33ab5fd978f9aa10b9059e2d697f4640b))
* **auth:** use utf-8 buffer for scrypt to handle unicode passwords ([dc68f9e](https://github.com/Gitchegumi/multi-stream-alerts/commit/dc68f9ec8a94c3e898365824349f435d96fa9cd7))
* **auth:** wire OIDC discovery by setting `wellKnown` ([c87ca7a](https://github.com/Gitchegumi/multi-stream-alerts/commit/c87ca7a0a374ed446900f580f4e1f11b2a54a4fd))
* **auth:** wire OIDC discovery by setting `wellKnown` ([a03d110](https://github.com/Gitchegumi/multi-stream-alerts/commit/a03d110c2498a06b73cfa26bdceae036d61570f9))
* **ci:** add DATABASE_URL env for web tests using Prisma 7 pg adapter ([cc4fd8b](https://github.com/Gitchegumi/multi-stream-alerts/commit/cc4fd8b35d37899319053b34ec280f11035034e1))
* **ci:** bump codeql-action v3→v4 and checkout v6→v4 ([84cf1d6](https://github.com/Gitchegumi/multi-stream-alerts/commit/84cf1d6f5e55491e16620e2de0706ba28813df22))
* **ci:** restore Docker image build ([8b1d084](https://github.com/Gitchegumi/multi-stream-alerts/commit/8b1d084e2f49ee8578e6c7291c55c7bad7872a82))
* configure nextauth public URL ([b6f0f5a](https://github.com/Gitchegumi/multi-stream-alerts/commit/b6f0f5a60fec0daabf1ef07c63a0122e92a24b9b))
* configure nextauth public URL ([cfcf898](https://github.com/Gitchegumi/multi-stream-alerts/commit/cfcf89874d1ab64d1b0c05ba2893cb9aaa1b7bc5))
* **database,web:** Prisma 7 driver adapter + TypeScript 6 tsconfig ([638dd27](https://github.com/Gitchegumi/multi-stream-alerts/commit/638dd273b907f351fd2587b3eaf68c43237398e6))
* **database:** avoid bootstrap display key collisions ([da50dac](https://github.com/Gitchegumi/multi-stream-alerts/commit/da50dac65123346483449a2134b0889461fdb32d))
* **database:** avoid bootstrap display key collisions ([067a0a8](https://github.com/Gitchegumi/multi-stream-alerts/commit/067a0a81204e45222bc983404e8581ebd3f1d252))
* **database:** clearChannelSecret treats missing secret row as a no-op ([d65a764](https://github.com/Gitchegumi/multi-stream-alerts/commit/d65a76409fa5e08b40ec9ae3687a8926ba24fbd9))
* **deps:** bump postcss to 8.5.10 to resolve CVE-2026-41305 ([272aa19](https://github.com/Gitchegumi/multi-stream-alerts/commit/272aa195e7f2da62161e2c3648c856138a44d6b1))
* **deps:** bump uuid override 11.1.0 → 11.1.1 (CVE-2026-41907) ([f68e676](https://github.com/Gitchegumi/multi-stream-alerts/commit/f68e676d010907cfee84b816dbfa4d3770b63761))
* **deps:** bump uuid to 11.1.0 to resolve CVE-2026-41907 ([ae62f92](https://github.com/Gitchegumi/multi-stream-alerts/commit/ae62f927c48bd4eaf7c4dc646fbbe727fdfedaaf))
* **deps:** bump uuid to 11.1.0 to resolve CVE-2026-41907 ([cee0967](https://github.com/Gitchegumi/multi-stream-alerts/commit/cee0967342c16e6eed02cdc0f90354b87591a73b))
* gitleaks script ([bb1f658](https://github.com/Gitchegumi/multi-stream-alerts/commit/bb1f658b5b997686748b5bdbf56a3ba0c10c2718))
* **overlay:** remove conflicting legacy route ([0ede83e](https://github.com/Gitchegumi/multi-stream-alerts/commit/0ede83e8fd35f0b2d8941c7568b17d71a58e1593))
* **overlays:** address editor accessibility comments ([9a6e1cd](https://github.com/Gitchegumi/multi-stream-alerts/commit/9a6e1cd407976ac246ea31dcaa22e0ffb27dc722))
* **overlays:** harden editor save and restore ([82643d6](https://github.com/Gitchegumi/multi-stream-alerts/commit/82643d692a7451740e2aed261bd82e39ff1d5820))
* **overlays:** refresh canvas urls and docs ([6fb1384](https://github.com/Gitchegumi/multi-stream-alerts/commit/6fb1384a4d2a33c535089ba3a45e181b0f8aa262))
* **overlays:** repair canvas editor media controls ([4ff39c3](https://github.com/Gitchegumi/multi-stream-alerts/commit/4ff39c30c19c4057cd43c2f52fea05bc8a05607b))
* **overlays:** restore editor component return ([454d1ac](https://github.com/Gitchegumi/multi-stream-alerts/commit/454d1ac01fa19878384579d15cba67a02262aa8b))
* **overlays:** sanitize editor hydration ([8263e08](https://github.com/Gitchegumi/multi-stream-alerts/commit/8263e0842f1c80f3df06f0b013f825020c13044c))
* **overlays:** stabilize canvas editor controls ([2bee415](https://github.com/Gitchegumi/multi-stream-alerts/commit/2bee4153bf2cea5be1b31f1285494f0e8124e719))
* **overlays:** tighten editor transform controls ([3420634](https://github.com/Gitchegumi/multi-stream-alerts/commit/3420634089307d2bf84acf665fe368f4d0241d09))
* **overlays:** version editor layout storage ([8ac0c89](https://github.com/Gitchegumi/multi-stream-alerts/commit/8ac0c897492a3fc55d6b72188f2675a29079e3ed))
* **overlays:** wire canvas assets and test preview ([e5949fe](https://github.com/Gitchegumi/multi-stream-alerts/commit/e5949fe6f64b960e77c4aacbdefcf3fac7bb7b61))
* permission issue in Dockerfile ([a8bb2e4](https://github.com/Gitchegumi/multi-stream-alerts/commit/a8bb2e4a24806d48c6d26f64bd37822835f4cd73))
* **release:** repair release metadata and container tags ([e3c2311](https://github.com/Gitchegumi/multi-stream-alerts/commit/e3c2311d6c3444f96d00041a9ec5ad7808da11a7))
* **release:** repair release please service metadata ([a019c71](https://github.com/Gitchegumi/multi-stream-alerts/commit/a019c7122d10af4875a7e39e8d8c67eb0d3719d4))
* removed corepack from precommit commands ([75b5c36](https://github.com/Gitchegumi/multi-stream-alerts/commit/75b5c3637626d62b6b87af0a65ea2b22d83754ec))
* **security:** harden asset access and docs ([3d105fa](https://github.com/Gitchegumi/multi-stream-alerts/commit/3d105fafb25262d320ab4b263a0e07b83fa5a73c))
* **security:** remove invite code random bias ([b134da2](https://github.com/Gitchegumi/multi-stream-alerts/commit/b134da2bd9d38940628f2fa9888faf008fdcc52c))
* test alerts use selected custom layout and respect layout defaults ([c5432a2](https://github.com/Gitchegumi/multi-stream-alerts/commit/c5432a2d72c83663c2f2d2ddb4dac4f9bf87b16e))
* test alerts use selected custom layout and respect layout defaults ([b7c0cea](https://github.com/Gitchegumi/multi-stream-alerts/commit/b7c0ceacdad08f9f32d7815b56bedc71347177c1)), closes [#35](https://github.com/Gitchegumi/multi-stream-alerts/issues/35)
* **test:** forward deps through POST so register unit tests use mocks instead of real Prisma client ([a4490c4](https://github.com/Gitchegumi/multi-stream-alerts/commit/a4490c43e84466393af675bda5d817d04765ad10))
* **test:** replace unexpanded glob with $(find ...) in test scripts ([50e5362](https://github.com/Gitchegumi/multi-stream-alerts/commit/50e5362ed522fea819d42f0dcde8837e07803a57))
* **tests:** call handleRegister directly instead of POST to avoid Prisma proxy instantiation in tests ([1ed9f43](https://github.com/Gitchegumi/multi-stream-alerts/commit/1ed9f43ba040365a8a224ae44cbc5446bdc19348))
* **tests:** enable credentials in register tests via setCredentialsEnabled helper ([2ea9023](https://github.com/Gitchegumi/multi-stream-alerts/commit/2ea90235f3f8284ceb68f0ca94ab70d98c342aeb))
* **typecheck:** add [@ts-ignore](https://github.com/ts-ignore) to handleRegister export for Next.js typegen validation ([28d98a7](https://github.com/Gitchegumi/multi-stream-alerts/commit/28d98a77450af67d9923eb58fae9e28566fcd6c9))
* **types:** remove deps param from POST handler to satisfy Next.js route type ([fcc6947](https://github.com/Gitchegumi/multi-stream-alerts/commit/fcc694704d2442d217b029cc78a245506718d831))
* using the correct icons for favicon ([3749f09](https://github.com/Gitchegumi/multi-stream-alerts/commit/3749f0926353203d9ce282d82a92b7f25dad08c6))
* **web:** keep dashboard nav exact ([131a51f](https://github.com/Gitchegumi/multi-stream-alerts/commit/131a51fd91b81d595c1d4cec0deca30c3f806b70))
* **web:** localize recent alert times ([8c233a7](https://github.com/Gitchegumi/multi-stream-alerts/commit/8c233a740e3ddb39349a7d6b7dc083e22aa074d9))
* **web:** localize update check time ([1e268eb](https://github.com/Gitchegumi/multi-stream-alerts/commit/1e268ebf3cd5372ea93ca7984dc2eb0eeeb53e52))
* **web:** mark [...nextauth] route as force-dynamic to prevent Prisma 7 client init at build time ([33b85dd](https://github.com/Gitchegumi/multi-stream-alerts/commit/33b85dd91521213def0c27940ffe95cffc58d715))
* **web:** prevent alerts workspace overlap ([262fc93](https://github.com/Gitchegumi/multi-stream-alerts/commit/262fc93b615866edff65a8227ca93a7617f47561))
* **web:** redirect guide link to valid docs ([1139320](https://github.com/Gitchegumi/multi-stream-alerts/commit/11393202c88f7791d39b305f22e7b1ac12e8656d))
* **web:** remove deprecated baseUrl from tsconfig ([9c9c83a](https://github.com/Gitchegumi/multi-stream-alerts/commit/9c9c83a25ebb4964992b6cd994c28daa296028e3))
* **web:** replace broken 'next lint' (removed in Next 16) with 'tsc --noEmit' ([30b4594](https://github.com/Gitchegumi/multi-stream-alerts/commit/30b4594a79785d48f832aa28faf21056e708b6a2))
* **web:** surface ?error=notice on dashboard; dedupe fieldToDbKey in form ([8170552](https://github.com/Gitchegumi/multi-stream-alerts/commit/81705529ea49494317a6878d9c40ce0e247e7f4b))
* **web:** use valid local time options ([1cc92d3](https://github.com/Gitchegumi/multi-stream-alerts/commit/1cc92d3a78b09ba72378080fb76c8d5231b8a469))
* **web:** widen alerts dashboard workspace ([376cfaa](https://github.com/Gitchegumi/multi-stream-alerts/commit/376cfaab605d908f99458ecba74a276a17f13459))

## [0.1.8](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.7...v0.1.8) (2026-06-07)


### Bug Fixes

* **database:** avoid bootstrap display key collisions ([da50dac](https://github.com/Gitchegumi/multi-stream-alerts/commit/da50dac65123346483449a2134b0889461fdb32d))
* **database:** avoid bootstrap display key collisions ([067a0a8](https://github.com/Gitchegumi/multi-stream-alerts/commit/067a0a81204e45222bc983404e8581ebd3f1d252))

## [0.1.7](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.6...v0.1.7) (2026-06-07)


### Features

* **overlays:** add canvas runtime schema editor ([c35abb5](https://github.com/Gitchegumi/multi-stream-alerts/commit/c35abb54eee8b559fcef05375c17b345e67cb9dc)), closes [#60](https://github.com/Gitchegumi/multi-stream-alerts/issues/60)
* **overlays:** make canvas editor interactive ([848e0fc](https://github.com/Gitchegumi/multi-stream-alerts/commit/848e0fc6acf37bbfe4d8317dc8fd43546f654737))


### Bug Fixes

* adjusted height restriction for .component-alert-bindings ([2511c2e](https://github.com/Gitchegumi/multi-stream-alerts/commit/2511c2e92f4a0da108a6490b93ee8ab9447c5a40))
* **overlays:** refresh canvas urls and docs ([6fb1384](https://github.com/Gitchegumi/multi-stream-alerts/commit/6fb1384a4d2a33c535089ba3a45e181b0f8aa262))
* **overlays:** repair canvas editor media controls ([4ff39c3](https://github.com/Gitchegumi/multi-stream-alerts/commit/4ff39c30c19c4057cd43c2f52fea05bc8a05607b))
* **overlays:** stabilize canvas editor controls ([2bee415](https://github.com/Gitchegumi/multi-stream-alerts/commit/2bee4153bf2cea5be1b31f1285494f0e8124e719))
* **overlays:** wire canvas assets and test preview ([e5949fe](https://github.com/Gitchegumi/multi-stream-alerts/commit/e5949fe6f64b960e77c4aacbdefcf3fac7bb7b61))

## [0.1.6](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.5...v0.1.6) (2026-06-07)


### Bug Fixes

* **web:** redirect guide link to valid docs ([1139320](https://github.com/Gitchegumi/multi-stream-alerts/commit/11393202c88f7791d39b305f22e7b1ac12e8656d))

## [0.1.5](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.4...v0.1.5) (2026-06-06)


### Features

* **web:** add recent alert feed pills ([eee76ea](https://github.com/Gitchegumi/multi-stream-alerts/commit/eee76ea5f5a124829c9ec10e267b5f6ab27da288))
* **web:** align UI with brand palette ([7790aab](https://github.com/Gitchegumi/multi-stream-alerts/commit/7790aabd05a2fdd0f73f3b70188a8dd29d830e78))
* **web:** align UI with brand palette ([1e65c59](https://github.com/Gitchegumi/multi-stream-alerts/commit/1e65c5956de67ecce737dbb3dcd360798fcef57f))
* **web:** embed guide in dashboard ([8f54619](https://github.com/Gitchegumi/multi-stream-alerts/commit/8f54619b91d11b29f171589e85aaff4d1a605c5d))
* **web:** polish branded dashboard surfaces ([fbb4645](https://github.com/Gitchegumi/multi-stream-alerts/commit/fbb464592dfcdb71586c7eb2972da3a212ea9387))


### Bug Fixes

* **web:** keep dashboard nav exact ([131a51f](https://github.com/Gitchegumi/multi-stream-alerts/commit/131a51fd91b81d595c1d4cec0deca30c3f806b70))
* **web:** localize recent alert times ([8c233a7](https://github.com/Gitchegumi/multi-stream-alerts/commit/8c233a740e3ddb39349a7d6b7dc083e22aa074d9))
* **web:** localize update check time ([1e268eb](https://github.com/Gitchegumi/multi-stream-alerts/commit/1e268ebf3cd5372ea93ca7984dc2eb0eeeb53e52))
* **web:** prevent alerts workspace overlap ([262fc93](https://github.com/Gitchegumi/multi-stream-alerts/commit/262fc93b615866edff65a8227ca93a7617f47561))
* **web:** use valid local time options ([1cc92d3](https://github.com/Gitchegumi/multi-stream-alerts/commit/1cc92d3a78b09ba72378080fb76c8d5231b8a469))
* **web:** widen alerts dashboard workspace ([376cfaa](https://github.com/Gitchegumi/multi-stream-alerts/commit/376cfaab605d908f99458ecba74a276a17f13459))

## [0.1.4](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.3...v0.1.4) (2026-06-05)


### Bug Fixes

* **overlay:** remove conflicting legacy route ([0ede83e](https://github.com/Gitchegumi/multi-stream-alerts/commit/0ede83e8fd35f0b2d8941c7568b17d71a58e1593))

## [0.1.3](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.2...v0.1.3) (2026-06-05)


### Features

* **alerts:** add canvas workspace and docs site ([431c479](https://github.com/Gitchegumi/multi-stream-alerts/commit/431c479cba765ad03ef425ec85868371581e3b96))

## [0.1.2](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.1...v0.1.2) (2026-06-05)


### Bug Fixes

* permission issue in Dockerfile ([a8bb2e4](https://github.com/Gitchegumi/multi-stream-alerts/commit/a8bb2e4a24806d48c6d26f64bd37822835f4cd73))

## [0.1.1](https://github.com/Gitchegumi/multi-stream-alerts/compare/v0.1.0...v0.1.1) (2026-06-05)


### Features

* add self-hosted alerts suite ([4f8974f](https://github.com/Gitchegumi/multi-stream-alerts/commit/4f8974fd4c06872fa6517553e2a0743a78a3df69))
* adding logo and favicon ([d8828da](https://github.com/Gitchegumi/multi-stream-alerts/commit/d8828dada60ec4306778fc40077333f3a7987237))
* **admin:** purge revoked invite codes ([37476b0](https://github.com/Gitchegumi/multi-stream-alerts/commit/37476b032ef24839718771633b601278a0866897))
* **alerts:** add alert catalog and reusable layouts ([effb657](https://github.com/Gitchegumi/multi-stream-alerts/commit/effb65725d1a0480c550756594ffc43efee14302))
* **api:** add overlay profile list and display-key rotation APIs with tests ([722dea7](https://github.com/Gitchegumi/multi-stream-alerts/commit/722dea75f14e74422aeffe71bbb88ba5d19a341b))
* **assets:** add workspace asset library ([ee2271d](https://github.com/Gitchegumi/multi-stream-alerts/commit/ee2271df4fbbf7324f88c07ebfd0d17a5fc35d0b))
* **assets:** add workspace asset library ([59bfbef](https://github.com/Gitchegumi/multi-stream-alerts/commit/59bfbefbf321e438a6d8d6344826b019b9da6862))
* **auth,ui:** email/password auth, shared nav, dedicated dashboard pages, responsive layout ([1978182](https://github.com/Gitchegumi/multi-stream-alerts/commit/19781825f7c0584753ace2c0b3bfd2d2c39a334a))
* **auth:** add external enrollment invite links ([26b80aa](https://github.com/Gitchegumi/multi-stream-alerts/commit/26b80aac87ed41577e21f7155eade8bb9275042e))
* **auth:** add invite codes and local password storage ([3c33623](https://github.com/Gitchegumi/multi-stream-alerts/commit/3c33623abc6fe7cf6e9daca949e9508f4538c911))
* **auth:** add local email/password signup with invite codes ([b085be8](https://github.com/Gitchegumi/multi-stream-alerts/commit/b085be806a80a957681ed6d1684300f70901f9fb))
* **dashboard:** pass release status to nav ([8cbca39](https://github.com/Gitchegumi/multi-stream-alerts/commit/8cbca39dbaca097aba90ab30b97dc4b5ceebb9c4))
* **dashboard:** show release and update status in nav ([884ce5b](https://github.com/Gitchegumi/multi-stream-alerts/commit/884ce5ba67df7183a3c0ddb4780ab041ec98e3cd))
* **dashboard:** surface release status in dashboard shell ([4edb8a1](https://github.com/Gitchegumi/multi-stream-alerts/commit/4edb8a1e536f5162ac979231a4168c541ef8ec79))
* **database:** AES-256-GCM secrets helper with round-trip and tamper tests ([1ae7caf](https://github.com/Gitchegumi/multi-stream-alerts/commit/1ae7cafbdbf9891aa22c8fbee9eecdadd2502f1c))
* **database:** canManageChannelCredentials — owner-or-admin only ([8dc3709](https://github.com/Gitchegumi/multi-stream-alerts/commit/8dc3709b1b249be58faa384d9b5e34d1b3ac3c43))
* **database:** integration-credentials service with encrypted read/write/clear ([a029958](https://github.com/Gitchegumi/multi-stream-alerts/commit/a029958787b52c954f0e257bcdda39e9d5e0f0a6))
* **database:** per-workspace IntegrationCredential tables ([7002e7b](https://github.com/Gitchegumi/multi-stream-alerts/commit/7002e7bd781f406fb8ce9158af60deeee4738fef))
* **ingress:** implement Twitch EventSub normalization and alert pipeline ([d48acf2](https://github.com/Gitchegumi/multi-stream-alerts/commit/d48acf2a97fbb2789e0d3522de78db026377d4d0))
* **ingress:** implement YouTube PubSub normalization and wire into webhook ([437a3a4](https://github.com/Gitchegumi/multi-stream-alerts/commit/437a3a4d0c9cafb4ab2880995bcb61e5f2254fe4))
* **ingress:** Ko-fi webhook resolves channel from URL and uses stored token ([0d35dd2](https://github.com/Gitchegumi/multi-stream-alerts/commit/0d35dd23fdab0e864c24ed8aadb139ff41228c9f))
* **ingress:** Twitch EventSub HMAC matched against every configured channel ([05f1219](https://github.com/Gitchegumi/multi-stream-alerts/commit/05f12194d97c5bfc0be8cd4cd03a3f1568221a19))
* **ingress:** YouTube webhook resolves channel from URL and uses stored credentials ([fee10d8](https://github.com/Gitchegumi/multi-stream-alerts/commit/fee10d826a1f85a9c8bbb9b900c5cb5acd38fc02))
* **overlay:** complete alert pipeline for Twitch/YouTube + display key rotation + diagnostics ([c43eff4](https://github.com/Gitchegumi/multi-stream-alerts/commit/c43eff4c29ed37c4c558c0f15d735d67acaa973c))
* **overlays:** add browser layout editor ([b914380](https://github.com/Gitchegumi/multi-stream-alerts/commit/b914380fd0dfe16be439b7440f0c3cfae352f438))
* **overlays:** add browser layout editor ([adeb9c7](https://github.com/Gitchegumi/multi-stream-alerts/commit/adeb9c7fe3b1cd9f9fa0ac6b90f8130ff05f4660))
* per-workspace platform credentials in web UI ([3a84a1c](https://github.com/Gitchegumi/multi-stream-alerts/commit/3a84a1c42feef39f41729b34e6ed039771d329ef))
* **rate-limit:** shared MemoryRateLimiter + getClientIp ([7e21eae](https://github.com/Gitchegumi/multi-stream-alerts/commit/7e21eae4eff074b5f8eb5dee617b3febb42bd6ae))
* **rate-limit:** shared MemoryRateLimiter + getClientIp, apply to stream route ([83a0e73](https://github.com/Gitchegumi/multi-stream-alerts/commit/83a0e7340a22f9a3ae926d5ec1394a215b72a39d))
* **release:** add version metadata and update status ([e68a26b](https://github.com/Gitchegumi/multi-stream-alerts/commit/e68a26ba46c9b2f69c44a86bed3ed5e37d3d0bcb))
* **shared,ingress:** require INSTANCE_ENCRYPTION_KEY; drop platform env vars ([75b7bb2](https://github.com/Gitchegumi/multi-stream-alerts/commit/75b7bb2c4d166ba28c255f5a283f1fac7710bd9d))
* **ui:** cleanup pass — shared nav, dedicated pages, responsive layout, email/password auth ([f60b4e3](https://github.com/Gitchegumi/multi-stream-alerts/commit/f60b4e3748678ed89e261ea58e30b213f98d5d95))
* **web:** add shared NavBar, DashboardShell, and responsive mobile styles ([5414f85](https://github.com/Gitchegumi/multi-stream-alerts/commit/5414f8538bc02ae6647158bf187476d5439f5050))
* **web:** per-channel integrations API (GET/PUT/DELETE) with credential authz ([d294fac](https://github.com/Gitchegumi/multi-stream-alerts/commit/d294fac1389af54419906b83fc8594bfdf329c82))
* **web:** per-channel integrations settings page with masked forms ([8159a4c](https://github.com/Gitchegumi/multi-stream-alerts/commit/8159a4caa958728b8aee3e86c16499b5ac005979))


### Bug Fixes

* add user to Dockerfile ([2b0ca78](https://github.com/Gitchegumi/multi-stream-alerts/commit/2b0ca78a097f2dccc1e6e24118feedc65b91cc10))
* added USER and HEALTHCHECK to Dockerfile ([40f64b0](https://github.com/Gitchegumi/multi-stream-alerts/commit/40f64b027aedb6487fb20c47b5be3ae2af0194f7))
* address alert suite review findings ([54e452d](https://github.com/Gitchegumi/multi-stream-alerts/commit/54e452dc278d5c4755bb66d61931530fa308182e))
* **assets:** serialize bigint fields and improve upload success/error UI ([576d2b5](https://github.com/Gitchegumi/multi-stream-alerts/commit/576d2b533bb30576bc1f5376fa55e4cdb50a440f)), closes [#36](https://github.com/Gitchegumi/multi-stream-alerts/issues/36)
* **assets:** serialize bigint fields and improve upload success/error UI ([#36](https://github.com/Gitchegumi/multi-stream-alerts/issues/36)) ([e16a521](https://github.com/Gitchegumi/multi-stream-alerts/commit/e16a521762c3534d127e95764f4919cc4ca71430))
* **auth:** address PR [#4](https://github.com/Gitchegumi/multi-stream-alerts/issues/4) review feedback ([04fd0d1](https://github.com/Gitchegumi/multi-stream-alerts/commit/04fd0d11473dec8ec99039f564dee45d62f8c4d9))
* **auth:** address PR [#7](https://github.com/Gitchegumi/multi-stream-alerts/issues/7) review feedback ([b14c2b6](https://github.com/Gitchegumi/multi-stream-alerts/commit/b14c2b612998466b0f4adc717da11c7229a7fc17))
* **auth:** correct OIDC callback URL and secure invite cookies for reverse-proxy deployments ([f2a2fb3](https://github.com/Gitchegumi/multi-stream-alerts/commit/f2a2fb34af75478d07affa83e4634ca2963dd910))
* **auth:** correct OIDC callback URL and secure invite cookies for reverse-proxy deployments ([#39](https://github.com/Gitchegumi/multi-stream-alerts/issues/39)) ([50ab3de](https://github.com/Gitchegumi/multi-stream-alerts/commit/50ab3deee34ba4a0d1f12f8f8e9a8987a9a60b95))
* **auth:** harden external enrollment invites ([0501a54](https://github.com/Gitchegumi/multi-stream-alerts/commit/0501a5452358833b41da640e4d1e83ec7ea652fd))
* **auth:** normalize OIDC issuer discovery ([fc570f4](https://github.com/Gitchegumi/multi-stream-alerts/commit/fc570f490470b13f11cfb10ccf821f073be6d0b1))
* **auth:** remove stale User.passwordHash; add LocalCredential model, gate auth by env ([6826c46](https://github.com/Gitchegumi/multi-stream-alerts/commit/6826c469d2d7d6513311678d69169f0a53aa0ea3))
* **auth:** remove stale User.passwordHash; add LocalCredential model, gate auth by env ([79159de](https://github.com/Gitchegumi/multi-stream-alerts/commit/79159deebbf004f1df9bb556738eb3e214f57ffc))
* **auth:** restore OIDC invite onboarding ([a02e1e1](https://github.com/Gitchegumi/multi-stream-alerts/commit/a02e1e11980181cc8161046cce8a8655550bbd4f))
* **auth:** restore OIDC invite onboarding ([c9e675e](https://github.com/Gitchegumi/multi-stream-alerts/commit/c9e675e33ab5fd978f9aa10b9059e2d697f4640b))
* **auth:** use utf-8 buffer for scrypt to handle unicode passwords ([dc68f9e](https://github.com/Gitchegumi/multi-stream-alerts/commit/dc68f9ec8a94c3e898365824349f435d96fa9cd7))
* **auth:** wire OIDC discovery by setting `wellKnown` ([c87ca7a](https://github.com/Gitchegumi/multi-stream-alerts/commit/c87ca7a0a374ed446900f580f4e1f11b2a54a4fd))
* **auth:** wire OIDC discovery by setting `wellKnown` ([a03d110](https://github.com/Gitchegumi/multi-stream-alerts/commit/a03d110c2498a06b73cfa26bdceae036d61570f9))
* **ci:** add DATABASE_URL env for web tests using Prisma 7 pg adapter ([cc4fd8b](https://github.com/Gitchegumi/multi-stream-alerts/commit/cc4fd8b35d37899319053b34ec280f11035034e1))
* **ci:** bump codeql-action v3→v4 and checkout v6→v4 ([84cf1d6](https://github.com/Gitchegumi/multi-stream-alerts/commit/84cf1d6f5e55491e16620e2de0706ba28813df22))
* **ci:** restore Docker image build ([8b1d084](https://github.com/Gitchegumi/multi-stream-alerts/commit/8b1d084e2f49ee8578e6c7291c55c7bad7872a82))
* configure nextauth public URL ([b6f0f5a](https://github.com/Gitchegumi/multi-stream-alerts/commit/b6f0f5a60fec0daabf1ef07c63a0122e92a24b9b))
* configure nextauth public URL ([cfcf898](https://github.com/Gitchegumi/multi-stream-alerts/commit/cfcf89874d1ab64d1b0c05ba2893cb9aaa1b7bc5))
* **database,web:** Prisma 7 driver adapter + TypeScript 6 tsconfig ([638dd27](https://github.com/Gitchegumi/multi-stream-alerts/commit/638dd273b907f351fd2587b3eaf68c43237398e6))
* **database:** clearChannelSecret treats missing secret row as a no-op ([d65a764](https://github.com/Gitchegumi/multi-stream-alerts/commit/d65a76409fa5e08b40ec9ae3687a8926ba24fbd9))
* **deps:** bump postcss to 8.5.10 to resolve CVE-2026-41305 ([272aa19](https://github.com/Gitchegumi/multi-stream-alerts/commit/272aa195e7f2da62161e2c3648c856138a44d6b1))
* **deps:** bump uuid override 11.1.0 → 11.1.1 (CVE-2026-41907) ([f68e676](https://github.com/Gitchegumi/multi-stream-alerts/commit/f68e676d010907cfee84b816dbfa4d3770b63761))
* **deps:** bump uuid to 11.1.0 to resolve CVE-2026-41907 ([ae62f92](https://github.com/Gitchegumi/multi-stream-alerts/commit/ae62f927c48bd4eaf7c4dc646fbbe727fdfedaaf))
* **deps:** bump uuid to 11.1.0 to resolve CVE-2026-41907 ([cee0967](https://github.com/Gitchegumi/multi-stream-alerts/commit/cee0967342c16e6eed02cdc0f90354b87591a73b))
* gitleaks script ([bb1f658](https://github.com/Gitchegumi/multi-stream-alerts/commit/bb1f658b5b997686748b5bdbf56a3ba0c10c2718))
* **overlays:** address editor accessibility comments ([9a6e1cd](https://github.com/Gitchegumi/multi-stream-alerts/commit/9a6e1cd407976ac246ea31dcaa22e0ffb27dc722))
* **overlays:** harden editor save and restore ([82643d6](https://github.com/Gitchegumi/multi-stream-alerts/commit/82643d692a7451740e2aed261bd82e39ff1d5820))
* **overlays:** restore editor component return ([454d1ac](https://github.com/Gitchegumi/multi-stream-alerts/commit/454d1ac01fa19878384579d15cba67a02262aa8b))
* **overlays:** sanitize editor hydration ([8263e08](https://github.com/Gitchegumi/multi-stream-alerts/commit/8263e0842f1c80f3df06f0b013f825020c13044c))
* **overlays:** tighten editor transform controls ([3420634](https://github.com/Gitchegumi/multi-stream-alerts/commit/3420634089307d2bf84acf665fe368f4d0241d09))
* **overlays:** version editor layout storage ([8ac0c89](https://github.com/Gitchegumi/multi-stream-alerts/commit/8ac0c897492a3fc55d6b72188f2675a29079e3ed))
* **release:** repair release metadata and container tags ([e3c2311](https://github.com/Gitchegumi/multi-stream-alerts/commit/e3c2311d6c3444f96d00041a9ec5ad7808da11a7))
* **release:** repair release please service metadata ([a019c71](https://github.com/Gitchegumi/multi-stream-alerts/commit/a019c7122d10af4875a7e39e8d8c67eb0d3719d4))
* removed corepack from precommit commands ([75b5c36](https://github.com/Gitchegumi/multi-stream-alerts/commit/75b5c3637626d62b6b87af0a65ea2b22d83754ec))
* **security:** harden asset access and docs ([3d105fa](https://github.com/Gitchegumi/multi-stream-alerts/commit/3d105fafb25262d320ab4b263a0e07b83fa5a73c))
* **security:** remove invite code random bias ([b134da2](https://github.com/Gitchegumi/multi-stream-alerts/commit/b134da2bd9d38940628f2fa9888faf008fdcc52c))
* test alerts use selected custom layout and respect layout defaults ([c5432a2](https://github.com/Gitchegumi/multi-stream-alerts/commit/c5432a2d72c83663c2f2d2ddb4dac4f9bf87b16e))
* test alerts use selected custom layout and respect layout defaults ([b7c0cea](https://github.com/Gitchegumi/multi-stream-alerts/commit/b7c0ceacdad08f9f32d7815b56bedc71347177c1)), closes [#35](https://github.com/Gitchegumi/multi-stream-alerts/issues/35)
* **test:** forward deps through POST so register unit tests use mocks instead of real Prisma client ([a4490c4](https://github.com/Gitchegumi/multi-stream-alerts/commit/a4490c43e84466393af675bda5d817d04765ad10))
* **test:** replace unexpanded glob with $(find ...) in test scripts ([50e5362](https://github.com/Gitchegumi/multi-stream-alerts/commit/50e5362ed522fea819d42f0dcde8837e07803a57))
* **tests:** call handleRegister directly instead of POST to avoid Prisma proxy instantiation in tests ([1ed9f43](https://github.com/Gitchegumi/multi-stream-alerts/commit/1ed9f43ba040365a8a224ae44cbc5446bdc19348))
* **tests:** enable credentials in register tests via setCredentialsEnabled helper ([2ea9023](https://github.com/Gitchegumi/multi-stream-alerts/commit/2ea90235f3f8284ceb68f0ca94ab70d98c342aeb))
* **typecheck:** add [@ts-ignore](https://github.com/ts-ignore) to handleRegister export for Next.js typegen validation ([28d98a7](https://github.com/Gitchegumi/multi-stream-alerts/commit/28d98a77450af67d9923eb58fae9e28566fcd6c9))
* **types:** remove deps param from POST handler to satisfy Next.js route type ([fcc6947](https://github.com/Gitchegumi/multi-stream-alerts/commit/fcc694704d2442d217b029cc78a245506718d831))
* using the correct icons for favicon ([3749f09](https://github.com/Gitchegumi/multi-stream-alerts/commit/3749f0926353203d9ce282d82a92b7f25dad08c6))
* **web:** mark [...nextauth] route as force-dynamic to prevent Prisma 7 client init at build time ([33b85dd](https://github.com/Gitchegumi/multi-stream-alerts/commit/33b85dd91521213def0c27940ffe95cffc58d715))
* **web:** remove deprecated baseUrl from tsconfig ([9c9c83a](https://github.com/Gitchegumi/multi-stream-alerts/commit/9c9c83a25ebb4964992b6cd994c28daa296028e3))
* **web:** replace broken 'next lint' (removed in Next 16) with 'tsc --noEmit' ([30b4594](https://github.com/Gitchegumi/multi-stream-alerts/commit/30b4594a79785d48f832aa28faf21056e708b6a2))
* **web:** surface ?error=notice on dashboard; dedupe fieldToDbKey in form ([8170552](https://github.com/Gitchegumi/multi-stream-alerts/commit/81705529ea49494317a6878d9c40ce0e247e7f4b))
