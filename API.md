# platform/ API 形狀參考

> ⚠️ **這份檔案是產生出來的，不要手改。**
> 來源是 `tools/api-surface/surface.json`，而那份基準由 `platform/` 的原始碼
> 推導、由 `api-surface` 閘門守著。改法：
>
> ```bash
> node tools/api-surface/src/cli.ts --update
> ```
>
> ⚠️ **這是形狀參考，不是使用說明。**
> 它回答「有哪些 export、prop 叫什麼、型別是什麼」。
> 它**不**回答「為什麼這樣設計、怎麼接線」—— 那些寫在原始碼的檔頭註解裡
> （元件在 `platform/ui/src/components/*.vue`），而且比這裡詳細得多。
> 要動手做一個畫面，先讀 `HANDOFF.md`〈從這裡到第一個能操作的畫面〉。

## `@org/bff-contract`

### `API_PREFIX` — value

```
"/api"
```

### `BffEndpoints` — type

```
adminProbe: string
login: string
logout: string
probe: string
session: string
```

### `CONTRACT_ITEMS` — value

```
readonly { readonly id: string; readonly requirement: string; }[]
```

### `CookieAttributes` — type

```
[index string] readonly: string
```

### `CSRF_COOKIE` — value

```
"XSRF-TOKEN"
```

### `CSRF_COOKIE_FORBIDDEN_ATTRIBUTES` — value

```
readonly ["HttpOnly"]
```

### `CSRF_HEADER` — value

```
"X-XSRF-TOKEN"
```

### `DEFAULT_ENDPOINTS` — value

```
BffEndpoints
```

### `DEFAULT_SESSION_COOKIE` — value

```
"org_session"
```

### `describeContract` — function

```
() => string
```

### `endpointsFromEnv` — function

```
(env: Record<string, string | undefined>) => BffEndpoints
```

### `findSetCookie` — function

```
(headers: readonly string[], name: string) => ParsedSetCookie | undefined
```

### `isCleared` — function

```
(cookie: ParsedSetCookie) => boolean
```

### `ParsedSetCookie` — type

```
attributes: CookieAttributes
name: string
value: string
```

### `parseSetCookie` — function

```
(raw: string) => ParsedSetCookie
```

### `SAFE_METHODS` — value

```
readonly string[]
```

### `SESSION_COOKIE_ALLOWED_SAMESITE` — value

```
readonly ["Lax", "Strict"]
```

### `SESSION_COOKIE_REQUIRED_ATTRIBUTES` — value

```
readonly ["HttpOnly", "Secure"]
```

### `SESSION_COOKIE_REQUIRED_PATH` — value

```
"/"
```

---

## `@org/bff-mock`

### `BffMockOptions` — type

```
allowInProduction?: boolean | undefined
extraPermissions?: readonly string[] | undefined
routes?: readonly BffMockRoute[] | undefined
sessionCookie?: string | undefined
```

### `BffMockReply` — type

```
body?: unknown
status?: number | undefined
```

### `BffMockRequest` — type

```
body: unknown
params: Readonly<Record<string, string>>
permissions: readonly string[]
query: URLSearchParams
```

### `BffMockRoute` — type

```
handle: (request: BffMockRequest) => BffMockReply | Promise<BffMockReply>
method?: string | undefined
path: string
```

### `createBffMock` — function

```
(options?: BffMockOptions) => Server<typeof IncomingMessage, typeof ServerResponse>
```

### `RunningBffMock` — type

```
close: () => Promise<void>
origin: string
```

### `startBffMock` — function

```
(port?: number, options?: BffMockOptions | undefined) => Promise<RunningBffMock>
```

---

## `@org/config`

### `AppConfig` — type

```
apiBasePath: string
appTitle: string
buildSha: string
```

### `assertNoUndeclaredEnv` — function

```
(env: Record<string, string>) => void
```

### `config` — object

```
apiBasePath: string
appTitle: string
buildSha: string
```

---

## `@org/eslint-config`

### `default` — names-only

```

```

---

## `@org/http-client`

### `ForbiddenError` — class

```
body: unknown
cause?: unknown
message: string
name: "ForbiddenError"
new (status: number, url: string, body: unknown): ForbiddenError
stack?: string | undefined
status: number
url: string
```

