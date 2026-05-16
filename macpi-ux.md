# MacPi UX and Product Functionality Brief

MacPi is a desktop UI for the pi.dev coding agent. It wraps Pi sessions in a multi-pane Electron application with persistent channels, sessions, model/auth management, resource management for skills/extensions/prompts, notes, and global UI settings.

This document is intended as a design brief for a coding/UI agent. It describes what the app does, what screens exist, and what interaction patterns the UI should support.

---

## 1. Product concept

MacPi is a local desktop command-and-control surface for an AI coding agent.

The app should feel like a focused developer workspace rather than a generic chatbot. The primary user workflow is:

1. Choose or create a channel.
2. Choose or create an agent session in that channel.
3. Chat with the Pi coding agent in the context of a project directory.
4. Manage the agent’s capabilities via skills, extensions, prompts, models, and auth.
5. Keep lightweight notes and configuration inside the app.

The core mental model is similar to a developer chat workspace:

- **Channels** organize work areas or projects.
- **Sessions** are individual Pi agent conversations, possibly branched.
- **Resources** such as skills, extensions, and prompts define what the agent can do.
- **Settings** control appearance, defaults, and model/auth behavior.

---

## 2. App shell and navigation

The app uses a persistent left-side mode rail and swaps the main content based on the selected mode.

### Mode rail

The far-left vertical rail contains icon buttons for:

- Chat
- Skills
- Extensions
- Prompts
- Notes
- Settings, pinned at the bottom

Each icon should have a clear hover tooltip and accessible label. The selected mode should be visually distinct.

Current conceptual icons:

- Chat: speech bubble
- Skills: puzzle piece
- Extensions: flask
- Prompts: scroll
- Notes: note/pencil
- Settings: gear

The rail is narrow and persistent. It is not a full sidebar; it is a mode switcher.

### Main layout patterns

Most modes use a split-pane layout:

- left list/sidebar pane
- right detail/editor pane

Some panes are resizable and remember their width, such as channel/session sidebar and resource lists.

The app should use a desktop-like information density: compact rows, strong alignment, and minimal wasted space.

---

## 3. Chat mode

Chat is the primary mode.

### Chat layout

Chat mode is a three-part layout:

1. Mode rail on the far left.
2. Channel/session sidebar.
3. Main chat pane.

### Channel sidebar

The channel sidebar contains:

- **Channels section**
  - list of channels
  - `+` button for creating a new channel
  - selected channel highlight
  - channel row menu / context menu

- **Sessions section** for the selected channel
  - tree/forest of sessions
  - branch indentation for forked sessions
  - selected session highlight

### Channels

A channel represents an organized workspace or project area.

Channel capabilities:

- Create channel.
- Rename channel inline.
- Delete channel.
- If a channel has sessions, deletion should require confirmation / force delete.
- Channel can have a cwd/project directory.
- New sessions inherit the channel cwd.
- If no channel cwd exists, new sessions use the global default cwd.

Channel row interactions:

- Click selects the channel.
- Right-click or row menu opens actions:
  - New session
  - Rename
  - Delete

### Sessions

A session represents a Pi agent conversation.

Session capabilities:

- Create session under a channel.
- Rename session.
- Delete session.
- Select session.
- Display sessions as a tree when branches exist.
- Branch sessions should be visually nested beneath parent sessions.

### Chat pane header

The chat pane includes two breadcrumb/header regions:

- A simple breadcrumb: channel name and session name.
- A more detailed breadcrumb including:
  - channel
  - session
  - cwd/project directory
  - Pi session id label

The exact visual treatment can vary, but the user should always know:

- which channel they are in
- which session they are chatting with
- which cwd/project context the session uses

### Timeline

The chat timeline displays:

- user messages
- assistant text messages
- tool calls
- tool results / tool status
- streaming assistant deltas
- thinking / reasoning content where supported

Message design requirements:

- User and assistant roles should be visually distinct.
- Assistant messages should support markdown.
- Code blocks should use the configured monospace font and code-block size.
- Tool calls should be collapsible or visually grouped enough that they do not overwhelm the conversation.
- Tool status should distinguish pending, success, and error.
- Branching affordances should be available from messages where applicable, such as “branch here”.

### Composer

The composer is a multiline textarea.

Behavior:

- `Enter` sends the message when not streaming.
- During streaming, `Enter` queues the message as a follow-up.
- `Shift+Enter` inserts a newline.
- `Escape` clears the composer.
- Up-arrow recalls previous user messages only when the composer is empty.
- While browsing recalled history, Up moves older and Down moves newer.
- Down after the newest recalled message clears the composer.
- If the recalled text is edited, history navigation exits and arrow keys behave normally.

When the agent is not streaming:

- show a single **Send** button.

When the agent is streaming:

- show **Steer** button
  - interrupts/redirects the current agent turn
