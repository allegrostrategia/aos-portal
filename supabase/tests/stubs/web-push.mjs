/**
 * Stands in for `web-push`.
 *
 * Records every notification that would have gone to a push service, so a
 * test can assert who was sent what. `failEndpointsWith` makes chosen
 * endpoints answer with a status, for the expiry path.
 */
let outbox = [];
let failures = new Map();

export function reset() {
  outbox = [];
  failures = new Map();
}
export function pushed() {
  return outbox;
}
export function failEndpointsWith(endpoint, statusCode) {
  failures.set(endpoint, statusCode);
}

const webPush = {
  setVapidDetails() {},
  async sendNotification(subscription, payload) {
    const status = failures.get(subscription.endpoint);
    if (status) {
      const error = new Error(`push service said ${status}`);
      error.statusCode = status;
      throw error;
    }
    outbox.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
    return { statusCode: 201 };
  },
};

export default webPush;