### `http` — object

```
delete: <T>(path: string, options?: RequestOptions | undefined) => Promise<T>
get: <T>(path: string, options?: RequestOptions | undefined) => Promise<T>
patch: <T>(path: string, json?: unknown, options?: RequestOptions | undefined) => Promise<T>
post: <T>(path: string, json?: unknown, options?: RequestOptions | undefined) => Promise<T>
put: <T>(path: string, json?: unknown, options?: RequestOptions | undefined) => Promise<T>
```

### `HttpError` — class

```
body: unknown
cause?: unknown
message: string
name: string
new (status: number, url: string, body: unknown): HttpError
stack?: string | undefined
status: number
url: string
```

### `RequestOptions` — type

```
cache?: RequestCache | undefined
headers?: HeadersInit | undefined
integrity?: string | undefined
json?: unknown
keepalive?: boolean | undefined
method?: string | undefined
mode?: RequestMode | undefined
priority?: RequestPriority | undefined
redirect?: RequestRedirect | undefined
referrer?: string | undefined
referrerPolicy?: ReferrerPolicy | undefined
signal?: AbortSignal | undefined
window?: null | undefined
```

### `UnauthenticatedError` — class

```
body: unknown
cause?: unknown
message: string
name: "UnauthenticatedError"
new (status: number, url: string, body: unknown): UnauthenticatedError
stack?: string | undefined
status: number
url: string
```

---

## `@org/pii`

### `isMasked` — function

```
(value: string) => boolean
```

### `MASK_CHARACTER` — value

```
"○"
```

### `maskAll` — function

```
(value: string) => string
```

### `maskEmail` — function

```
(value: string) => string
```

### `maskName` — function

```
(value: string) => string
```

### `maskNationalId` — function

```
(value: string) => string
```

### `maskPhone` — function

```
(value: string) => string
```

---

## `@org/security-headers`

### `assertStaticCspCompatible` — function

```
() => { name: string; apply: "build"; writeBundle(options: unknown, bundle: Record<string, OutputAssetLike>): void; }
```

### `BASE_DIRECTIVES` — value

```
CspDirectives
```

### `buildCsp` — function

```
(options?: CspOptions) => string
```

### `buildSecurityHeaders` — function

```
(options: SecurityHeaderOptions) => Readonly<Record<string, string>>
```

### `CspDirectives` — type

```
[index string] readonly: readonly string[]
```

### `CspOptions` — type

```
nonce?: string | undefined
reportUri?: string | undefined
```

### `DevServerLike` — type

```
middlewares: { use(handler: (req: unknown, res: ResponseLike, next: () => void) => void): void; }
```

### `findStaticCspViolations` — function

```
(html: string) => StaticCspViolation[]
```

### `FORBIDDEN_VALUES` — value

```
readonly ["'unsafe-eval'", "'unsafe-hashes'", "*"]
```

### `formatStaticCspViolations` — function

```
(fileName: string, violations: readonly StaticCspViolation[]) => string
```

### `OTHER_SECURITY_HEADERS` — value

```
Readonly<Record<string, string>>
```

### `OutputAssetLike` — type

```
fileName?: string | undefined
source?: unknown
type?: string | undefined
```

### `ResponseLike` — type

```
setHeader: (name: string, value: string) => void
```

### `SecurityHeaderOptions` — type

```
hstsMaxAge?: number | undefined
nonce?: string | undefined
reportOnly: boolean
reportUri?: string | undefined
```

### `securityHeaders` — function

```
(options?: SecurityHeadersPluginOptions) => { name: string; apply: "serve"; configureServer(server: DevServerLike): void; }
```

### `SecurityHeadersPluginOptions` — type

```
reportOnly?: boolean | undefined
reportUri?: string | undefined
```

### `StaticCspViolation` — type

```
excerpt: string
kind: string
reason: string
```

### `UNSAFE_INLINE_ALLOWED_IN` — value

```
readonly ["style-src-attr"]
```

---

## `@org/slice-kit`

### `defineFeature` — function

```
(feature: Feature) => Feature
```

### `Feature` — type