- show **Queue** button
  - queues the message to run after the current turn finishes

### Chat banners and transient states

The chat pane can show banners above the composer:

- **Error banner**
  - auth/model/transient/unknown error states
  - model/auth errors should offer an action to open settings

- **Tools/resources changed banner**
  - appears when skills/extensions/prompts change while a session is open
  - offers **Reload session** so the session picks up new tools/resources

- **Retry banner**
  - shows retry attempt state when provider/API failures trigger retry behavior

- **Compaction banner**
  - shows manual/threshold/overflow compaction state and last compaction result

- **Queue pills**
  - show queued steering/follow-up messages
  - allow clearing queues and removing individual queued messages

---

## 4. Skills mode

Skills mode manages Pi skills available to sessions.

A skill is an instruction bundle or capability guide that can be loaded into the agent.

### Layout

Skills mode uses:

- left resizable skills list
- right skill detail/editor pane

### Skills list

The skills list includes:

- title/header: Skills
- toolbar buttons:
  - `+ Install…`
  - `Import from ~/.pi`
- rows with:
  - enabled checkbox
  - skill name
  - friendly source label when source differs from name
  - tooltip with full source
- loading, empty, and error states

### Skill detail

When no skill is selected:

- show empty state: “Select a skill on the left to view or edit it.”

When a skill is selected:

- show header with:
  - skill name
  - source
  - relative path
- show markdown code editor for skill body
- show unsaved indicator when dirty
- save button

### Skill interactions

- Toggle enabled/disabled.
- Install a skill from a package/source string.
- Import skills from the user’s existing `~/.pi` installation.
- Edit skill markdown body.
- Save edited skill.

Enabled/disabled state affects future/reloaded sessions. Existing sessions need reload to pick up resource changes.

---

## 5. Extensions mode

Extensions mode manages Pi extensions.

Extensions are TypeScript/JavaScript modules that can register tools, commands, event handlers, and other runtime behavior.

### Layout

Extensions mode mirrors Skills mode:

- left resizable extensions list
- right extension detail/editor pane

### Extensions list

The extensions list includes:

- title/header: Extensions
- toolbar buttons:
  - `+ Install…`
  - `Import from ~/.pi`
- rows with:
  - enabled checkbox
  - extension name
  - friendly source label
  - tooltip with full source
- inline load errors, displayed prominently with warning styling
- empty/loading states

### Extension detail

The extension detail pane should allow:

- viewing extension metadata/source
- editing extension TypeScript/JavaScript code
- linting/checking diagnostics where available
- saving edited extension code

### Extension interactions

- Toggle enabled/disabled.
- Install extension package/source.
- Import extension package/source from existing Pi configuration.
- View load errors.
- Edit and save extension source.

Changing extensions should trigger the tools/resources changed banner for active chat sessions.

---

## 6. Prompts mode

Prompts mode manages slash-command prompt templates.

A prompt template is a reusable command-like prompt that can be invoked by the agent/user.

### Layout

Prompts mode mirrors Skills/Extensions:

- left resizable prompt list
- right prompt detail/editor pane

### Prompt list

Prompt list includes:

- title/header: Prompts
- toolbar:
  - `+ Install…`
  - `Import from ~/.pi`
- rows with:
  - enabled checkbox
  - prompt name
  - friendly source label
- loading/error/empty states

### Prompt detail

Prompt detail should support:

- prompt name / manifest metadata
- description
- argument hint
- body/content editor
- save button
- dirty state

### Prompt interactions

- Toggle enabled/disabled.
- Install prompt package/source.
- Import prompt templates from `~/.pi`.
- Edit prompt body/metadata.
- Save changes.

Changing prompts should trigger session reload affordances where needed.

---

## 7. Notes mode

Notes mode provides quick local notes stored in MacPi’s notes storage, currently backed by `~/.macpi/NOTES.md`.

### Layout

Notes mode uses:

- left resizable notes list
- right note editor
- delete confirmation dialog

### Notes list

The notes list should support:

- view all notes
- create new note
- select note
- request delete note

### Note editor

The editor should support:

- editing note title/body/blob
- saving note content
- handling stale-write conflicts if the underlying file changed
- empty state when no note is selected

### Delete flow

Deleting a note should show confirmation:

- title: delete this note?
- body explains it will be removed from `NOTES.md`
- destructive confirm button

---

## 8. Global Settings

Settings are opened from the gear icon at the bottom of the mode rail.

The settings dialog uses:

- left category sidebar
- right category content
- close button/footer
- Escape or outside click closes the modal

Current settings categories:

1. Theme
2. Font
3. Defaults
4. Models & Auth

The dialog should be large enough for two-pane settings pages such as Models & Auth.

---

## 9. Theme settings

Theme settings control color personality and light/dark mode.

### Theme family

Available theme families:

