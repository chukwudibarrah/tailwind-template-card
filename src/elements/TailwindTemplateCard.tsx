import { render } from "preact";
import { HaCard } from "@components/HaCard";

import { TailwindTemplateRenderer } from "./TailwindTemplateRenderer";
import { initialConfigState } from "@store/ConfigReducer";
import { Action, Binding, TemplateEvent } from "@types";
import { HomeAssistant } from "custom-card-helpers";
import { CONFIG_TYPE } from "@/src/constants";

console.info(
  `%c  Tailwind Template Card  \n%c  Version ${CARD_VERSION}  \n%c  github.com/chukwudibarrah/tailwind-template-card`,
  "color: #2d2c35; font-weight: bold; background: #f5f6f9",
  "color: #aef3fc; font-weight: bold; background: #2d2c35",
  "color: #aef3fc; font-weight: bold; background: #2d2c35",
);

/**
 * Matches entity-id shaped tokens (`domain.object_id`). Used to discover which
 * entities a template / binding / action refers to without scanning the whole
 * state machine on every update.
 */
const ENTITY_ID_PATTERN = /\b[a-z_]+\.[a-z0-9_]+\b/g;

export class TailwindTemplateCard extends TailwindTemplateRenderer {
  _entitiesToWatch: string[] = [];
  _htmlContent: string = "";

  /** Unsubscribe handle for the active `render_template` subscription. */
  _templateUnsub: (() => void) | null = null;
  /** The template string the active subscription was opened for. */
  _subscribedContent: string | null = null;
  /**
   * Incremented on every (re)subscribe so that results arriving from a
   * superseded subscription are discarded instead of clobbering the DOM.
   */
  _subscriptionGeneration = 0;
  /** Entities HA reported the current template actually depends on. */
  _listenerEntities: string[] = [];
  _isConnected = false;

  static getConfigElement() {
    return document.createElement(CONFIG_TYPE);
  }

  static getStubConfig() {
    return initialConfigState;
  }

  connectedCallback() {
    this._isConnected = true;
    // Re-open the subscription that disconnectedCallback tore down.
    if (this._hass && this._config?.content !== undefined) {
      this._render(true);
    }
  }

  disconnectedCallback() {
    this._isConnected = false;
    this.unsubscribeTemplate();
  }

  unsubscribeTemplate() {
    if (this._templateUnsub) {
      try {
        this._templateUnsub();
      } catch (e) {
        console.debug("failed to unsubscribe template", e);
      }
      this._templateUnsub = null;
    }
    this._subscribedContent = null;
  }

  /**
   * Collect the entities this card depends on.
   *
   * Upstream scanned every entity in `hass.states` and string-matched it
   * against the content, which is O(number of entities) per update and misses
   * entities that only appear in `actions`. We instead extract entity-shaped
   * tokens from the config itself and intersect with the state machine, then
   * union with the dependency list HA reports for the rendered template.
   */
  updateEntitiesToWatch() {
    if (!this._hass || !this._config) return;

    const watched = new Set<string>();

    if (this._config.entity) watched.add(this._config.entity);

    if (Array.isArray(this._config.entities)) {
      this._config.entities.forEach((entity: string) => watched.add(entity));
    }

    // Entities HA told us the template depends on — authoritative for Jinja.
    this._listenerEntities.forEach((entity) => watched.add(entity));

    const sources = [
      this._config.content ?? "",
      ...(this._config.bindings ?? []).map((b: Binding) => b.bind ?? ""),
      ...(this._config.actions ?? []).map((a: Action) => a.call ?? ""),
    ].join("\n");

    const matches = sources.match(ENTITY_ID_PATTERN) ?? [];
    for (const candidate of matches) {
      if (this._hass.states[candidate]) watched.add(candidate);
    }

    this._entitiesToWatch = [...watched];
  }

  renderIfNeeded(forceUpdate?: boolean) {
    if (forceUpdate || this.needsRender()) {
      this.processAndRender();
    }
  }

  needsRender() {
    if (!this._hass || !this._oldHass) {
      return true;
    }

    if (this._config.always_update) {
      return true;
    }

    // Home Assistant replaces a state object whenever that entity changes and
    // keeps the same reference when it doesn't, so identity comparison is both
    // correct and far cheaper than a deep equality walk. It can only ever
    // over-report a change, never miss one.
    for (const entity_id of this._entitiesToWatch) {
      if (this._oldHass.states[entity_id] !== this._hass.states[entity_id]) {
        return true;
      }
    }

    return false;
  }

  getCardSize() {
    return 1;
  }

  processAndRender() {
    if (!this._hass || !this._config || this._config.content == undefined)
      return;

    let content = this._config.content;

    if (
      undefined !== this._config.ignore_line_breaks &&
      !this._config.ignore_line_breaks
    ) {
      content = content.replace(/\r?\n|\r/g, "</br>");
    }

    if (!this._config.parse_jinja) {
      this.unsubscribeTemplate();
      this._htmlContent = content;
      this._renderHtmlContent();
      return;
    }

    // HA pushes a new result whenever the template's dependencies change, so
    // one subscription per template string is all we ever need. Re-subscribing
    // on each state change (as upstream did) leaks a subscription per update.
    if (this._templateUnsub && this._subscribedContent === content) {
      // Already subscribed to exactly this template; bindings still need to be
      // reapplied against the latest hass state.
      this.applyBindings();
      return;
    }

    this.subscribeTemplate(content);
  }