```
i18n: Readonly<Record<string, Record<string, unknown>>>
menu: readonly FeatureMenuItem[]
name: string
permissions: readonly string[]
routes: readonly RouteRecordRaw[]
```

### `FeatureMenuItem` — type

```
icon?: string | undefined
labelKey: string
order?: number | undefined
permissions?: readonly string[] | undefined
routeName: string
```

### `RegisteredFeatures` — type

```
menu: readonly FeatureMenuItem[]
messages: Readonly<Record<string, Record<string, unknown>>>
names: readonly string[]
permissions: readonly string[]
routes: readonly RouteRecordRaw[]
```

### `registerFeatures` — function

```
(features: readonly Feature[]) => RegisteredFeatures
```

---

## `@org/slice-kit/contract`

### `ALLOWED_VERSION_PROTOCOLS` — value

```
readonly ["workspace:", "catalog:"]
```

### `BANNED_DIRECT_DEPENDENCIES` — value

```
readonly ["axios", "ky", "got", "superagent", "node-fetch"]
```

### `composableFunctionName` — function

```
(fileName: string) => string
```

### `COMPOSABLES_DIR` — value

```
"src/composables"
```

### `CSP_INCOMPATIBLE_MODULES` — value

```
readonly [{ readonly specifier: "reka-ui"; readonly names: readonly ["SplitterGroup", "SplitterPanel", "SplitterResizeHandle"]; readonly reason: string; }]
```

### `DESIGN_SYSTEM_PACKAGE` — value

```
"@org/ui"
```

### `IMPORT_SPECIFIER_PATTERN` — value

```
RegExp
```

### `isTypeOnlyImportAt` — function

```
(source: string, matchIndex: number) => boolean
```

### `isValidComposableFile` — function

```
(fileName: string) => boolean
```

### `isValidSliceDir` — function

```
(dir: string) => boolean
```

### `LAYERS` — object

```
apps: "apps"
features: "features"
platform: "platform"
tools: "tools"
```

### `REQUIRE_CATALOG_PROTOCOL` — value

```
true
```

### `REQUIRE_CODEOWNERS_ENTRY` — value

```
true
```

### `REQUIRED_FILES` — value

```
readonly ["package.json", "tsconfig.json", "README.md", "src/index.ts"]
```

### `RUNTIME_TEMPLATE_FORBIDDEN` — value

```
true
```

### `SLICE_DESIGN_SYSTEM_IMPORTS` — value

```
readonly ["reka-ui", "clsx", "tailwind-merge"]
```

### `SLICE_PACKAGE_PREFIX` — value

```
"@org/feature-"
```

### `slicePackageName` — function

```
(dir: string) => string
```

### `SOURCE_EXTENSIONS` — value

```
readonly [".ts", ".tsx", ".js", ".mjs", ".vue"]
```

### `SPECS_DIR` — value

```
"specs"
```

### `STEPS_GLOB` — value

```
"tests/specs/**/*.spec.ts"
```

### `STORE_FILE` — value

```
"src/store.ts"
```

### `STORE_FORBIDDEN_IMPORTS` — value

```
readonly ["@tanstack/vue-query", "@org/http-client"]
```

### `STORE_FORBIDDEN_LOCAL_MODULES` — value

```
readonly ["api"]
```

### `TEST_GLOB` — value

```
"tests/**/*.test.ts"
```

### `TODO_TAG` — value

```
"待辦"
```

### `USECASE_COVERAGE_GLOB` — value

```
"src/usecases/**"
```

### `USECASE_COVERAGE_MIN` — value

```
100
```

### `USECASE_FORBIDDEN_IMPORTS` — value

```
readonly ["vue", "pinia", "vue-router", "vue-i18n", "@tanstack/vue-query"]
```

### `USECASES_DIR` — value

```
"src/usecases"
```

### `usesDesignSystem` — function

```
(source: string) => boolean
```

### `VIEW_FORBIDDEN_IMPORTS` — value

```
readonly ["@tanstack/vue-query", "@org/http-client"]
```

### `VIEW_FORBIDDEN_LOCAL_MODULES` — value

```
readonly ["api"]
```

### `VIEWS_DIR` — value

```
"src/views"
```

---

## `@org/ui`

### `cn` — function

```
(...inputs: ClassValue[]) => string
```

