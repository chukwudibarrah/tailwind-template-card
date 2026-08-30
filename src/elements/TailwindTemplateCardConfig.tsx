import { render } from 'preact'

import { TailwindTemplateRenderer } from './TailwindTemplateRenderer'
import { fulfillWithDefaults } from '@store/ConfigReducer'
import { ConfigState } from '@types'
import {
  CardEvents,
  dispatchCardEvent,
  registerCardEventHandler,
  unregisterCardEventHandler
} from '@utils/events'
// import { HaCardConfigWrapper } from '@components/HaCardConfigWrapper'
import { ConfigProvider } from '@store/ConfigProvider'
import { HaCardConfig } from '@components/HaCardConfig'
import React from 'preact/compat'

/** Hoisted: building this inside `_render` created a new component type on
 *  every call, which defeats memoisation and forces a full remount. */
const MemoizedCardConfig = React.memo(HaCardConfig)

export class TailwindTemplateCardConfig extends TailwindTemplateRenderer {
  /** Whether the Preact tree is currently mounted into the shadow root. */
  private _mounted = false

  private _onConfigChanged = (e: Event) => {
    // A detached editor must not keep answering for the live one.
    if (!this.isConnected) return
    const detail = (e as CustomEvent).detail
    const config = detail.config as Partial<ConfigState>
    this.configChanged(fulfillWithDefaults(config))
  }

  constructor () {
    super()

    this._force_daisyui = true
    this._ignore_broken_config = true
    this._rerender_after_set_config = false
    this._rerender_after_set_hass = false
    this._dispatch_config_setup_event = true

    // Mounted here, not in connectedCallback: Home Assistant may call
    // setConfig before the element is attached, and the configuration is
    // delivered through an event the mounted tree has to be listening for.
    this._render()
    this._mounted = true
  }

  /*
   * Listeners are bound per connection rather than in the constructor. Home
   * Assistant builds a fresh editor element each time a card's configuration is
   * opened, and a constructor-registered listener on `document` outlives the
   * element — every editor ever opened would keep responding.
   */
  connectedCallback () {
    registerCardEventHandler(CardEvents.CONFIG_CHANGED, this._onConfigChanged)

    if (!this._mounted) {
      this._render()
      this._mounted = true

      // Re-seed the freshly mounted tree with the configuration we already hold.
      if (this._config && Object.keys(this._config).length) {
        dispatchCardEvent(CardEvents.CONFIG_RECEIVED, { config: this._config })
      }
    }
  }

  /*
   * Unmount on disconnect so the tree's effects — notably the CONFIG_RECEIVED
   * subscription — actually run their cleanup. Removing the custom element does
   * not by itself tell Preact to unmount, so each editor session used to leave
   * its listener behind for the lifetime of the page.
   */
  disconnectedCallback () {
    unregisterCardEventHandler(CardEvents.CONFIG_CHANGED, this._onConfigChanged)
    render(null, this.shadow)
    this._mounted = false
  }

  configChanged (newConfig: ConfigState) {
    const event = new CustomEvent('config-changed', {
      bubbles: true,
      composed: true,
      detail: { config: newConfig }
    })

    this.dispatchEvent(event)
  }

  _render () {
    render(
      <ConfigProvider>
        <MemoizedCardConfig />
      </ConfigProvider>,
      this.shadow
    )
  }
}