  subscribeTemplate(content: string) {
    if (!this._hass) return;

    this.unsubscribeTemplate();

    const generation = ++this._subscriptionGeneration;
    this._subscribedContent = content;

    this._hass.connection
      .subscribeMessage<TemplateEvent>(
        (msg) => {
          // A newer subscription superseded this one while it was opening.
          if (generation !== this._subscriptionGeneration) return;

          if (msg.error) {
            console.error("template error:", msg.error);
            return;
          }

          if (msg.listeners?.entities) {
            this._listenerEntities = msg.listeners.entities;
          }

          this._htmlContent = msg.result ?? "";
          this.updateEntitiesToWatch();
          this._renderHtmlContent();
        },
        {
          type: "render_template",
          template: content,
          report_errors: true,
        },
      )
      .then((unsub) => {
        if (generation !== this._subscriptionGeneration || !this._isConnected) {
          // Superseded or detached before the subscription resolved.
          unsub();
          return;
        }
        this._templateUnsub = unsub;
      })
      .catch((e) => {
        console.error("failed to subscribe to template", e);
        if (generation === this._subscriptionGeneration) {
          this._subscribedContent = null;
        }
      });
  }

  _render(forceRender?: boolean) {
    this.updateEntitiesToWatch();
    this.renderIfNeeded(forceRender);
  }

  async _renderHtmlContent() {
    this.ensureIsReadyForRender();

    // Compile styles before painting so content never flashes unstyled.
    await this.applyStyles(this.candidatesFromHtml(this._htmlContent));

    this._deRender();
    render(
      <HaCard
        htmlContent={this._htmlContent}
        config={this._config}
        onEvent={(e) => this.handleActions(e)}
      />,
      this.shadow,
    );

    this.applyBindings();

    // Bindings may have introduced classes that were not in the source HTML.
    await this.applyStyles(this.candidatesFromDom());
  }

  ensureIsReadyForRender() {
    if (!this._hass) {
      throw new Error("this._hass is invalid");
    }
    if (this._config === undefined) {
      throw new Error("this.config is invalid");
    }
    if (this._config.content === undefined) {
      throw new Error("this.config.content is invalid");
    }
    if (!this.shadow) {
      throw new Error("this.shadow is invalid");
    }
  }

  applyBindings() {
    if (!this._config?.bindings) return;

    this._config.bindings.forEach((binding: Binding) => {
      if (!binding.selector || !binding.bind || !binding.type) return;
      const matches = this.shadow.querySelectorAll(binding.selector);

      matches.forEach((match) => {
        const result = this.resolveBindValue(match, binding.bind);
        const target = match as HTMLElement;
        const targetAsInput = target as HTMLInputElement;

        switch (binding.type) {
          case "text":
            target.innerText = result;
            break;
          case "html":
            target.innerHTML = result;
            break;
          case "class":
            if (result) target.classList.add(result);
            break;
          case "checked":
            targetAsInput.checked = Boolean(result);
            break;
          case "value":
            targetAsInput.value = result;
            break;
          default:
            if (typeof result === "undefined" || "" === `${result}`) {
              target.removeAttribute(binding.type);
            } else {
              target.setAttribute(binding.type, result);
            }
            break;
        }
      });
    });
  }

  handleActions(e: Event) {
    if (!this._config?.actions || !e.target) return;

    const hass = this._hass;
    const config = this._config;
    const entity_id = config.entity;

    if (!hass) return;

    const entity = { ...hass.states[entity_id] } as {
      [key: string]: CallableFunction;
    } & HomeAssistant["states"][string];

    if (entity_id) {
      const [domain] = entity_id.split(".");
      const services = hass.services[domain];
      for (const service in services) {
        entity[service] = (data: object) =>
          hass.callService(domain, service, { entity_id, ...data });
      }
    }

    // Opens Home Assistant's own entity dialog, the way built-in cards do.
    const moreInfo = (entityId?: string) => this.fireMoreInfo(entityId);

    this._config.actions.forEach(({ call, selector, type }: Action) => {
      if (!selector || !call || !type) return;

      const target = e.target as HTMLElement;

      // `closest` rather than `matches` so an action bound to a card/tile
      // still fires when the user taps an icon or label inside it.
      if (type === e.type && target.closest(selector)) {
        const executeCall = new Function(
          "hass",
          "config",
          "entity",
          "moreInfo",
          "event",
          call,
        );
        executeCall.call(
          target.closest(selector),
          hass,
          config,
          entity,
          moreInfo,
          e,
        );
      }
    });
  }

  /**
   * Fires the event Home Assistant listens for to open its entity dialog.
   * Defaults to the card's configured `entity` when none is given.
   */
  fireMoreInfo(entityId?: string) {
    const target = entityId ?? this._config?.entity;
    if (!target) {
      console.warn("moreInfo() needs an entity id (or a configured `entity`)");
      return;
    }

    this.dispatchEvent(
      new CustomEvent("hass-more-info", {
        bubbles: true,
        composed: true,
        detail: { entityId: target },
      }),
    );
  }

  resolveBindValue(element: Element, bind: string) {
    if (!this._hass) return;
    const entity = this._hass.states[this._config.entity];

    try {
      const getState = new Function(
        "hass",
        "config",
        "entity",
        "state",
        "attr",
        bind,
      );
      return getState.call(
        element,
        this._hass,
        this._config,
        entity,
        entity ? entity.state : undefined,
        entity ? entity.attributes : undefined,
      );
    } catch (e) {
      console.log("BINDING --> FAILED", bind);
    }
  }
}
