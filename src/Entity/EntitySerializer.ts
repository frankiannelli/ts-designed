import {Base} from "./Base";
import {EntityFieldReader} from "./FieldReader";
import {WithoutFunctions} from "./utilityTypes";

type FunctionlessBase = WithoutFunctions<Base>;

export class EntitySerializer<T extends Base> {
  constructor(private instance: T) {}

  mapOut<O extends Object>(
    target: O,
    ...fields: MapOutArgs<WithoutFunctions<T>, WithoutFunctions<O>>
  ): O {
    return this.performMapOut(target, fields as any);
  }

  private performMapOut(target: any, mappings: MapOutArgs<any, any>): any {
    const instance: any = this.instance;
    mappings.forEach((mapping) => {
      if (isSameTypeMap(mapping)) {
        target[mapping] = instance[mapping];
      } else if (isDirectMap(mapping)) {
        const {field, map} = mapping;
        target[field] = map(instance[field]);
      } else if (isIndirectMap(mapping)) {
        const {map, from} = mapping;
        const {with: mapper, to} = map;
        target[to] = mapper(instance[from]);
      }
    });
    return target;
  }

  mapTo<O extends Record<string, any>>(
    mapping: MappedSerializeArgs<T, O>,
    target: Partial<O> = {}
  ): O {
    Object.entries(mapping).forEach(([k, config]) => {
      if (typeof config === "function") {
        (target as any)[k] = config((this.instance as any)[k], this.instance);
      } else if (typeof config === "object") {
        if (config == null) return;
        if (target[k] == null) (target as any)[k] = {};
        this.mapTo<any>(config, target[k]);
      } else if (typeof config === "string") {
        (target as any)[k] = getValue(config, this.instance);
      }
    });
    return target as O;
  }

  asJSON(): AsJsonResult<T> {
    return new EntityFieldReader(this.instance).onlySet().reduce((json, f) => {
      let value: any = (this.instance as any)[f.name];
      if (hasAsJSONMethod(value)) {
        value = (value as any).asJSON();
      } else if (canBeConvertedToJson(value)) {
        value = (value as any).serialize().asJSON();
      }
      json[f.name] = value;
      return json;
    }, {} as any) as any;
  }
}

function isField(f: any): f is MapOutArg<any, any> {
  return isSameTypeMap(f) || isDirectMap(f) || isIndirectMap(f);
}

function isSameTypeMap(f: any): f is string {
  return typeof f === "string";
}

function isDirectMap(f: any): f is MapDirect<any, any, any> {
  return "field" in f && "map" in f;
}

function isIndirectMap(f: any): f is MapIndirect<any, any, any, any> {
  return "from" in f && "map" in f;
}

export type MapOutArgs<
  T extends FunctionlessBase,
  O extends Object
> = MapOutArg<T, O>[];

export type MapOutArg<T extends FunctionlessBase, O extends Object> =
  | SameTypeFields<T, O>
  | MapDirect<T, O, keyof T & keyof O>
  | MapIndirect<T, O, keyof T, keyof O>;

type MapDirect<
  T extends FunctionlessBase,
  O extends Object,
  K extends keyof T & keyof O
> = {
  [MK in keyof T & keyof O]: {
    field: MK;
    map: (from: T[MK]) => O[MK];
  };
}[K];

type MapIndirect<
  T extends FunctionlessBase,
  O extends Object,
  K extends keyof T,
  OK extends keyof O
> = {
  [MK in keyof T]: {
    from: MK;
    map: {
      [MKK in keyof O]: {
        to: OK;
        with: (from: T[MK]) => O[MKK];
      };
    }[OK];
  };
}[K];

type RemoveNever<T> = {
  [K in keyof T]: T[K] extends never ? never : K;
}[keyof T];

type SameTypeFields<T extends FunctionlessBase, O extends Object> = RemoveNever<
  {
    [K in keyof T & keyof O]: T[K] extends O[K] ? K : never;
  }
>;

type AsJsonResult<T extends Base> = {
  [K in keyof WithoutFunctions<T>]: T[K] extends Base
    ? AsJsonResult<T[K]>
    : T[K];
};

type MappedSerializeArgs<T extends Base, O extends Record<string, any>> = {
  [K in keyof WithoutFunctions<O>]?:
    | (O[K] extends Record<string, any> ? MappedSerializeArgs<T, O[K]> : string)
    | ((value: O[K], instance: T) => O[K]);
};

interface ConvertableToJson<T extends Base> {
  serialize: T["serialize"];
}

interface HasAsJSONMethod {
  asJSON(data: any): any;
}

function canBeConvertedToJson<T extends Base>(
  v: any
): v is ConvertableToJson<T> {
  return v && v instanceof Base;
}

function hasAsJSONMethod(v: any): v is HasAsJSONMethod {
  return v && typeof v === "object" && "asJSON" in v;
}

function getValue(path: string, object: unknown): any {
  const value = path
    .replace(/\[/g, ".")
    .replace(/\]/g, "")
    .split(".")
    .reduce((o: any, k: string) => (o || {})[k], object) as unknown;
  if (value && typeof value === "object" && "asJSON" in value) {
    return (value as any).asJSON();
  }
  return value;
}
