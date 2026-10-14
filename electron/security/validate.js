import { ValidationError } from "./errors.js";

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const v = {
  obj(x, name = "payload") {
    if (x === null || typeof x !== "object" || Array.isArray(x)) {
      throw new ValidationError(`${name} must be an object`);
    }
    return x;
  },

  id(x, name = "id") {
    if (typeof x !== "string" || !ID_RE.test(x))
      throw new ValidationError(`${name} is not a valid id`);

    return x;
  },

  optId(x, name = "id") {
    return x === undefined || x === null ? null : v.id(x, name);
  },

  str(x, { name = "value", min = 0, max = 1000, trim = false } = {}) {
    if (typeof x !== "string")
      throw new ValidationError(`${name} must be a string`);

    const s = trim ? x.trim() : x;
    if (s.length < min) throw new ValidationError(`${name} is too short`);
    if (s.length > max)
      throw new ValidationError(`${name} is too long (max ${max} characters)`);
    return s;
  },
  bool(x, name = "value") {
    if (typeof x !== "boolean")
      throw new ValidationError(`${name} must be true or false`);

    return x;
  },
  int(
    x,
    {
      name = "value",
      min = Number.MIN_SAFE_INTEGER,
      max = Number.MAX_SAFE_INTEGER,
    } = {},
  ) {
    if (!Number.isInteger(x) || x < min || x > max) {
      throw new ValidationError(
        `${name} must be an integer between ${min} and ${max}`,
      );
    }
    return x;
  },

  oneOf(x, allowed, name = "value") {
    if (!allowed.includes(x))
      throw new ValidationError(
        `${name} must be one of: ${allowed.join(", ")}`,
      );
    return x;
  },

  arr(x, { name = "list", max = 1000 } = {}) {
    if (!Array.isArray(x)) throw new ValidationError(`${name} must be a list`);
    if (x.length > max)
      throw new ValidationError(`${name} has too many items (max ${max})`);
    return x;
  },
};


// spec = { title: (x) => v.str(x, {...}), pinned: (x) => v.bool(x) }
export function validatePatch(patch, spec, name = 'patch') {
  v.obj(patch, name);
  const out = {};
  for (const key of Object.keys(patch)) {
    if (!Object.prototype.hasOwnProperty.call(spec, key)) {
      throw new ValidationError(`Unknown field "${key}"`);
    }
    out[key] = spec[key](patch[key]);
  }
  return out;
}