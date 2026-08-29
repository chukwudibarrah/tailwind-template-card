if (import.meta.env.DEV) {
  await import('preact/debug')
}
import { TailwindTemplateCard } from './elements/TailwindTemplateCard.tsx'
import { TailwindTemplateCardConfig } from './elements/TailwindTemplateCardConfig.tsx'
import { CARD_TYPE, CONFIG_TYPE, LEGACY_CARD_TYPE } from './constants.ts'

customElements.define(CARD_TYPE, TailwindTemplateCard)
customElements.define(CONFIG_TYPE, TailwindTemplateCardConfig)

/**
 * Keep the upstream card type working.
 *
 * Dashboards written against `usernein/tailwindcss-template-card` — and every
 * community example — use `custom:tailwindcss-template-card`. Registering an
 * alias means those configs keep rendering after switching to this fork.
 * A custom element constructor can only be registered under one name, hence
 * the subclass. Guarded so it never fights the original card if both happen to
 * be installed.
 */
if (!customElements.get(LEGACY_CARD_TYPE)) {
  class LegacyTailwindTemplateCard extends TailwindTemplateCard {}
  customElements.define(LEGACY_CARD_TYPE, LegacyTailwindTemplateCard)
}

// Only the current type is offered in the card picker.
window.customCards.push({
  type: CARD_TYPE,
  name: 'Tailwind Template Card',
  description: 'Write HTML with Tailwind CSS classes and Jinja templates',
  preview: true
})
