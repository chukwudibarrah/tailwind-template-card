import { HomeAssistant } from 'custom-card-helpers'
import { render } from 'preact'
import { fulfillWithDefaults } from '@store/ConfigReducer'

import generatedCss from '@/src/index.css?inline'
import { ConfigState } from '@types'
import { CardEvents, dispatchCardEvent } from '@utils/events'
import {
  TailwindEngine,
  extractCandidates,
  ensureAtPropertiesRegistered,
  splitAtProperties
} from '@/src/styles/TailwindEngine'

export abstract class TailwindTemplateRenderer extends HTMLElement {
  _hass: HomeAssistant | undefined
  _oldHass: HomeAssistant | undefined
  _config: ConfigState = {} as ConfigState
  _oldConfig: ConfigState = {} as ConfigState
  shadow: ShadowRoot
  _force_daisyui: boolean = false
  _ignore_broken_config = false
  _rerender_after_set_config = true
  _rerender_after_set_hass = true
  _dispatch_config_setup_event = false

  /** Sheet holding the compiled utilities for the current content. */
  _utilitySheet: CSSStyleSheet | null = null
  /** Entry stylesheet the utility sheet was compiled from. */
  _entryCss: string = ''

  constructor () {
    super()

    this.shadow = this.attachShadow({ mode: 'open' })
  }

  setConfig (config: Partial<ConfigState>) {
    const inSetup = Object.keys(this._oldConfig).length === 0

    this._oldConfig = this._config
    this._config = fulfillWithDefaults(config)

    dispatchCardEvent(CardEvents.CONFIG_RECEIVED, { config })
    if (this._dispatch_config_setup_event && !Object.keys(this._oldConfig).length)
      dispatchCardEvent(CardEvents.CONFIG_SETUP, { config })

    if (inSetup) this.initStylesheets()

    if (!this._oldConfig || this._rerender_after_set_config) this._render(true)
  }

  /**
   * Seeds the shadow root with the card's own build-time stylesheet plus an
   * empty sheet that `applyStyles` fills with compiled utilities.
   *
   * Upstream also copied every `<style>` element out of the document head into
   * each card's shadow root. That duplicated Home Assistant's entire
   * stylesheet per card and let its rules fight the user's utility classes,
   * which is what made backgrounds and borders unstyleable. The shadow root is
   * already isolated, so nothing needs to be copied in.
   */
  initStylesheets () {
    const generatedSheet = new CSSStyleSheet()
    generatedSheet.replaceSync(generatedCss)

    this._utilitySheet = new CSSStyleSheet()

    this.shadow.adoptedStyleSheets = [generatedSheet, this._utilitySheet]
  }

  /** Entry stylesheet implied by the current plugin configuration. */
  get entryCss (): string {
    const daisyui = this._config?.plugins?.daisyui

    return TailwindEngine.buildEntryCss({
      daisyui: this._force_daisyui || Boolean(daisyui?.enabled),
      daisyuiThemes: daisyui?.themes
    })
  }

  /**
   * Compiles the given utility classes and swaps them into the shadow root.
   * Awaited before the DOM is rendered so content never paints unstyled.
   */
  async applyStyles (candidates: string[]) {
    if (!this._utilitySheet) this.initStylesheets()

    const entryCss = this.entryCss
    if (entryCss !== this._entryCss) {
      this._entryCss = entryCss
    }

    try {
      const css = await TailwindEngine.build(entryCss, candidates)

      // `@property` only takes effect at document scope, so those rules are
      // hoisted out before the rest is adopted into the shadow root.
      const { properties, rest } = splitAtProperties(css)
      ensureAtPropertiesRegistered(properties)

      this._utilitySheet?.replaceSync(rest)
    } catch (e) {
      console.error('failed to compile Tailwind styles', e)
    }
  }

  /** Utility classes in the HTML the card is about to render. */
  candidatesFromHtml (html: string): string[] {
    return extractCandidates(html)
  }

  /**
   * Utility classes actually present in the rendered DOM.
   *
   * Bindings can introduce classes that appear nowhere in the source HTML
   * (`type: class`, or markup injected via `type: html`), so the compiled
   * stylesheet is topped up from the live DOM once bindings have run.
   */
  candidatesFromDom (): string[] {
    const found = new Set<string>()

    this.shadow.querySelectorAll('[class]').forEach(element => {
      element.classList.forEach(name => found.add(name))
    })

    return [...found]
  }

  public set hass (hass: HomeAssistant) {
    this._oldHass = this._hass
    this._hass = hass

    window.hass = hass

    if (!this._oldHass || this._rerender_after_set_hass) this._render()
  }

  abstract _render(forceRender?: boolean): void

  _deRender () {
    this.shadow.innerHTML = ''

    render('', this.shadow)
  }
}
