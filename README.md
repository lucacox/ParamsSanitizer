# ParamsSanitizer
HTTP request params/query/body sanitizer

## Param Definition

```typescript
interface ParamsDefinition {
  name: string;
  type: 'string' | 'number' | 'object' | 'date' | 'boolean';
  isArray?: boolean;
  elementsDivider?: string;
  default?: unknown;
  required?: boolean;
  in: 'query' | 'path' | 'body';
  properties?: ParamsDefinition[]
}
```
Where:
* **name**: is the param name
* **type**: the param type
* **isArray**: if the param is a string representing a token separated list of values
* **elemntsDivider**: if param is an array, this is the separator token (default: ',')
* **default**: if params is not required, this is the default value (if not specified default value is null)
* **required**: tell if the param is mandatory
* **in**: where to find the param (can be: 'query', 'path' or 'body')
* **properties**: if type is 'object' here you can define object properties as ParamDefinition entries

## Options

```typescript
interface ParamsSanitizerOptions {
  strict?: boolean;
}
```

* **strict**: raise an error if a param not defined is found

## Check Return Object

```typescript
interface CheckResult {
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
```

## Values Return Object

```typescript
interface ValueResult {
  query: Record<string, unknown>;
  path: Record<string, unknown>;
  body: Record<string, unknown>;
}
```



## Examples

### Sanitize query string

...?param1=fizz&param2=4&param3=buzz

where param1 and param3 are required, param2 is optional and other params are forbidden.

```typescript
...
const sanitizer = new ParamsSanitizer([
  {
    "name": "param1",
    "in": "query",
    "required": true,
    "type": "string"
  },
  {
    "name": "param2",
    "in": "query",
    "required": false,
    "type": "number"
  },
  {
    "name": "param3",
    "in": "query",
    "required": true,
    "type": "string"
  }
  
], {strict: true});
const paramsOk = sanitizer.check(req);
if (!params.status) {
  // return an 400 error
}
const { query } = sanitizer.values(req) as {
  param1: string;
  param2?: number;
  param3: string;
};

```