- Slate
- Sunrise
- Meadow
- Catppuccin

Each theme family has:

- label
- emoji
- tagline
- display font identity
- light swatches
- dark swatches
- active state

### Theme mode

Available modes:

- Auto — follow operating system
- Light — always light
- Dark — always dark

### Theme design language

The app uses semantic CSS variables and utility classes rather than hardcoded component colors.

Important semantic colors:

- app background
- panel background
- row/selected-row background
- rail background
- primary text
- muted text
- faint text
- divider
- accent
- accent foreground
- scrollbar track/thumb/hover

Visual design should preserve the personality of each theme while using the same layout/component structure.

---

## 10. Font settings

Font settings control UI fonts and per-region font sizes.

### Font family controls

There are two font family controls:

- UI font family
- Monospace font family

Each control provides:

- curated dropdown options
- custom text input for arbitrary CSS font-family values

### Font size controls

Font size sliders exist for:

- Sidebar
- Chat — assistant text
- Chat — user message
- Composer input
- Code blocks

Sliders use pixel values, currently from 8px to 32px.

---

## 11. Defaults settings

Defaults configure workspace paths and app storage behavior.

### Default cwd

Controls the default working directory.

Behavior:

- New channels with no cwd inherit this default.
- Sessions inherit their channel cwd at creation time.
- User can type a path or browse for a folder.

### Resource root

Controls where MacPi stores its skills, prompts, and extensions.

Default behavior:

- MacPi uses an isolated resource root, usually under `~/.macpi`, rather than directly using `~/.pi`.

Changing resource root affects new/reloaded resource discovery and future sessions.

### Logs

Settings includes a button to open the logs folder.

---

## 12. Models & Auth settings

Models & Auth configures where MacPi sends messages and how providers are authenticated.

This is a major settings screen and should be treated as a first-class product area.

### Overall layout

The Models & Auth screen uses a two-pane provider browser layout.

Header:

- title: Models & Auth
- subtitle: “Configure where MacPi sends your messages.”
- actions:
  - Advanced
  - Import from pi…

Body:

- left provider browser
- right provider detail/auth/model list

Footer:

- active model summary, e.g. `Active: anthropic / claude-sonnet-4-5`
- validation error if selected model no longer exists

### Provider browser

The provider browser includes:

- search input: “Search providers…”
- filter pills:
  - All
  - Configured
  - Cloud
  - Local
- Add local OpenAI-compatible provider row
- provider list rows

Provider rows show:

- initials/avatar badge
- provider display name
- provider id
- provider kind: cloud/local
- model count
- configured status dot
- selected state

### Provider filters

- **All**: all known providers
- **Configured**: providers with configured auth
- **Cloud**: built-in MacPi/Pi providers
- **Local**: local OpenAI-compatible providers such as Ollama, LM Studio, vLLM, or local proxies

### Provider detail

The right pane shows details for selected provider:

- provider badge
- provider name
- configured/not configured pill
- provider id
- provider kind
- description/help text
- authentication section
- models section

### Authentication section

For OAuth providers:

- explain that the user should sign in with the relevant account
- show sign-in button
- sign-in opens OAuth login dialog/flow

For API-key providers:

- explain that the API key is stored securely in MacPi auth storage
- Add / replace API key button
- inline password input while editing
- Save/Cancel actions
- Remove auth action when configured

### Local OpenAI-compatible providers

Local provider flow supports OpenAI-compatible APIs only.

User enters:

- display name
- provider id, conventionally starting with `local-`
- base URL, e.g. `http://localhost:11434/v1`
- API key, e.g. `ollama` for servers that ignore it

Flow:

1. User enters provider details.
2. User clicks **Fetch models**.
3. MacPi calls `GET {baseUrl}/models` with optional bearer auth.
4. Returned model ids/names are listed.
5. User selects a model.
6. User clicks **Save provider and set default**.
7. MacPi saves provider config to `models.json`.
8. MacPi stores the API key in auth storage.
9. MacPi sets the selected model to the chosen local model.

Local provider model list should clearly show selected model and model ids.

### Model list

Provider detail model list shows:

- selected/default check mark
- model display name
- model id
- tags such as reasoning/flagship/fast where available
- context window, e.g. `256K`
- action/status text:
  - Set default
  - Configure auth first

Disabled/unavailable models should be visible but not selectable until auth is configured.

### Advanced models.json

The Advanced action opens a modal/dialog with the raw `models.json` editor.

This editor is for power users and should not dominate the primary model/provider workflow.

The raw editor should:

- read the current file
- validate strict JSON before writing
- show registry/load errors
- save edited JSON

### Import from pi

The Import from pi action opens a modal/dialog for importing auth/model files from an existing Pi installation.

It can import:

- `auth.json`
- `models.json`

