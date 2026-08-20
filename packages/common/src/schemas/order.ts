import { ORDER_STATUSES, type Order, type OrderStatus } from "../types/index.js";

export interface ValidationIssue {
  readonly path: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const validateOrderLine = (line: unknown, path: string): ValidationIssue[] => {
  if (!isRecord(line)) {
    return [{ path, message: "line must be an object." }];
  }
  const issues: ValidationIssue[] = [];
  if (typeof line.productId !== "string" || line.productId.length === 0) {
    issues.push({ path: `${path}.productId`, message: "productId must be a non-empty string." });
  }
  if (typeof line.name !== "string" || line.name.length === 0) {
    issues.push({ path: `${path}.name`, message: "name must be a non-empty string." });
  }
  if (typeof line.quantity !== "number" || !Number.isInteger(line.quantity) || line.quantity <= 0) {
    issues.push({ path: `${path}.quantity`, message: "quantity must be a positive integer." });
  }
  if (typeof line.unitPriceMinor !== "number" || !Number.isInteger(line.unitPriceMinor)) {
    issues.push({
      path: `${path}.unitPriceMinor`,
      message: "unitPriceMinor must be an integer amount in minor units.",
    });
  }
  return issues;
};

export const isOrderStatus = (value: unknown): value is OrderStatus =>
  typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);

/**
 * Dependency-free structural validator for Order payloads crossing the
 * client/server boundary. A real schema library can replace the internals
 * later without changing this public signature.
 */
export const validateOrder = (input: unknown): ValidationResult<Order> => {
  const issues: ValidationIssue[] = [];
  if (!isRecord(input)) {
    return { ok: false, issues: [{ path: "", message: "Order must be an object." }] };
  }
  if (typeof input.id !== "string" || input.id.length === 0) {
    issues.push({ path: "id", message: "id must be a non-empty string." });
  }
  if (typeof input.locationId !== "string" || input.locationId.length === 0) {
    issues.push({ path: "locationId", message: "locationId must be a non-empty string." });
  }
  if (!isOrderStatus(input.status)) {
    issues.push({
      path: "status",
      message: `status must be one of: ${ORDER_STATUSES.join(", ")}.`,
    });
  }
  if (!Array.isArray(input.lines)) {
    issues.push({ path: "lines", message: "lines must be an array." });
  } else {
    input.lines.forEach((line: unknown, index: number) => {
      issues.push(...validateOrderLine(line, `lines[${String(index)}]`));
    });
  }
  if (typeof input.currency !== "string" || input.currency.length !== 3) {
    issues.push({ path: "currency", message: "currency must be a 3-letter ISO 4217 code." });
  }
  if (typeof input.createdAt !== "number" || !Number.isFinite(input.createdAt)) {
    issues.push({ path: "createdAt", message: "createdAt must be epoch milliseconds." });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: input as unknown as Order };
};
