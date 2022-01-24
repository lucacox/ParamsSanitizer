import { Request } from 'express';

export interface ParamsDefinition {
  name: string;
  type: 'string' | 'number' | 'object' | 'date' | 'boolean';
  isArray?: boolean;
  elementsDivider?: string;
  default?: unknown;
  required?: boolean;
  in: 'query' | 'path' | 'body';
  properties?: ParamsDefinition[]
}

export interface CheckResult {
  status: boolean;
  unknown: {
    where: string;
    params: string[];
  }[];
  missing: {
    where: string;
    params: string[];
  }[];
  malformed: {
    where: string;
    params: string[];
  }[];
}

export interface ValueResult {
  query: Record<string, unknown>;
  path: Record<string, unknown>;
  body: Record<string, unknown>;
}

export interface ParamsSanitizerOptions {
  strict?: boolean;
}

const defaultParamsValues = {
  name: '',
  type: 'string',
  isArray: false,
  elementsDivider: ',',
  default: null,
  required: false,
  in: 'query'
}

export class ParamsSanitizer {
  private definitions: ParamsDefinition[];
  private defaultOptions: ParamsSanitizerOptions = {
    strict: false
  };

  constructor(data: ParamsDefinition[], private options: ParamsSanitizerOptions = {}) {
    this.options = Object.assign(this.defaultOptions, options);
    this.definitions = data.map(d => Object.assign({}, defaultParamsValues, d));
  }

  check(req: Request, parent?: { name: string, def: ParamsDefinition[] }): CheckResult {
    let definitions = this.definitions;
    if (parent) {
      definitions = parent.def;
    }
    const path = parent ? parent.name + '.' : '';

    // check for required params in query, params and body
    const keysQ = Object.keys(req.query || {});
    const keysP = Object.keys(req.params || {});
    const keysB = Object.keys(req.body || {});
    const missing: { where: string, params: string[] }[] = [];
    [keysQ, keysP, keysB].forEach((keys, i) => {
      const where = i == 0 ? 'query' : (i === 1 ? 'path' : 'body');
      const required = definitions.filter(d => d.in === where).filter(d => d.required).map(d => d.name);
      const present = required.map(r => keys.includes(r));
      missing.push({ where, params: required.filter((_, i) => !present[i]).map(p => path + p) });
    });

    const unknown: { where: string, params: string[] }[] = [{ where: 'query', params: [] }, { where: 'path', params: [] }, { where: 'body', params: [] }];
    const malformed: { where: string, params: string[] }[] = [{ where: 'query', params: [] }, { where: 'path', params: [] }, { where: 'body', params: [] }];
    [req.query || {}, req.params || {}, req.body || {}].forEach((params: Record<string, unknown>, i) => {
      const where = i == 0 ? 'query' : (i === 1 ? 'path' : 'body');

      Object.keys(params).forEach(name => {

        const def = definitions.filter(d => d.in === where).find(d => d.name === name);
        if (!def) {
          if (this.options.strict) {
            unknown.find(u => u.where === where)?.params.push(path + name);
          }
          return;
        }

        if (missing.find(m => m.where === where && m.params.includes(path + name))) {
          return;
        }

        if (def.type === 'number') {
          if (def.isArray) {
            const values = (params[name] as string).split(def.elementsDivider as string);
            if (!values.reduce((acc, v) => acc && !isNaN(+v), true)) {
              malformed.find(u => u.where === where)?.params.push(path + name);
              return;
            }
          } else {
            if (isNaN(+(params[name] as string))) {
              malformed.find(u => u.where === where)?.params.push(path + name);
              return;
            }
          }
        }
        if (def.type === 'date') {
          const d = new Date(params[name] as string);
          if (isNaN(d.getTime())) {
            malformed.find(u => u.where === where)?.params.push(path + name);
            return;
          }
        }
        if (def.type === 'boolean') {
          if (!['true', 'false', '0', '1', 0, 1, true, false].includes(params[name] as string)) {
            malformed.find(u => u.where === where)?.params.push(path + name);
            return;
          }
        }

        if (def.type === 'object') {
          if (def.properties) {
            const fakeReq = {} as Request;
            fakeReq[def.in] = JSON.parse(params[name] as string) as unknown;
            const status = this.check(fakeReq, { name: name, def: (def.properties) });
            if (!status.status) {
              missing.push(...status.missing);
              malformed.push(...status.malformed);
              unknown.push(...status.unknown);
              return;
            }
          }
        }
      });
    });

    const missingAny = missing.map(m => m.params.length).filter(m => m > 0);
    const unknownAny = unknown.map(m => m.params.length).filter(m => m > 0);
    const malformedAny = malformed.map(m => m.params.length).filter(m => m > 0);

    return { status: !(missingAny.length > 0 || unknownAny.length > 0 || malformedAny.length > 0), unknown, missing, malformed };
  }

  values(req: Request): ValueResult {
    const obj: ValueResult = {
      query: {} as Record<string, unknown>,
      path: {} as Record<string, unknown>,
      body: {} as Record<string, unknown>,
    };

    this.definitions.forEach(def => {
      const p = def.in === 'query' ?
        (req.query as Record<string, unknown>) :
        (def.in === 'path' ?
          (req.params as Record<string, unknown>) :
          (req.body as Record<string, unknown>));
      const value = this.parseValue(p[def.name], def);
      if (value != undefined) {
        obj[def.in][def.name] = value;
      }
    });

    return obj;
  }

  private parseValue(value: unknown, def: ParamsDefinition): unknown {
    // console.log('parsing value for', def.name, value, def.default);
    if (value == null) {
      return def.default;
    }

    if (def.type === 'number') {
      if (def.isArray) {
        const values = (value as string).split(def.elementsDivider as string);
        return values.map(v => +v);
      } else {
        return +(value as string);
      }
    } else if (def.type === 'date') {
      return new Date(value as string);

    } else if (def.type === 'boolean') {
      if (def.isArray) {
        const values = (value as string).split(def.elementsDivider as string);
        return values.map(v => ['true', 1, '1'].includes(v));
      } else {
        return [true, 'true', 1, '1'].includes(value as string | number);
      }
    } else if (def.type === 'object') {
      const objValue = (typeof (value) == 'string' ? JSON.parse(value) : value) as Record<string, unknown>;
      for (const ddef of def.properties || []) {
        const val = objValue[ddef.name];
        objValue[ddef.name] = this.parseValue(val, ddef);
      }
      return objValue;
    } else {
      if (def.isArray) {
        return (value as string).split(def.elementsDivider as string);
      }
      return value;
    }
  }
}