### `createUiTheme` — function

```
(override: UiThemeOverride) => Plugin
```

### `UiAlert` — component

```
[slot default]: (): VNode[]
tone?: "info" | "success" | "danger"
```

### `UiAlertDialog` — component

```
[emit confirm]: []
[emit update:open]: void
[slot default]: (): VNode[]
cancelLabel?: string
confirmLabel: string
confirmVariant?: "primary" | "danger"
description: string
open?: boolean
title: string
```

### `UiAlertDialogSlot` — type

```
"actions" | "content" | "description" | "overlay" | "title"
```

### `UiAlertSlot` — type

```
"alert" | "danger" | "info" | "success"
```

### `UiBadge` — component

```
[slot default]: (): VNode[]
tone?: "neutral" | "accent" | "danger"
```

### `UiBadgeSlot` — type

```
"accent" | "badge" | "danger" | "neutral"
```

### `UiButton` — component

```
[slot default]: (): VNode[]
disabled?: boolean
size?: "sm" | "md"
type?: "button" | "submit" | "reset"
variant?: "primary" | "secondary" | "danger" | "ghost"
```

### `UiButtonSlot` — type

```
"danger" | "ghost" | "md" | "primary" | "secondary" | "sm"
```

### `UiCheckbox` — component

```
[emit update:modelValue]: void
[slot default]: (): VNode[]
label?: string
modelValue?: boolean
```

### `UiCheckboxSlot` — type

```
"indicator" | "label" | "root"
```

### `UiDatePicker` — component

```
[emit update:modelValue]: void
invalid?: boolean
locale?: string
modelValue?: DateValue | undefined
```

### `UiDatePickerSlot` — type

```
"content" | "day" | "field" | "headCell" | "heading" | "nav" | "segment" | "trigger"
```

### `UiDialog` — component

```
[emit update:open]: void
[slot close]: (): VNode[]
[slot default]: (): VNode[]
[slot footer]: (): VNode[]
description: string
open?: boolean
title: string
```

### `UiDialogSlot` — type

```
"content" | "description" | "overlay" | "title"
```

### `UiDropdownMenu` — component

```
[emit select]: [value: string]
[emit update:open]: void
align?: "start" | "end"
items: readonly { value: string; label: string; disabled?: boolean; variant?: "default" | "danger"; }[]
label: string
open?: boolean
```

### `UiDropdownMenuSlot` — type

```
"content" | "danger" | "icon" | "item" | "trigger"
```

### `UiField` — component

```
[slot default]: (props: { control: Readonly<Record<string, string | true | undefined>> }): VNode[]
description?: string
error?: string
label: string
```

### `UiFieldSlot` — type

```
"description" | "error" | "field"
```

### `UiInput` — component

```
[emit update:modelValue]: void
modelValue?: string | number
```

### `UiInputSlot` — type

```
"input"
```

### `UiLabel` — component

```
[slot default]: (): VNode[]
for: string
```

### `UiLabelSlot` — type

```
"label"
```

### `UiPagination` — component

```
[emit update:modelValue]: void
modelValue?: number
perPage: number
total: number
```

### `UiPaginationSlot` — type

```
"ellipsis" | "item" | "list" | "nav"
```

### `UiRadioGroup` — component

```
[emit update:modelValue]: void
[slot default]: (): VNode[]
modelValue?: string
```

### `UiRadioGroupSlot` — type

```
"group"
```

### `UiRadioItem` — component

```
[slot default]: (): VNode[]
label?: string
value: string
```

### `UiRadioItemSlot` — type

```
"indicator" | "item" | "label"
```

### `UiSelect` — component

```
[emit update:modelValue]: void
items: readonly { value: string; label: string }[]
modelValue?: string
placeholder: string
```

### `UiSelectSlot` — type

```
"chevron" | "content" | "indicator" | "item" | "trigger"
```

### `UiSeparator` — component

```
orientation?: "horizontal" | "vertical"
semantic?: boolean
```

### `UiSeparatorSlot` — type

```
"separator"
```

### `UiSize` — type

```
"md" | "sm"
```

### `UiSkeleton` — component

```

```

### `UiSkeletonSlot` — type

```
"skeleton"
```

### `UiSwitch` — component

