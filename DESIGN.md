# Portfolio Design System

This is the working design brief for Anirudh Pareek's portfolio. Use it as the local source of truth when experimenting with interaction patterns, motion, sound, and content surfaces.

## Direction

The site should feel editorial, tactile, and internet-native. It can borrow the compactness and interaction discipline of references like `0xchsh/portfolio`, but it should not copy the layout, copy, media, or exact visual identity.

## Principles

- Keep the first read expressive and personal. The page should signal Anirudh's world before it explains everything.
- Use progressive detail. Let the homepage stay lean, then reveal depth through work pages, drawers, scroll moments, and media.
- Make interactions physical. Buttons, tabs, cards, and inline objects should respond with tiny movement, haptics, and optional sound.
- Use sound sparingly. Sound is opt-in, short, low-volume, and tied to meaningful actions only.
- Prefer media and artifacts over decorative UI. Real work previews, videos, diagrams, and interface details should carry the personality.
- Avoid generic SaaS polish. No default card stacks, broad purple gradients, oversized marketing hero blocks, or heavy shadow systems.

## Motion

- Default easing: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Entrances should be short and staggered when they help reading order.
- Press states should be immediate: small scale, slight translation, then fast recovery.
- No instant show/hide for interaction surfaces. Fade, slide, or scale with a spatial reason.
- Respect `prefers-reduced-motion`; content must remain readable with motion disabled.

## Haptics

- `tap`: primary buttons, links that act like controls.
- `select`: tabs, toggles, stack flips, drawer triggers.
- `success`: copy email, completed state changes.
- `soft`: passive navigation, hover-adjacent interactions, low-stakes feedback.

Haptics should be additive. Never make a feature depend on vibration support.

## Sound

- Default state: off.
- Use a visible toggle so the visitor opts in.
- Use short synthesized tones instead of media files unless a moment needs a designed audio asset.
- Pair sound with haptics only for intentional actions, not every hover.

## Components To Explore

- Compact sound/haptic control.
- Project drawer for selected work items.
- Work media carousel with a single primary action.
- Copy email row with tactile confirmation.
- Small ambient status elements, only if they match the page tone.

## Anti-Patterns

- Copying another portfolio's content structure wholesale.
- Adding interaction effects that compete with the work.
- Using sound automatically on page load.
- Hiding essential navigation behind novelty.
- Styling every surface as a card.
