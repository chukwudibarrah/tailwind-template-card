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
import { useCallback, useLayoutEffect, useReducer } from 'preact/hooks'
import { fulfillWithDefaults, initialConfigState } from './configDefaults'

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
   *
   * A layout effect, not a plain one: Preact runs it before `render()`
   * returns, while a plain effect waits for a later frame. The editor element
   * mounts this tree in its constructor and Home Assistant can call
   * `setConfig` straight after, so with a plain effect a config arriving
   * before the first frame was dropped and the editor showed the demo content
   * in place of the card's own — ready to be saved over it.
   */
  useLayoutEffect(() => {
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
