/**
 * Accepted shape for client-supplied correlation headers (`x-request-id`,
 * `x-correlation-id`). Values outside this shape are replaced with generated
 * ids, keeping logs and forwarded headers injection-free.
 */
export const SAFE_HEADER_ID_PATTERN = /^[\w.-]{1,128}$/;
