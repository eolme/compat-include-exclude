export type FilterPatternFunctional =
  (this: any, value: string) => boolean;

export type FilterPatternCallable = {
  call: (this: any, self: any, value: string) => boolean;
};

export type FilterPatternTestable = {
  test: FilterPatternFunctional;
};

type FilterPatternFlat =
  string |
  RegExp |
  FilterPatternFunctional |
  FilterPatternCallable |
  FilterPatternTestable |
  null |
  undefined;

type FilterPatternIterable = ArrayLike<FilterPatternFlat | FilterPatternIterable>;

export type FilterPattern = ((FilterPatternFlat | FilterPatternIterable) & {}) | null | undefined;

export type Filter = (input: unknown) => boolean;

type InternalFilter = (input: string) => boolean;

type InternalCallable = FilterPatternFunctional | FilterPatternCallable;

const isCallable = (filter: FilterPattern): filter is InternalCallable => {
  const maybeCallable = filter as InternalCallable;

  return maybeCallable != null && (typeof maybeCallable === 'function' || (typeof maybeCallable === 'object' && typeof maybeCallable.call === 'function'));
};

type InternalTestable = RegExp | FilterPatternTestable;

const isTestable = (filter: FilterPattern): filter is InternalTestable => {
  const maybeTestable = filter as InternalTestable;

  return maybeTestable != null && typeof maybeTestable === 'object' && isCallable(maybeTestable.test);
};

const isIterable = (filter: FilterPattern): filter is FilterPatternIterable => {
  const maybeIterable = filter as FilterPatternIterable;

  return maybeIterable != null && typeof maybeIterable === 'object' && typeof maybeIterable.length === 'number';
};

const MODE = /*  */ 0b11111;

/**
 * @example
 *   FilterMode.EVERY | FilterMode.START === FilterMode.EVERY_START
 */
export enum FilterMode {
  EXACT = /*      */ 0b00001,
  START = /*      */ 0b00010,
  END = /*        */ 0b00100,

  SOME = /*       */ 0b01000,
  EVERY = /*      */ 0b10000,

  SOME_EXACT = /* */ SOME | EXACT,
  SOME_START = /* */ SOME | START,
  SOME_END = /*   */ SOME | END,

  EVERY_EXACT = /**/ EVERY | EXACT,
  EVERY_START = /**/ EVERY | START,
  EVERY_END = /*  */ EVERY | END,
}

export type FilterOptions = {
  include?: FilterMode | (number & {}) | null | undefined;
  exclude?: FilterMode | (number & {}) | null | undefined;
};

const check = (mode: number, bit: FilterMode) => (mode & bit) === bit;

const buildFilter = (
  filter: FilterPattern,
  mode: number,
  fallback: () => boolean
): InternalFilter => {
  if (
    typeof filter === 'string' &&
    filter.length > 0
  ) {
    return (input) =>
      (check(mode, FilterMode.EXACT) && input === filter) ||
      (check(mode, FilterMode.START) && input.startsWith(filter)) ||
      (check(mode, FilterMode.END) && input.endsWith(filter));
  }

  if (isTestable(filter)) {
    // eslint-disable-next-line no-useless-call
    return (input) => filter.test.call(filter, input);
  }

  if (isCallable(filter)) {
    return (input) => filter.call(filter, input);
  }

  if (
    isIterable(filter) &&
    filter.length > 0
  ) {
    const filters = Array.from(filter, (partial) => buildFilter(partial, mode, fallback));

    return (input) =>
      (check(mode, FilterMode.SOME) && filters.some((partial) => partial(input))) ||
      (check(mode, FilterMode.EVERY) && filters.every((partial) => partial(input)));
  }

  return fallback;
};

const extractMode = (
  options: FilterOptions | null | undefined,
  name: 'include' | 'exclude'
) => {
  if (
    options != null &&
    typeof options === 'object' &&
    name in options
  ) {
    let mode = (options[name] as number) & MODE;

    if (
      !(
        check(mode, FilterMode.EXACT) ||
        check(mode, FilterMode.START) ||
        check(mode, FilterMode.END)
      )
    ) {
      mode |= FilterMode.EXACT;
    }

    if (
      !(
        check(mode, FilterMode.SOME) ||
        check(mode, FilterMode.EVERY)
      )
    ) {
      mode |= FilterMode.SOME;
    }

    return mode;
  }

  return FilterMode.SOME_EXACT;
};

const filterInclude = () => true;
const filterExclude = () => false;

/**
 * Constructs a filter function which can be used to determine whether or not
 * certain input should be operated upon.
 *
 * @param {FilterPattern} include - If `include` is omitted or has zero length, filter will return `true` by default.
 * @param {FilterPattern} exclude - Input must not match any of the `exclude` patterns.
 * @param {FilterOptions | null | undefined} options - Bit flags to configure the filter behaviour.
 */
export const createFilter = (
  include?: FilterPattern,
  exclude?: FilterPattern,
  options?: FilterOptions | null | undefined
): Filter => {
  const includeFilter = buildFilter(include, extractMode(options, 'include'), filterInclude);
  const excludeFilter = buildFilter(exclude, extractMode(options, 'exclude'), filterExclude);

  return (input: unknown) =>
    typeof input === 'string' && includeFilter(input) && !excludeFilter(input);
};