It shows source and destination paths, lets the user choose what to import, and warns/requires confirmation before replacing existing MacPi files.

---

## 13. OAuth login flow

OAuth login can emit interactive events:

- auth URL
- device code
- prompt requiring user input
- select prompt
- progress message
- success
- error
- cancelled

UI should display OAuth flow in a modal/dialog.

The dialog should support:

- opening auth URL externally
- showing progress
- handling text prompt input
- handling selection prompts
- cancelling login
- showing success/error

Renderer must never expose secrets directly.

---

## 14. Install and import dialogs

Skills, extensions, and prompts use similar install/import dialogs.

### Install dialog

Used for resourceKind:

- skill
- extension
- prompt

The user enters a source string/package reference.

Examples:

- npm package
- git package
- local path

The dialog triggers Pi package manager install/import behavior.

### Import from Pi dialog

Used for importing existing Pi resources from `~/.pi` into MacPi’s resource root.

For skills/prompts:

- list top-level Pi files/resources
- mark already imported
- allow selecting resources to import

For extensions:

- list configured Pi package sources
- mark already imported
- import selected source strings into MacPi package settings

---

## 15. Code/editor components

Several screens use an embedded code editor:

- skill detail markdown editor
- prompt detail editor
- extension source editor
- raw models.json editor
- notes editor may use plain or code-like editing depending design

Editor requirements:

- support markdown and TypeScript/JavaScript modes where appropriate
- respect monospace font setting
- show diagnostics where available
- provide save affordance and dirty state
- stay visually integrated with current theme

---

## 16. Theming and visual style

MacPi should look like a polished developer desktop app.

General design direction:

- compact but readable
- theme-aware
- low-friction
- clear selected states
- subtle dividers
- strong pane boundaries
- semantic color usage
- minimal hardcoded colors

### Theme families

#### Slate

Neutral, cool, practical. Default desktop-app feel. System fonts. Best for focused coding and low-distraction work.

#### Sunrise

Warm citrus/coral palette. Friendly and editorial. Fraunces display serif plus Plus Jakarta Sans body.

#### Meadow

Fresh garden palette. Verdant, energetic, more expressive. Gloock display serif plus Manrope body.

#### Catppuccin

Soft pastel developer theme using Catppuccin Latte/Mocha palette. Inter body/display and JetBrains Mono.

### Semantic styling rules

Components should use semantic tokens/classes:

- `surface-app`
- `surface-panel`
- `surface-row`
- `surface-rail`
- `text-primary`
- `text-muted`
- `text-faint`
- `border-divider`

Do not hardcode colors unless absolutely necessary. If a new color role is needed, add a semantic token.

### Scrollbars

Scrollbars are theme-aware:

- track uses theme surface token
- thumb uses row/faint token
- hover uses muted/faint token

Avoid browser-default white/blue scrollbars.

---

## 17. Persistence and local files

MacPi stores its own state separately from normal Pi by default.

Important storage concepts:

- app settings in local app database/settings storage
- MacPi resource root, normally under `~/.macpi`
- auth at MacPi auth path
- models at MacPi models path
- notes in MacPi notes storage / `NOTES.md`
- Pi sessions in Pi session files

UI should help users understand when something is MacPi-specific versus imported from existing Pi.

---

## 18. Error handling and empty states

The app should treat errors as actionable UI, not raw crashes.

Common states:

- loading
- empty list
- load error
- auth required
- model missing
- provider unavailable
- stale note conflict
- resource load error
- import conflict
- invalid JSON

Error UI should:

- state what went wrong
- show the relevant message
- offer a next action when possible

Examples:

- missing selected model → open Models & Auth settings
- resource changed → reload session
- destination file exists during import → require replace confirmation
- invalid models.json → keep editor open and show parse error

---

## 19. Accessibility and keyboard behavior

Expected accessibility behaviors:

- buttons have labels/tooltips where icon-only
- dialogs have roles/labels
- Escape closes modals/dialogs where appropriate
- selected page/mode should be conveyed visually and semantically
- keyboard input should not hijack normal text editing unexpectedly

Important composer keyboard behavior:

- Enter submits
- Shift+Enter newline
- Escape clears composer
- Up history only when empty
- arrows otherwise behave normally for multiline text

---

## 20. Design priorities for a UI redesign agent

If redesigning the UI, prioritize:

1. Preserve the three-pane productivity workflow.
2. Preserve compact developer-app density.
3. Make model/auth setup much clearer and more guided.
4. Keep skills/extensions/prompts as resource-management workspaces.
5. Make reload/session state obvious after resource changes.
6. Keep all colors theme-aware.
7. Preserve power-user affordances such as raw models.json editing, but keep them behind Advanced UI.
8. Make errors actionable.
9. Avoid modal overload except for install/import/auth flows.
10. Treat MacPi as a local app for serious coding work, not a playful generic chat client.
