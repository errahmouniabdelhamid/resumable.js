/**
 * The underlying base class for ResumableJS. This class is responsible for registering and executing
 * events and listeners.
 */
export default class ResumableEventHandler {
  constructor() {
    this.registeredEventHandlers = {};
  }

  /**
   * Register a new callback for the given event.
   */
  on(event, callback) {
    event = event.toLowerCase();
    if (!this.registeredEventHandlers.hasOwnProperty(event)) {
      this.registeredEventHandlers[event] = [];
    }
    this.registeredEventHandlers[event].push(callback);
  }

  /**
   * Fire the event listeners for the given event with the given arguments as well as the wildcard event '*'
   */
  fire(event, ...args) {
    event = event.toLowerCase();

    this.executeEventCallback(event, ...args);
    this.executeEventCallback('*', event, ...args);
  }

  /**
   * Execute all callbacks for the given event with the provided arguments. This function is only used internally
   * to call all callbacks registered to a given event individually.
   */
  executeEventCallback(event, ...args) {
    if (!this.registeredEventHandlers.hasOwnProperty(event)) return;
    this.registeredEventHandlers[event].forEach((callback) => callback(...args));
  }
}
