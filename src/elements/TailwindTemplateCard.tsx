import { createRef, render } from "preact";
import { Idiomorph } from "idiomorph";
import { HaCard } from "@components/HaCard";

import { TailwindTemplateRenderer } from "./TailwindTemplateRenderer";
import { STUB_CONTENT } from "@store/configDefaults";
import { Action, Binding, ConfigState, TemplateEvent } from "@types";
import { HomeAssistant } from "custom-card-helpers";
import { CONFIG_TYPE } from "@/src/constants";
import { applyLineBreaks, classTokens, compileUserCode } from "@utils/render";

console.info(
  `%c  Tailwind Template Card  \n%c  Version ${CARD_VERSION}  \n%c  github.com/chukwudibarrah/tailwind-template-card`,
  "color: #2d2c35; font-weight: bold; background: #f5f6f9",
  "color: #aef3fc; font-weight: bold; background: #2d2c35",
  "color: #aef3fc; font-weight: bold; background: #2d2c35",
);

const LOG_PREFIX = "[tailwind-template-card]";

/**
 * Matches entity-id shaped tokens (`domain.object_id`). Used to discover which
 * entities a template / binding / action refers to without scanning the whole
 * state machine on every update.
 */
const ENTITY_ID_PATTERN = /\b[a-z_]+\.[a-z0-9_]+\b/g;

const BINDING_PARAMS = ["hass", "config", "entity", "state", "attr"];
const ACTION_PARAMS = ["hass", "config", "entity", "moreInfo", "event"];

/** `hass.themes.darkMode` is newer than the custom-card-helpers typings. */
const isDarkMode = (hass: HomeAssistant | undefined) =>
  Boolean((hass?.themes as { darkMode?: boolean } | undefined)?.darkMode);

/** A selector the user is still typing must not break every other rule. */
const safeQueryAll = (root: ParentNode, selector: string) => {
  try {
    return root.querySelectorAll(selector);
  } catch {
    console.warn(`${LOG_PREFIX} invalid selector, skipped:`, selector);
    return [];
  }
};

const safeClosest = (element: Element, selector: string) => {
  try {
    return element.closest(selector);
  } catch {
    console.warn(`${LOG_PREFIX} invalid selector, skipped:`, selector);
    return null;
  }
};

export class TailwindTemplateCard extends TailwindTemplateRenderer {
  _entitiesToWatch: string[] = [];
  _htmlContent: string = "";
  /** Last template error Home Assistant reported, shown in the card. */
  _templateError: string | null = null;

  /** Unsubscribe handle for the active `render_template` subscription. */
  _templateUnsub: (() => void) | null = null;
  /**
   * The template the current subscription was opened for, from the moment it
   * starts opening — so an update arriving meanwhile doesn't open another.
   */
  _subscribedContent: string | null = null;
  /**
   * Incremented on every (re)subscribe so that results arriving from a
   * superseded subscription are discarded instead of clobbering the DOM.
   */
  _subscriptionGeneration = 0;
  /** Entities HA reported the current template actually depends on. */
  _listenerEntities: string[] = [];
  _isConnected = false;

  /** Incremented per paint, so a slow style compile can't paint stale HTML. */
  _paintGeneration = 0;
  /** The container the content is morphed into. */
  _contentRef = createRef<HTMLDivElement>();
  /**
   * Classes each `class` binding added to each element, keyed by binding
   * index, so the binding's next value replaces its last one instead of
   * piling up beside it.
   */
  _boundClasses = new WeakMap<Element, Map<number, string[]>>();

  static getConfigElement() {
    return document.createElement(CONFIG_TYPE);
  }

  /** Only the content: every other option is written once it's changed. */
  static getStubConfig() {
    return { content: STUB_CONTENT };
  }