```
[emit update:modelValue]: void
modelValue?: boolean
```

### `UiSwitchSlot` — type

```
"root" | "thumb"
```

### `UiTable` — component

```
[slot default]: (): VNode[]
```

### `UiTableBody` — component

```
[slot default]: (): VNode[]
```

### `UiTableBodySlot` — type

```
"body"
```

### `UiTableCell` — component

```
[slot default]: (): VNode[]
numeric?: boolean
```

### `UiTableCellSlot` — type

```
"cell" | "numeric"
```

### `UiTableHead` — component

```
[slot default]: (): VNode[]
```

### `UiTableHeadCell` — component

```
[slot default]: (): VNode[]
scope?: "col" | "row"
```

### `UiTableHeadCellSlot` — type

```
"cell"
```

### `UiTableHeadSlot` — type

```
"head"
```

### `UiTableRow` — component

```
[slot default]: (): VNode[]
```

### `UiTableRowSlot` — type

```
"row"
```

### `UiTableSlot` — type

```
"scroller" | "table"
```

### `UiTabs` — component

```
[emit update:modelValue]: void
[slot default]: (): VNode[]
items: readonly { value: string; label: string }[]
modelValue?: string
```

### `UiTabsPanel` — component

```
[slot default]: (): VNode[]
value: string
```

### `UiTabsPanelSlot` — type

```
"panel"
```

### `UiTabsSlot` — type

```
"list" | "trigger"
```

### `UiTextarea` — component

```
[emit update:modelValue]: void
modelValue?: string
```

### `UiTextareaSlot` — type

```
"textarea"
```

### `UiThemeOverride` — type

```
UiAlert?: Readonly<Partial<Record<UiAlertSlot, string>>> | undefined
UiAlertDialog?: Readonly<Partial<Record<UiAlertDialogSlot, string>>> | undefined
UiBadge?: Readonly<Partial<Record<UiBadgeSlot, string>>> | undefined
UiButton?: Readonly<Partial<Record<UiButtonSlot, string>>> | undefined
UiCheckbox?: Readonly<Partial<Record<UiCheckboxSlot, string>>> | undefined
UiDatePicker?: Readonly<Partial<Record<UiDatePickerSlot, string>>> | undefined
UiDialog?: Readonly<Partial<Record<UiDialogSlot, string>>> | undefined
UiDropdownMenu?: Readonly<Partial<Record<UiDropdownMenuSlot, string>>> | undefined
UiField?: Readonly<Partial<Record<UiFieldSlot, string>>> | undefined
UiInput?: Readonly<Partial<Record<"input", string>>> | undefined
UiLabel?: Readonly<Partial<Record<"label", string>>> | undefined
UiPagination?: Readonly<Partial<Record<UiPaginationSlot, string>>> | undefined
UiRadioGroup?: Readonly<Partial<Record<"group", string>>> | undefined
UiRadioItem?: Readonly<Partial<Record<UiRadioItemSlot, string>>> | undefined
UiSelect?: Readonly<Partial<Record<UiSelectSlot, string>>> | undefined
UiSeparator?: Readonly<Partial<Record<"separator", string>>> | undefined
UiSkeleton?: Readonly<Partial<Record<"skeleton", string>>> | undefined
UiSwitch?: Readonly<Partial<Record<UiSwitchSlot, string>>> | undefined
UiTable?: Readonly<Partial<Record<UiTableSlot, string>>> | undefined
UiTableBody?: Readonly<Partial<Record<"body", string>>> | undefined
UiTableCell?: Readonly<Partial<Record<UiTableCellSlot, string>>> | undefined
UiTableHead?: Readonly<Partial<Record<"head", string>>> | undefined
UiTableHeadCell?: Readonly<Partial<Record<"cell", string>>> | undefined
UiTableRow?: Readonly<Partial<Record<"row", string>>> | undefined
UiTabs?: Readonly<Partial<Record<UiTabsSlot, string>>> | undefined
UiTabsPanel?: Readonly<Partial<Record<"panel", string>>> | undefined
UiTextarea?: Readonly<Partial<Record<"textarea", string>>> | undefined
```

### `UiVariant` — type

```
"danger" | "ghost" | "primary" | "secondary"
```
