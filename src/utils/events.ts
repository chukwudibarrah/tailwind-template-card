export enum CardEvents {
  CONFIG_RECEIVED = 'tailwind-template-card-config-received',
  CONFIG_CHANGED = 'tailwind-template-card-config-changed',
  CONFIG_SETUP = 'tailwind-template-card-config-setup'
}

export const dispatchCardEvent = (
  event: CardEvents,
  detail: CustomEventInit['detail']
) => {
  const eventInitOptions: CustomEventInit = {
    bubbles: true,
    composed: true,
    detail
  }
  document.dispatchEvent(new CustomEvent(event, eventInitOptions))
}

export const registerCardEventHandler = (
  event: CardEvents,
  callback: Parameters<typeof document.addEventListener>[1]
) => {
  document.addEventListener(event, callback)
}