  /** Sizing in sections dashboards. Height follows the content. */
  getGridOptions() {
    return { columns: 12, min_columns: 3, rows: "auto" };
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

  /**
   * `forceRender` comes from `setConfig` and reconnection, where options other
   * than the content may have changed — `bare`, the theme — so the card is
   * repainted even when the template is the same. A switch of Home
   * Assistant's dark mode repaints for the same reason.
   */
  _render(forceRender?: boolean) {
    this.updateEntitiesToWatch();

    const themeChanged =
      Boolean(this._oldHass) &&
      isDarkMode(this._oldHass) !== isDarkMode(this._hass);

    if (forceRender || themeChanged) {
      this.processAndRender(true);
    } else if (this.needsRender()) {
      this.processAndRender(false);
    }
  }

  getCardSize() {
    return 1;
  }

  processAndRender(repaint = false) {
    if (!this._hass || !this._config || this._config.content == undefined)
      return;

    const content = this._config.content;

    if (!this._config.parse_jinja) {
      this.unsubscribeTemplate();
      this._templateError = null;
      this._htmlContent = this.withLineBreaks(content);
      this._paint();
      return;
    }

    // HA pushes a new result whenever the template's dependencies change, so
    // one subscription per template string is all we ever need. Re-subscribing
    // on each state change (as upstream did) leaks a subscription per update.
    if (this._subscribedContent === content) {
      if (repaint) {
        this._paint();
      } else {
        // Only bindings can depend on state HA hasn't pushed a new render for.
        this.refreshBindings();
      }
      return;
    }

    this.subscribeTemplate(content);
  }

  withLineBreaks(html: string) {
    return this._config.ignore_line_breaks === false
      ? applyLineBreaks(html)
      : html;
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
            // Warnings (an undefined variable, say) still render; HA sends
            // the result separately.
            if (msg.level === "WARNING") {
              console.warn(`${LOG_PREFIX} template warning:`, msg.error);
              return;
            }
            console.error(`${LOG_PREFIX} template error:`, msg.error);
            this._templateError = msg.error;
            this._paint();
            return;
          }

          if (msg.listeners?.entities) {
            this._listenerEntities = msg.listeners.entities;
          }

          this._templateError = null;
          this._htmlContent = this.withLineBreaks(msg.result ?? "");
          this.updateEntitiesToWatch();
          this._paint();
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
        console.error(`${LOG_PREFIX} failed to subscribe to template`, e);
        if (generation === this._subscriptionGeneration) {
          this._subscribedContent = null;
          // A template that doesn't parse is rejected here rather than
          // reported through the subscription.
          this._templateError =
            (e as { message?: string })?.message ?? String(e);
          this._paint();
        }
      });
  }

  /**
   * Brings the shadow root up to date with `_htmlContent` and the config.
   *
   * The content is morphed into place rather than replaced, so elements that
   * didn't change keep their identity — focus, a slider mid-drag, a running
   * transition — and anything else in the shadow root is left alone.
   */
  async _paint() {
    if (!this._hass || !this._config || !this.shadow) return;

    const generation = ++this._paintGeneration;

    try {
      // Compile styles before painting so content never flashes unstyled.
      await this.applyStyles(this.candidatesFromHtml(this._htmlContent));
      if (generation !== this._paintGeneration) return;

      render(
        <HaCard
          config={this._config}
          darkMode={isDarkMode(this._hass)}
          error={this._templateError}
          contentRef={this._contentRef}
          onEvent={(e) => this.handleActions(e)}
        />,
        this.shadow,
      );

      const container = this._contentRef.current;
      if (container) this.morphContent(container, this._htmlContent);

      this.applyBindings();

      // Bindings may have introduced classes that were not in the source HTML.
      await this.applyStyles(this.candidatesFromDom());
    } catch (e) {
      console.error(`${LOG_PREFIX} render failed`, e);
    }
  }

  morphContent(container: HTMLElement, html: string) {
    const shadow = this.shadow;
    Idiomorph.morph(container, html, {
      morphStyle: "innerHTML",
      callbacks: {
        // Idiomorph's own `ignoreActiveValue` compares against
        // `document.activeElement`, which is this card's host whenever focus
        // is inside it. The shadow root knows the real one.
        beforeAttributeUpdated: (attribute, element) =>
          !(
            (attribute === "value" || attribute === "checked") &&
            element === shadow.activeElement
          ),
      },
    });
  }

  /**
   * Re-applies bindings after a state change with no new template render, and
   * compiles any class they introduce for the first time — which this path
   * used to skip, leaving such classes unstyled.
   */
  async refreshBindings() {
    try {
      this.applyBindings();
      await this.applyStyles(this.candidatesFromDom());
    } catch (e) {
      console.error(`${LOG_PREFIX} binding refresh failed`, e);
    }
  }

  applyBindings() {
    if (!this._config?.bindings) return;

    this._config.bindings.forEach((binding: Binding, index: number) => {
      if (!binding?.selector || !binding.bind || !binding.type) return;

      safeQueryAll(this.shadow, binding.selector).forEach((match) => {
        const result = this.resolveBindValue(match, binding);
        this.applyBinding(match as HTMLElement, binding.type, result, index);
      });
    });
  }

  applyBinding(
    target: HTMLElement,
    type: string,
    result: unknown,
    index: number,
  ) {
    const targetAsInput = target as HTMLInputElement;

    switch (type) {
      case "text":
        // textContent, unlike innerText, doesn't force a layout.
        target.textContent = result == null ? "" : String(result);
        break;
      case "html":
        target.innerHTML = result == null ? "" : String(result);
        break;
      case "class":
        this.swapBoundClasses(target, index, classTokens(result));
        break;
      case "checked":
        targetAsInput.checked = Boolean(result);
        break;
      case "value":
        targetAsInput.value = result == null ? "" : String(result);
        break;
      default:
        if (typeof result === "undefined" || "" === `${result}`) {
          target.removeAttribute(type);
        } else {
          target.setAttribute(type, String(result));
        }
        break;
    }
  }

  /**
   * Replaces the classes a binding added last time with its current ones.
   *
   * Classes the element already carried from the markup are never recorded
   * as the binding's, so a binding can't strip them when its value changes.
   */
  swapBoundClasses(target: Element, index: number, next: string[]) {
    const byBinding =
      this._boundClasses.get(target) ?? new Map<number, string[]>();
    const previous = byBinding.get(index) ?? [];

    previous
      .filter((name) => !next.includes(name))
      .forEach((name) => target.classList.remove(name));

    const added = next.filter(
      (name) => previous.includes(name) || !target.classList.contains(name),
    );
    if (next.length) target.classList.add(...next);

    byBinding.set(index, added);
    this._boundClasses.set(target, byBinding);
  }

  handleActions(e: Event) {
    if (!this._config?.actions || !(e.target instanceof Element)) return;

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

    const target = e.target;

    this._config.actions.forEach(({ call, selector, type }: Action) => {
      if (!selector || !call || !type || type !== e.type) return;

      // `closest` rather than `matches` so an action bound to a card/tile
      // still fires when the user taps an icon or label inside it.
      const match = safeClosest(target, selector);
      if (!match) return;

      // One failing action mustn't stop the others, and its error should say
      // which action it came from.
      const report = (error: unknown) =>
        console.error(
          `${LOG_PREFIX} ${type} action on "${selector}" failed:`,
          error,
        );

      try {
        const result = compileUserCode(ACTION_PARAMS, call).call(
          match,
          hass,
          config,
          entity,
          moreInfo,
          e,
        );
        if (result instanceof Promise) result.catch(report);
      } catch (error) {
        report(error);
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

  resolveBindValue(element: Element, binding: Binding): unknown {
    if (!this._hass) return;
    const config: ConfigState = this._config;
    const entity = this._hass.states[config.entity];

    try {
      return compileUserCode(BINDING_PARAMS, binding.bind).call(
        element,
        this._hass,
        config,
        entity,
        entity ? entity.state : undefined,
        entity ? entity.attributes : undefined,
      );
    } catch (e) {
      console.warn(
        `${LOG_PREFIX} ${binding.type} binding on "${binding.selector}" failed:`,
        e,
      );
    }
  }
}
