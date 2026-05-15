# Interaction Patterns

## Click/tap action pulse

The diagonal sweep (`action-pulse`) is a confirmation that an operational action was triggered. It is intended for controls that execute work, such as saving, updating, printing, creating, deleting, recovering drafts or applying calculated values.

Use it for:

- `.primary` action buttons and links.
- `.secondary` action buttons and links.
- Submit buttons, including login and save/create forms.
- Destructive buttons, using the existing danger variant.

Do not use it for:

- Theme toggle: it already triggers the global light/dark transition and has its own local sweep during the theme transition.
- Bottom navigation (`nav-item`): it represents screen navigation and active state, and already has `nav-pulse`.
- Wizard steps: they are progress/status selectors, not primary actions.
- Equipment photos: they are media openers and should keep the photo affordance.
- Collapsible summaries, inputs, selects or checkboxes.
- Disabled controls.

Why this separation exists:

- Action pulse confirms an operation was requested.
- Theme transition communicates a global visual mode change.
- Navigation pulse communicates screen movement and active state.
- Keeping those effects separate avoids double animations and makes mobile tap feedback clearer.

Accessibility:

- The pulse is skipped when `prefers-reduced-motion: reduce` is active.

Legibility:

- Button pulse layers must stay behind the button label and icons.
- Primary orange buttons may darken during the pulse, but the label must remain visible for the full animation.

## Login entry transition

Successful login triggers a short diagonal entry transition before revealing the authenticated app state. It uses orange/ink plates and fine diagonal lines to stay related to the public page and the existing light/dark transition, without reusing the theme toggle effect directly.

Rules:

- Trigger it only after successful login.
- Keep it decorative (`aria-hidden`) and non-blocking (`pointer-events: none`).
- Start with a covered/blurred layer before the authenticated app is visually revealed.
- Skip it when `prefers-reduced-motion: reduce` is active.
- Do not run it on initial session restore; returning users should not get an entry animation just because an existing session was detected.

## Popup messages

Toast notifications are operational status plates, not generic app popups. They should look connected to the diagonal industrial language of the public page, action pulses and login transition.

Rules:

- Keep the current `aria-live="polite"` stack behavior.
- Use a short status label for quick scanning: `OK`, `INFO`, `ALERTA` or `ERROR`.
- Preserve clear text contrast over the dark plate.
- Use the state color for the label, side rail and progress bar, with orange hatch details as brand texture.
- Keep the stack near the top on mobile so it does not fight the bottom navigation.

## Current autoscroll behavior (updated in v3.0.15)

The app keeps autoscrolls only where they reduce field friction:

- Screen change scroll: desktop no longer forces a top jump when changing screens. Mobile still targets the screen banner/shell so the new section starts in view.
- Wizard step scroll: desktop no longer scrolls on every `Nueva calibracion` step change. Mobile still scrolls to the calibration step anchor to keep the active card reachable.
- Equipment edit scroll: when editing an existing scale, the app switches to `Balanzas`; on desktop it scrolls only if the form is not already visible and uses non-smooth behavior, while mobile keeps a smooth move to the form.

Purpose:

- Avoid surprising desktop jumps while preserving mobile guidance.
- Keep the active wizard step visible on field/mobile screens.
- Make edit actions land directly on the form being edited.

## Wizard closure behavior (updated in v4.0.0)

The calibration wizard uses explicit blocking states instead of allowing ambiguous closure:

- Blocking issues include a target step. The guidance panel can jump to the first blocking step, and `Guardar evento` also moves the user there when closure is attempted with missing data.
- Step 5 `Cadena` and Step 6 `Acumulado` show `No requerido` for preventive controls on equipment with previous calibration history.
- Step 4 requires `Factor calibracion actual`. This is the controller factor active before material validation and is the base for the first material pass.
- Step 7 displays the Step 4 factor as the base factor. The first material pass uses it automatically; post-adjustment passes require the factor actually used after the controller change.
- Step 8 presents `Factor final de calibracion` as the controller value that remains loaded when the event is saved.

Purpose:

- Prevent saving events with missing current/final factor data.
- Separate chain-span provisional factor from material-validation factor.
- Make preventive controls shorter without hiding why chain/acumulated checks are skipped.
