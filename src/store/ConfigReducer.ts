import {
  ConfigActionTypes,
  ConfigReducerAction,
  ConfigState
} from '@types'
import {
  CardEvents,
  dispatchCardEvent,
  registerCardEventHandler,
  unregisterCardEventHandler
} from '@utils/events'
import { useCallback, useEffect, useReducer } from 'preact/hooks'

export const ConfigReducer = (
  state: ConfigState,
  action: ConfigReducerAction
) => {
  if (action.action_type == ConfigActionTypes.SET_CONFIG) {
    const newConfig = { ...state, ...action.payload } as ConfigState

    if (action.dispatch_event) {
      dispatchCardEvent(CardEvents.CONFIG_CHANGED, { config: newConfig })
    }

    return newConfig
  } else {
    return state
  }
}

export const defaultConfigState: ConfigState = {
  entity: '',
  content: '',
  ignore_line_breaks: true,
  always_update: false,
  bare: false,
  parse_jinja: true,
  entities: [],
  bindings: [],
  actions: [],
  debounceChangePeriod: 100,
  plugins: {
    daisyui: {
      enabled: true,
      theme: 'dark - dark',
      themes: 'light --default, dark --prefersdark',
      overrideCardBackground: false
    },
    tailwindElements: {
      enabled: false
    }
  }
}

export const fulfillWithDefaults = (config: Partial<ConfigState>) => {
  return { ...defaultConfigState, ...config } as ConfigState
}

export const initialConfigState: ConfigState = {
  ...defaultConfigState,
  content: `<div class="flex flex-row gap-2 justify-center">
  {% for color in ["primary", "secondary", "accent", "info", "warning", "error", "info"] %}
    <div class="w-12 h-12 bg-{{color}} rounded-lg cursor-pointer hover:translate-y-2 transition-all animate-bounce hover:animate-spin"></div>
  {% endfor %}
</div>`
}

export const useConfigReducer = () => {
  const [state, dispatch] = useReducer(ConfigReducer, initialConfigState)

  const updateConfig = useCallback(
    (config: Partial<ConfigState>, dispatch_event: boolean = true) => {
      dispatch({
        action_type: ConfigActionTypes.SET_CONFIG,
        dispatch_event,
        payload: config
      })
    },
    []
  )

  /*
   * Registered once, and removed on unmount.
   *
   * This previously ran on every render against `document`, with no cleanup, so
   * each render added another listener. Home Assistant answers `config-changed`
   * by calling `setConfig` straight back, which fires CONFIG_RECEIVED — every
   * accumulated listener then dispatched an update, causing another render and
   * another listener. The editor degraded with each keystroke until the page
   * was reloaded.
   */
  useEffect(() => {
    const onConfigReceived = (e: Event) => {
      const config = (e as CustomEvent).detail.config as ConfigState
      updateConfig(fulfillWithDefaults(config), false)
    }

    registerCardEventHandler(CardEvents.CONFIG_RECEIVED, onConfigReceived)
    return () =>
      unregisterCardEventHandler(CardEvents.CONFIG_RECEIVED, onConfigReceived)
  }, [updateConfig])

  return {
    config: state,
    updateConfig
  }
}
