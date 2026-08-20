export type Messages = Readonly<Record<string, string>>;

export interface Translator {
  readonly t: (key: string, params?: Readonly<Record<string, string>>) => string;
}

/**
 * Minimal, dependency-free translator. Messages are injected (never loaded from
 * the environment) so the function is isomorphic and tree-shakable: consumers
 * import exactly the locale modules they use.
 */
export const createTranslator = (messages: Messages): Translator => {
  const t = (key: string, params?: Readonly<Record<string, string>>): string => {
    const template = messages[key];
    if (template === undefined) return key;
    if (params === undefined) return template;
    return template.replaceAll(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
  };
  return { t };
};
